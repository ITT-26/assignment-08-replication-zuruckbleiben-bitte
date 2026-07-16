"""OpenCV demo application for Visual TwinPads."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import sys
import time
from typing import Any

import numpy as np

from .calibration import CalibrationError, CalibrationSet, PadCalibration
from .data import CameraPoint
from .hand_tracking import HandTracker
from .keyboard import (
    KeyboardOverlayRenderer,
    KeyRegion,
    SplitKeyboard,
    load_layout_configuration,
)
from .macos_injection import MacOSKeyboardInjector
from .recognizer import (
    GestureTemplates,
    MIN_TRACKPAD_POINTS,
    REQUIRED_GESTURES,
    display_label,
)
from .rendering import TextSpec, draw_unicode_texts
from .tasks import (
    CAMERA_WINDOW_MARGIN_NS,
    ContactSegmenter,
    CompletedStroke,
    robust_position,
)
from .touchpads import MacMultitouchProvider, TouchProvider


PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = PACKAGE_DIR / "models" / "hand_landmarker.task"
WINDOW_NAME = "Visual TwinPads"
FRAME_SIZE = (1280, 720)
DEFAULT_TRACKING_WIDTH = 640


@dataclass(slots=True)
class AppArguments:
    camera_lag_ms: float
    tracking_width: int = DEFAULT_TRACKING_WIDTH
    camera_rotation: int = 0
    enable_macos_passthrough: bool = False


def _orient_camera_frame(frame: np.ndarray, rotation: int) -> np.ndarray:
    if rotation == 0:
        return frame
    if rotation == 90:
        return np.ascontiguousarray(np.rot90(frame, k=3))
    if rotation == 180:
        return np.ascontiguousarray(frame[::-1, ::-1])
    if rotation == 270:
        return np.ascontiguousarray(np.rot90(frame, k=1))
    raise ValueError("camera rotation must be 0, 90, 180, or 270 degrees")


def _resize_tracking_frame(cv2: Any, frame: np.ndarray, max_width: int) -> np.ndarray:
    if max_width <= 0:
        raise ValueError("tracking width must be positive")
    if frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError("tracking input must be an HxWx3 BGR image")
    if frame.shape[1] <= max_width:
        return frame
    height = max(1, int(round(frame.shape[0] * max_width / frame.shape[1])))
    return cv2.resize(frame, (max_width, height), interpolation=cv2.INTER_AREA)


class TwinPadsApp:
    def __init__(
        self,
        cv2: Any,
        arguments: AppArguments,
        provider: TouchProvider,
        capture: Any,
        tracker: HandTracker,
        keyboard: SplitKeyboard,
        *,
        keyboard_injector: Any | None = None,
    ) -> None:
        self.cv2 = cv2
        self.arguments = arguments
        self.provider = provider
        self.capture = capture
        self.tracker = tracker
        self.keyboard = keyboard
        lag_ns = int(arguments.camera_lag_ms * 1_000_000)
        self.segmenter = ContactSegmenter(
            camera_lag_ns=lag_ns,
            post_roll_ns=lag_ns + CAMERA_WINDOW_MARGIN_NS,
        )

        self.calibration: CalibrationSet | None = None
        self.pending_calibration: CalibrationSet | None = None
        self.calibration_points: list[tuple[float, float]] = []
        self.calibrating = False
        self.keyboard_overlay: KeyboardOverlayRenderer | None = None
        self.message = "Press C to calibrate the two trackpads."

        self.mode = "idle"
        self.latest_tracking: tuple[CameraPoint, ...] | None = None
        self.latest_contacts: dict[str, tuple[Any, ...]] = {
            "built-in": (),
            "external": (),
        }
        self.free_trackpad_text = ""
        self.free_camera_text = ""
        self.keyboard_injector = keyboard_injector
        self.passthrough_enabled = False
        self.passthrough_shift = False
        self.passthrough_caps_lock = False
        self.templates = GestureTemplates()
        self.template_index = 0

    def run(self) -> None:
        cv2 = self.cv2
        cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_AUTOSIZE)
        cv2.setMouseCallback(WINDOW_NAME, self._on_mouse)

        while True:
            ok, frame = self.capture.read()
            captured_ns = time.perf_counter_ns()
            if not ok or frame is None:
                raise RuntimeError("Camera frame could not be read")
            frame = _orient_camera_frame(frame, self.arguments.camera_rotation)
            oriented_size = (
                FRAME_SIZE
                if self.arguments.camera_rotation in (0, 180)
                else (FRAME_SIZE[1], FRAME_SIZE[0])
            )
            if (frame.shape[1], frame.shape[0]) != oriented_size:
                frame = cv2.resize(frame, oriented_size, interpolation=cv2.INTER_AREA)

            self._poll_touchpads()
            if self.calibration is not None:
                tracking_frame = _resize_tracking_frame(
                    cv2, frame, self.arguments.tracking_width
                )
                self.latest_tracking = self.tracker.process(
                    tracking_frame,
                    captured_ns,
                    self.calibration,
                    coordinate_frame_shape=frame.shape,
                )
                self.segmenter.add_camera_frame(captured_ns, self.latest_tracking)

            self._flush_ready_strokes(captured_ns)

            cv2.imshow(WINDOW_NAME, self._draw(frame))
            key = cv2.waitKeyEx(1)
            if key != -1 and self._handle_key(key & 0xFF):
                break

    def _poll_touchpads(self) -> None:
        while True:
            frame = self.provider.poll(0.0)
            if frame is None:
                return
            if frame.role in self.latest_contacts:
                self.latest_contacts[frame.role] = frame.contacts
            self.segmenter.add_touch_frame(frame)

    def _flush_ready_strokes(self, now_ns: int) -> None:
        for stroke in self.segmenter.flush(now_ns):
            if self.mode == "typing":
                self._handle_typing_tap(stroke)
            elif self.mode == "gesture_template":
                self._handle_template(stroke)
            elif self.mode == "gesture":
                self._handle_gesture(stroke)

    def _handle_key(self, key: int) -> bool:
        if key == 27:
            return True
        if key in (ord("c"), ord("C")):
            self._start_calibration()
        elif key in (10, 13) and self.calibrating:
            self._accept_calibration()
        elif key in (ord("t"), ord("T")):
            self._start_typing()
        elif key in (ord("p"), ord("P")):
            self._toggle_passthrough()
        elif key in (ord("g"), ord("G")):
            self._start_gestures()
        return False

    def _start_calibration(self) -> None:
        self.mode = "idle"
        self.segmenter.reset()
        self.calibration = None
        self.pending_calibration = None
        self.calibration_points.clear()
        self.calibrating = True
        self.keyboard_overlay = None
        self.passthrough_enabled = False
        self.message = "Calibration: click BUILT-IN TL, TR, BR, BL."

    def _on_mouse(self, event: int, x: int, y: int, _flags: int, _parameter: Any) -> None:
        if event != self.cv2.EVENT_LBUTTONDOWN or not self.calibrating:
            return
        if len(self.calibration_points) >= 8:
            return
        self.calibration_points.append((float(x), float(y)))
        count = len(self.calibration_points)
        try:
            if count == 4:
                PadCalibration.from_corners(self.calibration_points)
                self.message = "Calibration: click EXTERNAL TL, TR, BR, BL."
            elif count == 8:
                self.pending_calibration = CalibrationSet.from_quads(
                    self.calibration_points[:4], self.calibration_points[4:]
                )
                self.message = "Calibration valid. Press Enter to accept or C to restart."
        except CalibrationError as error:
            if count <= 4:
                self.calibration_points.clear()
                self.message = f"Built-in quad invalid: {error}. Click it again."
            else:
                del self.calibration_points[4:]
                self.message = f"External quad invalid: {error}. Click it again."

    def _accept_calibration(self) -> None:
        if self.pending_calibration is None:
            self.message = "Eight valid corner clicks are required before Enter."
            return
        self.calibration = self.pending_calibration
        self.pending_calibration = None
        self.calibrating = False
        self.keyboard_overlay = None
        self.segmenter.reset()
        self.mode = "idle"
        self.message = "Calibration accepted. Press T to type or G for gestures."

    def _start_typing(self) -> None:
        if self.calibration is None:
            self.message = "Calibrate first with C."
            return
        self.segmenter.reset()
        self.mode = "typing"
        self.free_trackpad_text = ""
        self.free_camera_text = ""
        self.passthrough_enabled = False
        self.passthrough_shift = False
        self.passthrough_caps_lock = False
        self.message = "Typing started. Press P to toggle passthrough."

    def _toggle_passthrough(self) -> None:
        if self.mode != "typing":
            self.message = "Start typing with T before enabling passthrough."
            return
        if self.passthrough_enabled:
            self.passthrough_enabled = False
            self.message = "Passthrough off; the typing comparison continues."
            return
        if not self.arguments.enable_macos_passthrough:
            self.message = "Restart with --enable-macos-passthrough to use passthrough."
            return
        if self.keyboard_injector is None:
            try:
                self.keyboard_injector = MacOSKeyboardInjector()
            except RuntimeError as error:
                self.message = str(error)
                return
        if not self.keyboard_injector.trusted:
            self.message = "Accessibility permission is required for passthrough."
            return
        self.passthrough_enabled = True
        self.message = "Passthrough on. Focus the app where the text should go."

    def _start_gestures(self) -> None:
        if self.calibration is None:
            self.message = "Calibrate first with C."
            return
        self.segmenter.reset()
        self.mode = "gesture_template"
        self.passthrough_enabled = False
        self.templates = GestureTemplates()
        self.template_index = 0
        self.message = "Draw each template on the built-in trackpad."

    def _handle_typing_tap(self, stroke: CompletedStroke) -> None:
        if stroke.multi_contact:
            self.message = "Typing ignored: use at most one finger per pad."
            return
        trackpad_position = robust_position(stroke.trackpad_xy)
        camera_position = robust_position(stroke.camera_xy)
        trackpad_key = (
            self.keyboard.hit_region(stroke.role, *trackpad_position)
            if trackpad_position is not None
            else None
        )
        camera_key = (
            self.keyboard.hit_region(stroke.role, *camera_position)
            if camera_position is not None
            else None
        )
        self.free_trackpad_text = self._apply_key(self.free_trackpad_text, trackpad_key)
        self.free_camera_text = self._apply_key(self.free_camera_text, camera_key)
        result_message = (
            "No camera fingertip was paired with this tap."
            if camera_position is None
            else "Typing updated."
        )
        if self.passthrough_enabled and trackpad_key is not None:
            try:
                result_message += f" {self._emit_passthrough_key(trackpad_key)}"
            except PermissionError:
                self.passthrough_enabled = False
                result_message += " Accessibility permission was lost; passthrough is off."
        self.message = result_message

    @staticmethod
    def _apply_key(text: str, key: KeyRegion | None) -> str:
        if key is None:
            return text
        if key.action == "backspace":
            return text[:-1]
        if key.action == "space":
            return text + " "
        if key.action == "insert":
            return text + key.output
        return text

    def _emit_passthrough_key(self, key: KeyRegion) -> str:
        injector = self.keyboard_injector
        if injector is None:
            return "Passthrough is unavailable."
        if key.action == "backspace":
            injector.press_keycode(51)
            self.passthrough_shift = False
            return "Pressed Backspace."
        if key.action == "space":
            injector.type_text(" ")
            self.passthrough_shift = False
            return "Typed a space."
        if key.action == "modifier":
            identifier = key.id.casefold()
            if "shift" in identifier:
                self.passthrough_shift = not self.passthrough_shift
                return f"One-shot Shift {'on' if self.passthrough_shift else 'off'}."
            if "caps" in identifier:
                self.passthrough_caps_lock = not self.passthrough_caps_lock
                return f"Caps Lock {'on' if self.passthrough_caps_lock else 'off'}."
            if "tab" in identifier:
                injector.press_keycode(48)
                return "Pressed Tab."
            if "enter" in identifier or "return" in identifier:
                injector.press_keycode(36)
                return "Pressed Return."
            return "Command, Option and Control are disabled."

        text = key.output or key.label
        if len(text) == 1 and text.isalpha():
            uppercase = self.passthrough_shift != self.passthrough_caps_lock
            text = text.upper() if uppercase else text.lower()
        elif self.passthrough_shift and key.secondary:
            text = key.secondary
        injector.type_text(text)
        self.passthrough_shift = False
        return f"Typed {text!r}."

    def _handle_template(self, stroke: CompletedStroke) -> None:
        if stroke.role != "built-in" or stroke.multi_contact:
            self.message = "Template rejected: use one finger on the built-in trackpad."
            return
        label = REQUIRED_GESTURES[self.template_index]
        try:
            self.templates.add(label, stroke.trackpad_xy)
        except ValueError as error:
            self.message = f"Template rejected: {error}"
            return
        self.template_index += 1
        if self.template_index == len(REQUIRED_GESTURES):
            self.mode = "gesture"
            self.message = "Templates ready. Draw a gesture on either trackpad."
        else:
            next_label = display_label(REQUIRED_GESTURES[self.template_index])
            self.message = f"Template saved. Next: {next_label}."

    def _handle_gesture(self, stroke: CompletedStroke) -> None:
        if stroke.multi_contact or len(stroke.trackpad_xy) < MIN_TRACKPAD_POINTS:
            self.message = "Gesture rejected: draw one longer stroke with one finger."
            return
        try:
            label, score = self.templates.recognize(stroke.trackpad_xy)
        except ValueError as error:
            self.message = f"Gesture rejected: {error}"
            return
        self.message = (
            f"{stroke.role}: {display_label(label)} "
            f"({score:.0%} match)"
        )

    def _draw(self, frame: np.ndarray) -> np.ndarray:
        output = frame.copy()
        if self.calibration is not None and not self.calibrating:
            if self.keyboard_overlay is None or self.keyboard_overlay.frame_shape != output.shape:
                self.keyboard_overlay = KeyboardOverlayRenderer(
                    output.shape, self.calibration, keyboard=self.keyboard
                )
            output = self.keyboard_overlay.draw(output)
            self._draw_live_points(output)
        if self.calibrating:
            self._draw_calibration(output)

        overlay = output.copy()
        self.cv2.rectangle(overlay, (0, 0), (output.shape[1], 160), (0, 0, 0), -1)
        self.cv2.addWeighted(overlay, 0.62, output, 0.38, 0.0, output)
        lines = (
            f"Visual TwinPads | {self._mode_label()}",
            self._prompt_line(),
            self.message,
            "C calibrate | T typing | P passthrough | G $1 gestures | Esc quit",
        )
        specs: list[TextSpec] = [
            (
                line[:150],
                (18.0, 9.0 + index * 36),
                23 if index < 2 else 18,
                (75, 235, 255) if index == 1 else (255, 255, 255),
                "lt",
            )
            for index, line in enumerate(lines)
        ]
        output[:160] = draw_unicode_texts(output[:160], specs)
        return output

    def _mode_label(self) -> str:
        if self.calibrating:
            return "calibration"
        return {
            "idle": "ready",
            "typing": "typing",
            "gesture_template": "gesture setup",
            "gesture": "$1 gestures",
        }.get(self.mode, self.mode)

    def _prompt_line(self) -> str:
        if self.mode == "typing":
            passthrough = " | PASSTHROUGH ON" if self.passthrough_enabled else ""
            return (
                f"TRACKPAD: {self.free_trackpad_text}    "
                f"CAMERA: {self.free_camera_text}{passthrough}"
            )
        if self.mode == "gesture_template":
            label = display_label(REQUIRED_GESTURES[self.template_index])
            return f"TEMPLATE {self.template_index + 1}/5: {label} on built-in"
        if self.mode == "gesture":
            return "GESTURES: draw one learned shape on either trackpad"
        return "One index finger and at most one contact per pad."

    def _draw_calibration(self, frame: np.ndarray) -> None:
        for index, (x, y) in enumerate(self.calibration_points):
            built_in = index < 4
            color = (35, 180, 255) if built_in else (255, 145, 45)
            self.cv2.circle(frame, (int(x), int(y)), 7, color, -1, self.cv2.LINE_AA)
            label = ("B" if built_in else "E") + str(index % 4 + 1)
            self.cv2.putText(
                frame,
                label,
                (int(x) + 9, int(y) - 9),
                self.cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                color,
                2,
                self.cv2.LINE_AA,
            )
        for start in (0, 4):
            points = self.calibration_points[start : start + 4]
            if len(points) >= 2:
                self.cv2.polylines(
                    frame,
                    [np.rint(points).astype(np.int32)],
                    len(points) == 4,
                    (35, 180, 255) if start == 0 else (255, 145, 45),
                    2,
                    self.cv2.LINE_AA,
                )

    def _draw_live_points(self, frame: np.ndarray) -> None:
        if self.calibration is None:
            return
        for role, contacts in self.latest_contacts.items():
            calibration = self.calibration.for_role(role)
            for contact in contacts:
                x, y = calibration.to_image(((contact.x, contact.y),))[0]
                self.cv2.drawMarker(
                    frame,
                    (int(round(x)), int(round(y))),
                    (60, 255, 60),
                    self.cv2.MARKER_CROSS,
                    22,
                    2,
                )
        if self.latest_tracking is not None:
            for point in self.latest_tracking:
                x, y = self.calibration.for_role(point.role).to_image(((point.x, point.y),))[0]
                self.cv2.circle(frame, (int(round(x)), int(round(y))), 9, (20, 40, 255), 2)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Visual TwinPads keyboard demo for two Apple trackpads"
    )
    parser.add_argument("--camera", type=int, default=0, help="OpenCV camera index")
    parser.add_argument(
        "--camera-rotation",
        type=int,
        choices=(0, 90, 180, 270),
        default=0,
        help="rotate camera frames before calibration and tracking",
    )
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument(
        "--keyboard-layout",
        type=Path,
        help="version 1 JSON exported by keyboard-overlay-generator",
    )
    parser.add_argument(
        "--camera-lag-ms",
        type=float,
        default=150.0,
        help="estimated Continuity Camera delay",
    )
    parser.add_argument(
        "--tracking-width",
        type=int,
        default=DEFAULT_TRACKING_WIDTH,
        help="maximum MediaPipe input width",
    )
    parser.add_argument(
        "--enable-macos-passthrough",
        action="store_true",
        help="allow P to send typing-mode keys to the focused macOS app",
    )
    return parser


def _validate_devices(provider: TouchProvider) -> tuple[tuple[str, str], ...]:
    devices = tuple(getattr(provider, "devices", ()))
    counts = {
        role: sum(device_role == role for _, device_role in devices)
        for role in ("built-in", "external")
    }
    if counts != {"built-in": 1, "external": 1} or len(devices) != 2:
        raise RuntimeError(
            "The demo requires exactly one built-in and one external trackpad; "
            f"detected {devices or 'no devices'}"
        )
    return devices


def _open_camera(cv2: Any, index: int) -> Any:
    backend = cv2.CAP_AVFOUNDATION if sys.platform == "darwin" else cv2.CAP_ANY
    capture = cv2.VideoCapture(index, backend)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_SIZE[0])
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_SIZE[1])
    capture.set(cv2.CAP_PROP_FPS, 30)
    if not capture.isOpened():
        capture.release()
        raise RuntimeError(f"Camera index {index} could not be opened")
    return capture


def main(argv: list[str] | None = None) -> int:
    namespace = _build_parser().parse_args(argv)
    provider = MacMultitouchProvider()
    capture = None
    tracker = None
    try:
        if not 0.0 <= namespace.camera_lag_ms <= 1000.0:
            raise ValueError("--camera-lag-ms must be between 0 and 1000")
        if not 160 <= namespace.tracking_width <= FRAME_SIZE[0]:
            raise ValueError(f"--tracking-width must be between 160 and {FRAME_SIZE[0]}")
        import cv2

        configuration = load_layout_configuration(namespace.keyboard_layout)
        keyboard = SplitKeyboard(configuration)
        provider.start()
        _validate_devices(provider)
        capture = _open_camera(cv2, namespace.camera)
        tracker = HandTracker(namespace.model)
        arguments = AppArguments(
            camera_lag_ms=namespace.camera_lag_ms,
            tracking_width=namespace.tracking_width,
            camera_rotation=namespace.camera_rotation,
            enable_macos_passthrough=namespace.enable_macos_passthrough,
        )
        TwinPadsApp(cv2, arguments, provider, capture, tracker, keyboard).run()
        return 0
    except (CalibrationError, FileNotFoundError, ImportError, RuntimeError, ValueError) as error:
        print(f"Visual TwinPads: {error}", file=sys.stderr)
        return 2
    finally:
        if tracker is not None:
            tracker.close()
        if capture is not None:
            capture.release()
        provider.stop()
        if "cv2" in locals():
            cv2.destroyAllWindows()


if __name__ == "__main__":
    raise SystemExit(main())
