"""Deterministic Euler drift engine for synthetic integration scenarios."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from shapely import affinity
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union

from modules.drift.advection import SyntheticForcing, bearing_degrees, euler_advect


@dataclass(frozen=True)
class SlickInput:
    geometry: MultiPolygon
    centroid: Point
    acquisition_timestamp: datetime
    case_time_window_start: datetime
    case_time_window_end: datetime


@dataclass(frozen=True)
class SourceHypothesisResult:
    probable_source_region: Polygon
    time_window_start: datetime
    time_window_end: datetime
    confidence: str
    drift_corridor_bearing_deg: float
    trajectory: list[tuple[float, float]]


@dataclass(frozen=True)
class DriftResult:
    source_hypothesis: SourceHypothesisResult
    forecast_envelopes: dict[int, Polygon]
    forcing: SyntheticForcing


class EulerDriftEngine:
    """Runs a controlled Euler backtrack/forecast from the persisted slick state."""

    def __init__(self, forcing: SyntheticForcing | None = None):
        self.forcing = forcing or SyntheticForcing(eastward_mps=0.11, northward_mps=0.06)

    def run(self, slick: SlickInput, backward_hours: int, forward_hours: int) -> DriftResult:
        if backward_hours <= 0:
            raise ValueError("backward_hours must be positive")
        if forward_hours <= 0:
            raise ValueError("forward_hours must be positive")

        backtrack = euler_advect(
            slick.centroid.x,
            slick.centroid.y,
            self.forcing,
            hours=-float(backward_hours),
            step_hours=1.0,
        )
        source_point = Point(backtrack[-1].longitude, backtrack[-1].latitude)
        probable_source_region = source_region_from_slick(slick.geometry, slick.centroid, source_point)

        window_end = slick.acquisition_timestamp - timedelta(hours=max(1, int(backward_hours * 0.65)))
        window_start = slick.acquisition_timestamp - timedelta(hours=backward_hours)
        window_start = max(window_start, slick.case_time_window_start)
        window_end = min(window_end, slick.case_time_window_end, slick.acquisition_timestamp)
        if window_end <= window_start:
            window_end = min(slick.acquisition_timestamp, window_start + timedelta(hours=1))

        bearing = bearing_degrees(source_point.x, source_point.y, slick.centroid.x, slick.centroid.y)
        forecast_envelopes = forecast_from_slick(slick.geometry, self.forcing, forward_hours)

        return DriftResult(
            source_hypothesis=SourceHypothesisResult(
                probable_source_region=probable_source_region,
                time_window_start=window_start,
                time_window_end=window_end,
                confidence="medium",
                drift_corridor_bearing_deg=round(bearing, 3),
                trajectory=[(point.longitude, point.latitude) for point in backtrack],
            ),
            forecast_envelopes=forecast_envelopes,
            forcing=self.forcing,
        )


def source_region_from_slick(slick_geometry: MultiPolygon, slick_centroid: Point, source_point: Point) -> Polygon:
    source_shape = affinity.scale(slick_geometry, xfact=0.42, yfact=0.42, origin=(slick_centroid.x, slick_centroid.y))
    source_shape = affinity.translate(
        source_shape,
        xoff=source_point.x - slick_centroid.x,
        yoff=source_point.y - slick_centroid.y,
    )
    polygon = unary_union(source_shape)
    if isinstance(polygon, MultiPolygon):
        polygon = max(polygon.geoms, key=lambda geom: geom.area)
    return polygon.buffer(0)


def forecast_from_slick(slick_geometry: MultiPolygon, forcing: SyntheticForcing, forward_hours: int) -> dict[int, Polygon]:
    forecast_point = euler_advect(
        slick_geometry.centroid.x,
        slick_geometry.centroid.y,
        forcing,
        hours=float(forward_hours),
        step_hours=1.0,
    )[-1]
    dx = forecast_point.longitude - slick_geometry.centroid.x
    dy = forecast_point.latitude - slick_geometry.centroid.y
    envelopes: dict[int, Polygon] = {}
    for percentile, scale in [(50, 1.18), (80, 1.45), (95, 1.75)]:
        shifted = affinity.translate(slick_geometry, xoff=dx, yoff=dy)
        expanded = affinity.scale(shifted, xfact=scale, yfact=scale, origin=(forecast_point.longitude, forecast_point.latitude))
        polygon = unary_union(expanded)
        if isinstance(polygon, MultiPolygon):
            polygon = polygon.convex_hull
        envelopes[percentile] = polygon.buffer(0)
    return envelopes
