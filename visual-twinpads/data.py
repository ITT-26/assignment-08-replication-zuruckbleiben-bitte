"""Shared, dependency-free data structures for input and task processing."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


PadRole = Literal["built-in", "external", "unknown"]


@dataclass(frozen=True, slots=True)
class Contact:
    """One normalized touch contact reported by a physical trackpad."""

    identifier: int
    x: float
    y: float


@dataclass(frozen=True, slots=True)
class TouchFrame:
    """A timestamped contact frame from one physical trackpad."""

    role: PadRole
    timestamp_ns: int
    contacts: tuple[Contact, ...]


@dataclass(frozen=True, slots=True)
class CameraPoint:
    """A MediaPipe index-fingertip observation mapped to a pad."""

    role: PadRole
    x: float
    y: float
