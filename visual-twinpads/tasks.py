"""Match trackpad taps with delayed camera points."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Iterable

import numpy as np

from .data import CameraPoint, PadRole, TouchFrame


DEFAULT_CAMERA_LAG_NS = 150_000_000
CAMERA_WINDOW_MARGIN_NS = 60_000_000
CAMERA_POST_ROLL_NS = 350_000_000
CAMERA_HISTORY_NS = 5_000_000_000


@dataclass(slots=True)
class CameraObservation:
    timestamp_ns: int
    points: tuple[CameraPoint, ...]


@dataclass(slots=True)
class _ActiveStroke:
    role: PadRole
    contact_id: int
    down_ns: int
    trackpad_points: list[tuple[int, float, float]] = field(default_factory=list)
    multi_contact: bool = False


@dataclass(slots=True)
class _PendingStroke:
    active: _ActiveStroke
    up_ns: int


@dataclass(frozen=True, slots=True)
class CompletedStroke:
    role: PadRole
    trackpad_points: tuple[tuple[int, float, float], ...]
    camera_points: tuple[CameraPoint, ...]
    multi_contact: bool

    @property
    def trackpad_xy(self) -> list[tuple[float, float]]:
        return [(x, y) for _, x, y in self.trackpad_points]

    @property
    def camera_xy(self) -> list[tuple[float, float]]:
        return [(point.x, point.y) for point in self.camera_points]


class ContactSegmenter:
    """Collect one stroke between touch down and touch up."""

    def __init__(
        self,
        *,
        camera_lag_ns: int = DEFAULT_CAMERA_LAG_NS,
        camera_margin_ns: int = CAMERA_WINDOW_MARGIN_NS,
        post_roll_ns: int = CAMERA_POST_ROLL_NS,
    ) -> None:
        if min(camera_lag_ns, camera_margin_ns, post_roll_ns) < 0:
            raise ValueError("camera timing parameters must be non-negative")
        self.camera_lag_ns = camera_lag_ns
        self.camera_margin_ns = camera_margin_ns
        self.post_roll_ns = post_roll_ns
        self._active: dict[PadRole, _ActiveStroke] = {}
        self._pending: list[_PendingStroke] = []
        self._camera: deque[CameraObservation] = deque()

    def add_camera_frame(
        self,
        timestamp_ns: int,
        points: Iterable[CameraPoint],
    ) -> None:
        self._camera.append(CameraObservation(timestamp_ns, tuple(points)))
        cutoff = timestamp_ns - CAMERA_HISTORY_NS
        while self._camera and self._camera[0].timestamp_ns < cutoff:
            self._camera.popleft()

    def add_touch_frame(self, frame: TouchFrame) -> None:
        role = frame.role
        contacts = frame.contacts
        active = self._active.get(role)

        if not contacts:
            if active is not None:
                self._pending.append(_PendingStroke(active, frame.timestamp_ns))
                del self._active[role]
            return

        if active is None:
            first = contacts[0]
            active = _ActiveStroke(role, first.identifier, frame.timestamp_ns)
            self._active[role] = active

        if len(contacts) != 1 or contacts[0].identifier != active.contact_id:
            active.multi_contact = True

        contact = contacts[0]
        active.trackpad_points.append((frame.timestamp_ns, contact.x, contact.y))

    def flush(self, now_ns: int) -> list[CompletedStroke]:
        completed: list[CompletedStroke] = []
        remaining: list[_PendingStroke] = []
        for pending in self._pending:
            if now_ns < pending.up_ns + self.post_roll_ns:
                remaining.append(pending)
                continue
            completed.append(self._complete(pending))
        self._pending = remaining
        return completed

    def reset(self) -> None:
        self._active.clear()
        self._pending.clear()
        self._camera.clear()

    def _complete(self, pending: _PendingStroke) -> CompletedStroke:
        # Continuity Camera is delayed, so shift the touch interval before
        # selecting the matching fingertip points.
        start = (
            pending.active.down_ns
            + self.camera_lag_ns
            - self.camera_margin_ns
        )
        end = pending.up_ns + self.camera_lag_ns + self.camera_margin_ns
        observations = [obs for obs in self._camera if start <= obs.timestamp_ns <= end]
        points = tuple(
            point
            for observation in observations
            for point in observation.points
            if point.role == pending.active.role
        )
        return CompletedStroke(
            role=pending.active.role,
            trackpad_points=tuple(pending.active.trackpad_points),
            camera_points=points,
            multi_contact=pending.active.multi_contact,
        )


def robust_position(points: Iterable[tuple[float, float]]) -> tuple[float, float] | None:
    values = np.asarray(list(points), dtype=float)
    if values.size == 0:
        return None
    return float(np.median(values[:, 0])), float(np.median(values[:, 1]))
