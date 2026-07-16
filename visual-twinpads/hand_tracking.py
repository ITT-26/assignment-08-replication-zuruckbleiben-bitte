"""MediaPipe fingertip tracking for the two calibrated pads."""

from __future__ import annotations

from dataclasses import dataclass
import importlib
import os
from pathlib import Path
import tempfile
from typing import Any, Sequence

import numpy as np

from .calibration import CalibrationSet
from .data import CameraPoint, PadRole


# MediaPipe also loads Matplotlib, so use a writable cache on lab accounts.
os.environ.setdefault(
    "MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "visual-twinpads-mpl")
)
os.environ.setdefault(
    "XDG_CACHE_HOME", str(Path(tempfile.gettempdir()) / "visual-twinpads-cache")
)


@dataclass(frozen=True, slots=True)
class FingertipObservation:
    """One index fingertip in camera-image pixel coordinates."""

    x: float
    y: float


def assign_fingertips(
    observations: Sequence[FingertipObservation],
    calibration: CalibrationSet,
) -> tuple[CameraPoint, ...]:
    """Map only clear fingertip observations to a trackpad."""

    roles: tuple[PadRole, PadRole] = ("built-in", "external")
    candidates: dict[PadRole, list[FingertipObservation]] = {role: [] for role in roles}
    ambiguous: set[PadRole] = set()
    for observation in observations:
        memberships = [
            role
            for role in roles
            if calibration.for_role(role).contains_image_point((observation.x, observation.y))
        ]
        if len(memberships) > 1:
            ambiguous.update(memberships)
        for role in memberships:
            candidates[role].append(observation)

    points: list[CameraPoint] = []
    for role in roles:
        role_candidates = candidates[role]
        if len(role_candidates) != 1:
            if len(role_candidates) > 1:
                ambiguous.add(role)
            continue
        if role in ambiguous:
            continue
        observation = role_candidates[0]
        normalized = calibration.for_role(role).to_normalized(((observation.x, observation.y),))[0]
        x, y = np.clip(normalized, 0.0, 1.0)
        points.append(
            CameraPoint(
                role=role,
                x=float(x),
                y=float(y),
            )
        )

    return tuple(points)


def _result_observations(result: Any, frame_shape: Sequence[int]) -> tuple[FingertipObservation, ...]:
    """Extract landmark 8 from a MediaPipe HandLandmarker result."""

    if len(frame_shape) < 2:
        raise ValueError("frame_shape must contain height and width")
    height, width = int(frame_shape[0]), int(frame_shape[1])
    if height <= 0 or width <= 0:
        raise ValueError("frame dimensions must be positive")
    observations: list[FingertipObservation] = []
    landmarks_by_hand = getattr(result, "hand_landmarks", ()) or ()
    for landmarks in landmarks_by_hand:
        if len(landmarks) <= 8:
            continue
        landmark = landmarks[8]
        observations.append(
            FingertipObservation(
                x=float(landmark.x) * (width - 1),
                y=float(landmark.y) * (height - 1),
            )
        )
    return tuple(observations)


class HandTracker:
    """MediaPipe Hand Landmarker in video mode."""

    def __init__(
        self,
        model_path: str | Path,
    ) -> None:
        path = Path(model_path).expanduser()
        if not path.is_file():
            raise FileNotFoundError(f"MediaPipe model not found: {path}")
        try:
            mediapipe = importlib.import_module("mediapipe")
        except ImportError as exc:
            raise RuntimeError(
                "MediaPipe is not installed; use the Visual TwinPads Python 3.12 environment"
            ) from exc

        try:
            options = mediapipe.tasks.vision.HandLandmarkerOptions(
                base_options=mediapipe.tasks.BaseOptions(model_asset_path=str(path)),
                running_mode=mediapipe.tasks.vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self._landmarker = mediapipe.tasks.vision.HandLandmarker.create_from_options(options)
        except AttributeError as exc:
            raise RuntimeError(
                "A MediaPipe installation with the Tasks HandLandmarker API is required"
            ) from exc
        except (RuntimeError, ValueError) as exc:
            raise RuntimeError(
                f"MediaPipe Hand Landmarker could not be initialized: {exc}"
            ) from exc
        self._mediapipe = mediapipe
        self._last_timestamp_ms = -1

    def process(
        self,
        frame_bgr: np.ndarray,
        timestamp_ns: int,
        calibration: CalibrationSet,
        *,
        coordinate_frame_shape: Sequence[int] | None = None,
    ) -> tuple[CameraPoint, ...]:
        """Detect index fingertips and map them to the calibrated pads."""

        if frame_bgr.ndim != 3 or frame_bgr.shape[2] != 3:
            raise ValueError("frame_bgr must be an HxWx3 BGR image")
        timestamp_ms = int(timestamp_ns) // 1_000_000
        # VIDEO mode needs increasing timestamps.
        timestamp_ms = max(timestamp_ms, self._last_timestamp_ms + 1)
        self._last_timestamp_ms = timestamp_ms
        rgb = np.ascontiguousarray(frame_bgr[:, :, ::-1])
        image = self._mediapipe.Image(image_format=self._mediapipe.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, timestamp_ms)
        observations = _result_observations(
            result,
            frame_bgr.shape
            if coordinate_frame_shape is None
            else coordinate_frame_shape,
        )
        return assign_fingertips(observations, calibration)

    def close(self) -> None:
        self._landmarker.close()
