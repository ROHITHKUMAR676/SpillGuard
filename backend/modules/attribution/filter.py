"""Candidate filtering for Track D attribution."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from shapely.geometry import Polygon

from modules.ais.synthetic import AISObservation
from modules.attribution.geo import point_to_region_distance_km

SOURCE_BUFFER_KM = 10.0
TIME_BUFFER_HOURS = 6


@dataclass(frozen=True)
class SourceHypothesis:
    probable_source_region: Polygon
    time_window_start: datetime
    time_window_end: datetime
    confidence: str


def filter_candidate_tracks(
    tracks: dict[str, list[AISObservation]],
    source_hypothesis: SourceHypothesis,
    buffer_km: float = SOURCE_BUFFER_KM,
    time_buffer_hours: int = TIME_BUFFER_HOURS,
) -> dict[str, list[AISObservation]]:
    widened_start = source_hypothesis.time_window_start - timedelta(hours=time_buffer_hours)
    widened_end = source_hypothesis.time_window_end + timedelta(hours=time_buffer_hours)
    candidates: dict[str, list[AISObservation]] = {}

    for mmsi, track in tracks.items():
        relevant = [point for point in track if widened_start <= point.timestamp <= widened_end]
        if not relevant:
            continue
        if any(
            point_to_region_distance_km(point.latitude, point.longitude, source_hypothesis.probable_source_region)
            <= buffer_km
            for point in relevant
        ):
            candidates[mmsi] = track

    return candidates
