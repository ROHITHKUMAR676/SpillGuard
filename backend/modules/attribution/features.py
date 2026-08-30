"""Feature extraction for Track D attribution."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from statistics import mean, median, stdev

from shapely.geometry import Point

from modules.ais.synthetic import AISObservation
from modules.attribution.filter import SourceHypothesis
from modules.attribution.geo import point_to_region_distance_km

LOITERING_SPEED_THRESHOLD_KNOTS = 2.0
AIS_GAP_THRESHOLD_HOURS = 2.0
NEUTRAL_SOURCE_PROBABILITY_NOTE = "neutral_placeholder_no_probability_surface_reader"


@dataclass(frozen=True)
class AISGap:
    gap_start: datetime
    gap_end: datetime
    duration_hours: float


@dataclass(frozen=True)
class TrackDFeatures:
    spatial_proximity_km: float
    time_in_region_h: float
    temporal_overlap_h: float
    vessel_mean_bearing_deg: float | None
    trajectory_compatibility: float | None
    source_probability: float
    source_probability_note: str
    historical_median_speed_knots: float | None
    historical_speed_std_knots: float | None
    current_median_speed_knots: float | None
    speed_anomaly: float
    loitering_h: float
    ais_gap_count_in_window: int
    has_ais_gap_in_window: bool
    ais_gaps: list[AISGap]

    def to_json(self) -> dict:
        data = asdict(self)
        data["ais_gaps"] = [
            {"gap_start": gap.gap_start.isoformat(), "gap_end": gap.gap_end.isoformat(), "duration_hours": gap.duration_hours}
            for gap in self.ais_gaps
        ]
        return data


def extract_features(track: list[AISObservation], source: SourceHypothesis) -> TrackDFeatures:
    ordered = sorted(track, key=lambda point: point.timestamp)
    region = source.probable_source_region
    distances = [point_to_region_distance_km(point.latitude, point.longitude, region) for point in ordered]
    source_window = [point for point in ordered if source.time_window_start <= point.timestamp <= source.time_window_end]
    speeds = [point.sog_knots for point in ordered if point.sog_knots is not None]
    source_speeds = [point.sog_knots for point in source_window if point.sog_knots is not None]

    historical_median = float(median(speeds)) if speeds else None
    historical_std = float(stdev(speeds)) if len(speeds) >= 2 else None
    current_median = float(median(source_speeds)) if source_speeds else None
    if current_median is not None and historical_median is not None and historical_std and historical_std > 0:
        speed_anomaly = abs(current_median - historical_median) / (historical_std + 1e-6)
    else:
        speed_anomaly = 0.0

    gaps = detect_ais_gaps(ordered)
    relevant_gaps = [gap for gap in gaps if gap.gap_end >= source.time_window_start and gap.gap_start <= source.time_window_end]

    vessel_bearing = first_available_bearing(
        mean_bearing_in_region(source_window, region),
        mean_available_bearing(source_window),
        mean_available_bearing(ordered),
    )

    return TrackDFeatures(
        spatial_proximity_km=min(distances) if distances else float("inf"),
        time_in_region_h=duration_inside_region(source_window, region),
        temporal_overlap_h=temporal_overlap_hours(ordered, source.time_window_start, source.time_window_end),
        vessel_mean_bearing_deg=vessel_bearing,
        trajectory_compatibility=trajectory_compatibility(vessel_bearing, source.drift_corridor_bearing_deg),
        source_probability=0.5,
        source_probability_note=NEUTRAL_SOURCE_PROBABILITY_NOTE,
        historical_median_speed_knots=historical_median,
        historical_speed_std_knots=historical_std,
        current_median_speed_knots=current_median,
        speed_anomaly=float(speed_anomaly),
        loitering_h=loitering_hours(source_window, region),
        ais_gap_count_in_window=len(relevant_gaps),
        has_ais_gap_in_window=bool(relevant_gaps),
        ais_gaps=relevant_gaps,
    )


def detect_ais_gaps(track: list[AISObservation]) -> list[AISGap]:
    gaps: list[AISGap] = []
    for previous, current in zip(track, track[1:]):
        duration = (current.timestamp - previous.timestamp).total_seconds() / 3600.0
        if duration >= AIS_GAP_THRESHOLD_HOURS:
            gaps.append(AISGap(previous.timestamp, current.timestamp, duration))
    return gaps


def duration_inside_region(track: list[AISObservation], region) -> float:
    duration = 0.0
    for previous, current in zip(track, track[1:]):
        delta = (current.timestamp - previous.timestamp).total_seconds() / 3600.0
        if _inside(previous, region) and _inside(current, region) and delta < AIS_GAP_THRESHOLD_HOURS:
            duration += delta
    return duration


def temporal_overlap_hours(track: list[AISObservation], window_start, window_end) -> float:
    if not track:
        return 0.0
    overlap_start = max(track[0].timestamp, window_start)
    overlap_end = min(track[-1].timestamp, window_end)
    if overlap_end <= overlap_start:
        return 0.0
    return (overlap_end - overlap_start).total_seconds() / 3600.0


def mean_bearing_in_region(track: list[AISObservation], region) -> float | None:
    bearings: list[float] = []
    for previous, current in zip(track, track[1:]):
        if _inside(previous, region) or _inside(current, region):
            bearings.append(current.cog_deg or 0.0)
    return float(mean(bearings)) if bearings else None


def mean_available_bearing(track: list[AISObservation]) -> float | None:
    bearings = [point.cog_deg for point in track if point.cog_deg is not None]
    return float(mean(bearings)) if bearings else None


def first_available_bearing(*bearings: float | None) -> float | None:
    return next((bearing for bearing in bearings if bearing is not None), None)


def trajectory_compatibility(vessel_bearing_deg: float | None, drift_corridor_bearing_deg: float | None) -> float | None:
    if vessel_bearing_deg is None or drift_corridor_bearing_deg is None:
        return None
    diff = abs((vessel_bearing_deg - drift_corridor_bearing_deg + 180.0) % 360.0 - 180.0)
    return max(0.0, 1.0 - diff / 180.0)


def loitering_hours(track: list[AISObservation], region) -> float:
    duration = 0.0
    for previous, current in zip(track, track[1:]):
        delta = (current.timestamp - previous.timestamp).total_seconds() / 3600.0
        if _inside(previous, region) and _inside(current, region) and (current.sog_knots or 0) <= LOITERING_SPEED_THRESHOLD_KNOTS and delta < AIS_GAP_THRESHOLD_HOURS:
            duration += delta
    return duration


def detect_region_events(track: list[AISObservation], source: SourceHypothesis) -> list[dict]:
    window_track = [point for point in track if source.time_window_start <= point.timestamp <= source.time_window_end]
    events: list[dict] = []
    was_inside = False
    for point in window_track:
        is_inside = _inside(point, source.probable_source_region)
        if not was_inside and is_inside:
            events.append({"event_type": "SOURCE_REGION_ENTRY", "timestamp": point.timestamp, "latitude": point.latitude, "longitude": point.longitude})
        elif was_inside and not is_inside:
            events.append({"event_type": "SOURCE_REGION_EXIT", "timestamp": point.timestamp, "latitude": point.latitude, "longitude": point.longitude})
        was_inside = is_inside
    return events


def _inside(point: AISObservation, region) -> bool:
    geometry = Point(point.longitude, point.latitude)
    return region.contains(geometry) or region.touches(geometry)
