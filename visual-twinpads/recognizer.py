"""Assignment 6 $1 recognizer, reused as an optional extension."""

from __future__ import annotations

import math
import re


NUM_POINTS = 64
SQUARE_SIZE = 250.0
HALF_DIAGONAL = 0.5 * math.sqrt(SQUARE_SIZE * SQUARE_SIZE * 2.0)
ANGLE_RANGE = math.radians(45.0)
ANGLE_PRECISION = math.radians(2.0)
PHI = 0.5 * (-1.0 + math.sqrt(5.0))

REQUIRED_GESTURES = (
    "rectangle",
    "circle",
    "check",
    "delete_mark",
    "pigtail",
)
MIN_TRACKPAD_POINTS = 10


def display_label(name: str) -> str:
    if name == "delete_mark":
        return "delete"
    return name.replace("_", " ")


def normalize_label(name: str) -> str:
    cleaned = name.strip().lower().replace("-", "_").replace(" ", "_")
    cleaned = re.sub(r"\d+$", "", cleaned)
    if cleaned == "delete":
        return "delete_mark"
    return cleaned


def distance(first, second) -> float:
    return math.hypot(second[0] - first[0], second[1] - first[1])


def path_length(points) -> float:
    return sum(distance(start, end) for start, end in zip(points, points[1:]))


def centroid(points):
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def resample(points, num_points: int = NUM_POINTS):
    if len(points) < 2:
        raise ValueError("Need at least two points to resample a gesture.")

    original = [tuple(point) for point in points]
    total_length = path_length(original)
    if total_length == 0:
        return [original[0]] * num_points

    interval = total_length / (num_points - 1)
    accumulated = 0.0
    next_target = interval
    new_points = [original[0]]
    previous = original[0]

    for current in original[1:]:
        segment_length = distance(previous, current)
        if segment_length == 0:
            previous = current
            continue
        while accumulated + segment_length >= next_target and len(new_points) < num_points:
            ratio = (next_target - accumulated) / segment_length
            next_point = (
                previous[0] + ratio * (current[0] - previous[0]),
                previous[1] + ratio * (current[1] - previous[1]),
            )
            new_points.append(next_point)
            next_target += interval
        accumulated += segment_length
        previous = current

    while len(new_points) < num_points:
        new_points.append(original[-1])
    return new_points[:num_points]


def indicative_angle(points) -> float:
    center = centroid(points)
    return math.atan2(center[1] - points[0][1], center[0] - points[0][0])


def rotate_by(points, radians):
    center = centroid(points)
    cos_value = math.cos(radians)
    sin_value = math.sin(radians)
    rotated = []
    for x, y in points:
        dx = x - center[0]
        dy = y - center[1]
        rotated.append(
            (
                dx * cos_value - dy * sin_value + center[0],
                dx * sin_value + dy * cos_value + center[1],
            )
        )
    return rotated


def bounding_box(points):
    min_x = min(point[0] for point in points)
    max_x = max(point[0] for point in points)
    min_y = min(point[1] for point in points)
    max_y = max(point[1] for point in points)
    return min_x, min_y, max_x - min_x, max_y - min_y


def scale_to_square(points, size: float = SQUARE_SIZE):
    min_x, min_y, width, height = bounding_box(points)
    scaled = []
    for x, y in points:
        scaled_x = (x - min_x) * (size / width) if width else 0.0
        scaled_y = (y - min_y) * (size / height) if height else 0.0
        scaled.append((scaled_x, scaled_y))
    return scaled


def translate_to_origin(points):
    center = centroid(points)
    return [(x - center[0], y - center[1]) for x, y in points]


def normalize_points(points):
    prepared = resample(points, NUM_POINTS)
    prepared = rotate_by(prepared, -indicative_angle(prepared))
    prepared = scale_to_square(prepared, SQUARE_SIZE)
    prepared = translate_to_origin(prepared)
    return tuple(prepared)


def path_distance(candidate, template) -> float:
    return sum(distance(first, second) for first, second in zip(candidate, template)) / len(candidate)


def distance_at_angle(points, template, radians) -> float:
    return path_distance(rotate_by(points, radians), template)


def distance_at_best_angle(
    points,
    template,
    angle_range: float = ANGLE_RANGE,
    angle_precision: float = ANGLE_PRECISION,
) -> float:
    lower_bound = -angle_range
    upper_bound = angle_range
    x1 = PHI * lower_bound + (1.0 - PHI) * upper_bound
    f1 = distance_at_angle(points, template, x1)
    x2 = (1.0 - PHI) * lower_bound + PHI * upper_bound
    f2 = distance_at_angle(points, template, x2)

    while abs(upper_bound - lower_bound) > angle_precision:
        if f1 < f2:
            upper_bound = x2
            x2 = x1
            f2 = f1
            x1 = PHI * lower_bound + (1.0 - PHI) * upper_bound
            f1 = distance_at_angle(points, template, x1)
        else:
            lower_bound = x1
            x1 = x2
            f1 = f2
            x2 = (1.0 - PHI) * lower_bound + PHI * upper_bound
            f2 = distance_at_angle(points, template, x2)
    return min(f1, f2)


class DollarRecognizer:
    def __init__(self):
        self.templates = []

    def add_template(self, name, points) -> None:
        if len(points) < 2:
            return
        self.templates.append((normalize_label(name), normalize_points(points)))

    def recognize(self, points):
        if len(points) < 2:
            raise ValueError("Longer stroke.")
        if not self.templates:
            raise ValueError("No templates loaded.")

        candidate = normalize_points(points)
        best_template = self.templates[0]
        best_distance = distance_at_best_angle(candidate, best_template[1])
        for template in self.templates[1:]:
            template_distance = distance_at_best_angle(candidate, template[1])
            if template_distance < best_distance:
                best_distance = template_distance
                best_template = template
        score = max(0.0, 1.0 - best_distance / HALF_DIAGONAL)
        return best_template[0], score


class GestureTemplates:
    """The five personal templates collected by the optional gesture mode."""

    def __init__(self) -> None:
        self.recognizer = DollarRecognizer()

    def add(self, label: str, points: list[tuple[float, float]]) -> None:
        if label not in REQUIRED_GESTURES:
            raise ValueError(f"Unsupported gesture: {label}")
        if len(points) < MIN_TRACKPAD_POINTS:
            raise ValueError(
                f"Need at least {MIN_TRACKPAD_POINTS} points for a template."
            )
        self.recognizer.add_template(label, points)

    def recognize(self, points: list[tuple[float, float]]):
        return self.recognizer.recognize(points)
