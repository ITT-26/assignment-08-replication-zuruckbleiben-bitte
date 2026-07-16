"""Four-corner perspective calibration for the two trackpads."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import cv2
import numpy as np

from .data import PadRole


NORMALIZED_CORNERS = np.asarray(
    ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)), dtype=np.float32
)


class CalibrationError(ValueError):
    """Raised when four clicked corners cannot describe a trackpad."""


def _points(points: Sequence[Sequence[float]], count: int) -> np.ndarray:
    array = np.asarray(points, dtype=np.float32)
    if array.shape != (count, 2):
        raise CalibrationError(f"Expected exactly {count} two-dimensional points")
    if not np.isfinite(array).all():
        raise CalibrationError("Point coordinates must be finite")
    return array


def validate_quad(
    corners: Sequence[Sequence[float]], *, min_area: float = 400.0
) -> np.ndarray:
    """Validate corners clicked in TL, TR, BR, BL order."""

    if min_area < 0:
        raise ValueError("min_area must be non-negative")
    quad = _points(corners, 4)
    contour = quad.reshape((-1, 1, 2))
    if abs(float(cv2.contourArea(contour))) < min_area:
        raise CalibrationError(f"Trackpad quadrilateral area must be at least {min_area:g}")
    if not cv2.isContourConvex(contour):
        raise CalibrationError("Trackpad quadrilateral must be strictly convex")

    # This order gives positive turns in image coordinates.
    turns = [
        float(np.cross(quad[(index + 1) % 4] - quad[index], quad[(index + 2) % 4] - quad[(index + 1) % 4]))
        for index in range(4)
    ]
    if not all(turn > 0.0 for turn in turns):
        raise CalibrationError("Corners must be clicked in TL, TR, BR, BL order")
    return quad.copy()


def _transform(matrix: np.ndarray, points: Sequence[Sequence[float]]) -> np.ndarray:
    values = np.asarray(points, dtype=np.float32)
    if values.ndim != 2 or values.shape[1] != 2 or not np.isfinite(values).all():
        raise CalibrationError("Expected finite two-dimensional points")
    return cv2.perspectiveTransform(values.reshape(1, -1, 2), matrix)[0].astype(
        np.float64
    )


@dataclass(frozen=True, slots=True)
class PadCalibration:
    """One pad polygon and its two perspective transforms."""

    image_corners: np.ndarray
    image_to_normalized: np.ndarray
    normalized_to_image: np.ndarray

    @classmethod
    def from_corners(
        cls,
        corners: Sequence[Sequence[float]],
        *,
        min_area: float = 400.0,
    ) -> "PadCalibration":
        image_corners = validate_quad(corners, min_area=min_area)
        to_normalized = cv2.getPerspectiveTransform(image_corners, NORMALIZED_CORNERS)
        to_image = cv2.getPerspectiveTransform(NORMALIZED_CORNERS, image_corners)
        if not np.isfinite(to_normalized).all() or not np.isfinite(to_image).all():
            raise CalibrationError("Could not calculate a stable homography")
        return cls(image_corners, to_normalized, to_image)

    def contains_image_point(self, point: Sequence[float]) -> bool:
        candidate = _points((point,), 1)[0]
        return cv2.pointPolygonTest(
            self.image_corners.reshape((-1, 1, 2)),
            (float(candidate[0]), float(candidate[1])),
            False,
        ) >= 0

    def to_normalized(self, points: Sequence[Sequence[float]]) -> np.ndarray:
        return _transform(self.image_to_normalized, points)

    def to_image(self, points: Sequence[Sequence[float]]) -> np.ndarray:
        return _transform(self.normalized_to_image, points)


@dataclass(frozen=True, slots=True)
class CalibrationSet:
    """Independent calibrations for the built-in and external trackpads."""

    built_in: PadCalibration
    external: PadCalibration

    @classmethod
    def from_quads(
        cls,
        built_in: Sequence[Sequence[float]],
        external: Sequence[Sequence[float]],
        *,
        min_area: float = 400.0,
    ) -> "CalibrationSet":
        return cls(
            PadCalibration.from_corners(built_in, min_area=min_area),
            PadCalibration.from_corners(external, min_area=min_area),
        )

    def for_role(self, role: PadRole) -> PadCalibration:
        if role == "built-in":
            return self.built_in
        if role == "external":
            return self.external
        raise KeyError(f"No calibration for role {role!r}")
