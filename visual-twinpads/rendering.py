"""Drawing helpers for the camera overlay."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable

import numpy as np


TextSpec = tuple[
    str,
    tuple[float, float],
    int,
    tuple[int, int, int],
    str,
]

_FONT_CANDIDATES = (
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
)


@lru_cache(maxsize=16)
def _unicode_font(size: int):
    from PIL import ImageFont

    for path in _FONT_CANDIDATES:
        if path.is_file():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def draw_unicode_texts(frame: np.ndarray, specs: Iterable[TextSpec]) -> np.ndarray:
    """Draw UTF-8 labels on a BGR/BGRA OpenCV frame with Pillow."""

    from PIL import Image, ImageDraw

    if frame.ndim != 3 or frame.shape[2] not in (3, 4):
        raise ValueError("frame must be a BGR or BGRA image")
    channels = frame.shape[2]
    if channels == 3:
        converted = frame[:, :, ::-1]
    else:
        converted = frame[:, :, [2, 1, 0, 3]]
    image = Image.fromarray(np.ascontiguousarray(converted))
    draw = ImageDraw.Draw(image)
    for text, position, size, bgr, anchor in specs:
        fill = (bgr[2], bgr[1], bgr[0])
        if channels == 4:
            fill = (*fill, 255)
        draw.text(position, text, font=_unicode_font(size), fill=fill, anchor=anchor)
    rendered = np.asarray(image)
    if channels == 3:
        return np.ascontiguousarray(rendered[:, :, ::-1])
    return np.ascontiguousarray(rendered[:, :, [2, 1, 0, 3]])
