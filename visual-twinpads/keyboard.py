"""Load, test and draw the split keyboard layout."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import cv2
import numpy as np

from .calibration import CalibrationSet
from .data import PadRole
from .rendering import TextSpec, draw_unicode_texts


LAYOUT_SCHEMA_VERSION = 1
LAYOUT_KIND = "visual-twinpads-keyboard-layout"
DEFAULT_LAYOUT_PATH = Path(__file__).resolve().parent / "default_keyboard_layout.json"
VALID_ROLES = {"built-in", "external"}
VALID_ACTIONS = {"insert", "space", "backspace", "modifier"}


@dataclass(frozen=True, slots=True)
class KeyRegion:
    id: str
    label: str
    output: str
    action: str
    role: PadRole
    x0: float
    y0: float
    x1: float
    y1: float
    secondary: str = ""

    @property
    def polygon(self) -> np.ndarray:
        return np.asarray(
            ((self.x0, self.y0), (self.x1, self.y0), (self.x1, self.y1), (self.x0, self.y1)),
            dtype=np.float32,
        )

    def contains(self, x: float, y: float) -> bool:
        if not (np.isfinite(x) and np.isfinite(y)):
            return False
        within_x = self.x0 <= x < self.x1 or (self.x1 == 1.0 and x == 1.0)
        within_y = self.y0 <= y < self.y1 or (self.y1 == 1.0 and y == 1.0)
        return within_x and within_y


@dataclass(frozen=True, slots=True)
class LayoutConfiguration:
    regions: tuple[KeyRegion, ...]
    style: Mapping[str, Any]


def _parse_region(data: Mapping[str, Any]) -> KeyRegion:
    try:
        region = KeyRegion(
            id=str(data["id"]),
            label=str(data.get("label", data["id"])),
            output=str(data.get("output", "")),
            action=str(data.get("action", "insert")),
            role=str(data["role"]),  # type: ignore[arg-type]
            x0=float(data["x0"]),
            y0=float(data["y0"]),
            x1=float(data["x1"]),
            y1=float(data["y1"]),
            secondary=str(data.get("secondary", "")),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"invalid keyboard region: {data!r}") from error

    if not region.id:
        raise ValueError("keyboard region ids must not be empty")
    if region.role not in VALID_ROLES:
        raise ValueError(f"invalid role for keyboard region {region.id!r}")
    if region.action not in VALID_ACTIONS:
        raise ValueError(f"invalid action for keyboard region {region.id!r}")
    coordinates = (region.x0, region.y0, region.x1, region.y1)
    if not all(np.isfinite(value) and 0.0 <= value <= 1.0 for value in coordinates):
        raise ValueError(f"keyboard region {region.id!r} is outside normalized bounds")
    if region.x1 <= region.x0 or region.y1 <= region.y0:
        raise ValueError(f"keyboard region {region.id!r} has empty geometry")
    return region


def _regions_overlap(left: KeyRegion, right: KeyRegion) -> bool:
    return (
        min(left.x1, right.x1) > max(left.x0, right.x0)
        and min(left.y1, right.y1) > max(left.y0, right.y0)
    )


def _validate_regions(regions: Sequence[KeyRegion]) -> None:
    duplicates = [
        key_id for key_id, count in Counter(region.id for region in regions).items() if count > 1
    ]
    if duplicates:
        raise ValueError(f"duplicate keyboard region ids: {', '.join(sorted(duplicates))}")
    for role in ("built-in", "external"):
        role_regions = [region for region in regions if region.role == role]
        for index, region in enumerate(role_regions):
            for other in role_regions[index + 1 :]:
                if _regions_overlap(region, other):
                    raise ValueError(
                        f"overlapping keyboard regions on {role}: {region.id} and {other.id}"
                    )


def _layout_from_mapping(data: Mapping[str, Any]) -> LayoutConfiguration:
    if data.get("schema_version") != LAYOUT_SCHEMA_VERSION or data.get("kind") != LAYOUT_KIND:
        raise ValueError("unsupported keyboard layout schema")
    raw_regions = data.get("regions")
    if not isinstance(raw_regions, list) or not raw_regions:
        raise ValueError("keyboard layout requires a non-empty regions array")
    if not all(isinstance(item, Mapping) for item in raw_regions):
        raise ValueError("every keyboard region must be an object")
    regions = tuple(_parse_region(item) for item in raw_regions)
    _validate_regions(regions)
    if not all(any(region.role == role for region in regions) for role in VALID_ROLES):
        raise ValueError("keyboard layout needs regions for both trackpads")

    style = data.get("style", {})
    if not isinstance(style, Mapping):
        raise ValueError("keyboard layout style must be an object")
    return LayoutConfiguration(
        regions=regions,
        style=dict(style),
    )


def load_layout_configuration(path: str | Path | None = None) -> LayoutConfiguration:
    """Load a web-app export or the bundled macOS ISO-DE layout."""

    layout_path = DEFAULT_LAYOUT_PATH if path is None else Path(path)
    try:
        data = json.loads(layout_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"could not load keyboard layout from {layout_path}: {error}") from error
    if not isinstance(data, Mapping):
        raise ValueError("keyboard layout root must be an object")
    return _layout_from_mapping(data)


class SplitKeyboard:
    def __init__(self, configuration: LayoutConfiguration) -> None:
        self.regions = configuration.regions
        self.style = configuration.style

    def regions_for(self, role: PadRole) -> tuple[KeyRegion, ...]:
        return tuple(region for region in self.regions if region.role == role)

    def hit_region(self, role: PadRole, x: float, y: float) -> KeyRegion | None:
        return next(
            (region for region in self.regions_for(role) if region.contains(x, y)),
            None,
        )

    def polygons_in_image(
        self, calibration: CalibrationSet
    ) -> Iterable[tuple[KeyRegion, np.ndarray]]:
        for region in self.regions:
            yield region, calibration.for_role(region.role).to_image(region.polygon)

def _hex_to_bgr(value: str, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) != 6:
        return fallback
    try:
        red, green, blue = (int(text[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return fallback
    return blue, green, red


class KeyboardOverlayRenderer:
    """Pre-render the static keyboard and cheaply composite it onto frames."""

    def __init__(
        self,
        frame_shape: Sequence[int],
        calibration: CalibrationSet,
        *,
        keyboard: SplitKeyboard,
    ) -> None:
        if len(frame_shape) != 3 or int(frame_shape[2]) != 3:
            raise ValueError("keyboard overlay needs a BGR frame shape")
        height, width = int(frame_shape[0]), int(frame_shape[1])
        if height <= 0 or width <= 0:
            raise ValueError("frame dimensions must be positive")

        style = keyboard.style
        opacity = float(style.get("key_opacity", 0.25))
        if not 0.0 <= opacity <= 1.0:
            raise ValueError("key opacity must be between zero and one")
        fill = _hex_to_bgr(str(style.get("key_color", "#f8fafc")), (245, 245, 245))
        outline = _hex_to_bgr(str(style.get("outline_color", "#312e81")), (129, 46, 49))
        text_color = _hex_to_bgr(str(style.get("text_color", "#111827")), (39, 24, 17))

        layer = np.zeros((height, width, 4), dtype=np.uint8)
        polygons = list(keyboard.polygons_in_image(calibration))
        alpha = int(round(opacity * 255.0))
        for _, polygon in polygons:
            cv2.fillConvexPoly(
                layer,
                np.rint(polygon).astype(np.int32),
                (*fill, alpha),
                lineType=cv2.LINE_8,
            )

        labels: list[TextSpec] = []
        for region, polygon in polygons:
            points = np.rint(polygon).astype(np.int32)
            cv2.polylines(layer, [points], True, (*outline, 255), 1, cv2.LINE_8)
            label = "SPACE" if region.action == "space" else "DEL" if region.action == "backspace" else region.label
            center = np.mean(polygon, axis=0)
            key_height = min(
                np.linalg.norm(polygon[3] - polygon[0]),
                np.linalg.norm(polygon[2] - polygon[1]),
            )
            font_size = int(np.clip(key_height * 0.42, 9, 17))
            if len(label) > 1:
                font_size = max(8, int(font_size * (0.72 if len(label) <= 3 else 0.58)))
            labels.append((label, tuple(center), font_size, text_color, "mm"))
        layer = draw_unicode_texts(layer, labels)

        alpha_bgr = np.repeat(layer[:, :, 3:4], 3, axis=2)
        self._inverse_alpha = np.ascontiguousarray(255 - alpha_bgr)
        self._premultiplied = cv2.multiply(layer[:, :, :3], alpha_bgr, scale=1.0 / 255.0)
        self.frame_shape = (height, width, 3)

    def draw(self, frame: np.ndarray) -> np.ndarray:
        if frame.shape != self.frame_shape:
            raise ValueError("frame shape does not match cached keyboard overlay")
        output = cv2.multiply(frame, self._inverse_alpha, scale=1.0 / 255.0)
        cv2.add(output, self._premultiplied, dst=output)
        return output
