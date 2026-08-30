"""Synthetic AIS provider for Track D development/test data."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import cos, radians, sin
from pathlib import Path
from typing import Iterable

from shapely.geometry import Polygon

from modules.drift.advection import METERS_PER_DEG_LAT


@dataclass(frozen=True)
class AISObservation:
    mmsi: str
    imo: str | None
    vessel_name: str | None
    flag: str | None
    vessel_type: str | None
    timestamp: datetime
    latitude: float
    longitude: float
    sog_knots: float | None
    cog_deg: float | None
    heading_deg: float | None
    nav_status: str | None
    source: str = "synthetic"
    case_id: str | None = None
    release_time_ground_truth: datetime | None = None
    source_lat_ground_truth: float | None = None
    source_lon_ground_truth: float | None = None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


class SyntheticAISProvider:
    def __init__(self, csv_path: str | Path):
        self.csv_path = Path(csv_path)

    def load(self) -> list[AISObservation]:
        if not self.csv_path.exists():
            raise FileNotFoundError(f"Synthetic AIS CSV not found: {self.csv_path}")

        observations: list[AISObservation] = []
        with self.csv_path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                source = row.get("source") or "synthetic"
                if source != "synthetic":
                    raise ValueError(f"Unsupported AIS source {source!r}; expected 'synthetic'")
                observations.append(
                    AISObservation(
                        mmsi=str(row["mmsi"]),
                        imo=row.get("imo") or None,
                        vessel_name=row.get("vessel_name") or None,
                        flag=row.get("flag") or None,
                        vessel_type=row.get("vessel_type") or None,
                        timestamp=_parse_datetime(row.get("timestamp")) or datetime.min,
                        latitude=float(row["latitude"]),
                        longitude=float(row["longitude"]),
                        sog_knots=_parse_float(row.get("sog_knots")),
                        cog_deg=_parse_float(row.get("cog_deg")),
                        heading_deg=_parse_float(row.get("heading_deg")),
                        nav_status=row.get("nav_status") or None,
                        source=source,
                        case_id=row.get("case_id") or None,
                        release_time_ground_truth=_parse_datetime(row.get("release_time_ground_truth")),
                        source_lat_ground_truth=_parse_float(row.get("source_lat_ground_truth")),
                        source_lon_ground_truth=_parse_float(row.get("source_lon_ground_truth")),
                    )
                )
        return sorted(observations, key=lambda item: (item.mmsi, item.timestamp))

    def tracks(self) -> dict[str, list[AISObservation]]:
        tracks: dict[str, list[AISObservation]] = {}
        for observation in self.load():
            tracks.setdefault(observation.mmsi, []).append(observation)
        return tracks


def validate_observations(observations: Iterable[AISObservation]) -> None:
    rows = list(observations)
    if not rows:
        raise ValueError("Synthetic AIS dataset is empty")
    if any(row.source != "synthetic" for row in rows):
        raise ValueError("Synthetic AIS dataset contains non-synthetic rows")
    if any(not -90 <= row.latitude <= 90 or not -180 <= row.longitude <= 180 for row in rows):
        raise ValueError("Synthetic AIS dataset contains invalid coordinates")


def generate_controlled_attribution_tracks(
    region: Polygon,
    window_start: datetime,
    window_end: datetime,
    drift_corridor_bearing_deg: float,
    mmsi_prefix: str = "419910",
    vessel_prefix: str = "SG",
    variant: int = 0,
) -> list[AISObservation]:
    center = region.centroid
    window_hours = max((window_end - window_start).total_seconds() / 3600.0, 1.0)
    step = timedelta(hours=window_hours / 4.0)
    times = [window_start + step * index for index in range(5)]
    opposite = (drift_corridor_bearing_deg + 180.0) % 360.0
    cross = (drift_corridor_bearing_deg + 90.0) % 360.0
    bearing_bias = (variant % 5) * 6.0
    strong_bearing = (drift_corridor_bearing_deg + bearing_bias) % 360.0
    loiter_cross = (cross - (variant % 4) * 5.0) % 360.0
    distant_offset_km = 8.0 + (variant % 5) * 2.2
    gap_minutes = 20 + (variant % 4) * 10

    observations: list[AISObservation] = []
    observations.extend(
        _track(
            mmsi=f"{mmsi_prefix}001",
            vessel_name=f"{vessel_prefix}-STRONG-SPATIAL",
            times=times,
            positions=[
                _offset(center.x, center.y, strong_bearing, km)
                for km in [-1.8 - variant * 0.12, -0.8, 0.0, 0.8, 1.8 + variant * 0.12]
            ],
            sog_knots=[6.0 + variant * 0.25, 5.8 + variant * 0.2, 5.6 + variant * 0.18, 5.7 + variant * 0.2, 6.1 + variant * 0.24],
            cog_deg=strong_bearing,
            nav_status="UNDER_WAY",
        )
    )
    observations.extend(
        _track(
            mmsi=f"{mmsi_prefix}002",
            vessel_name=f"{vessel_prefix}-BEHAVIOURAL-LOITER",
            times=times,
            positions=[
                _offset(center.x, center.y, loiter_cross, km)
                for km in [-0.5, -0.12 - variant * 0.02, 0.08, -0.18, 0.22 + variant * 0.02]
            ],
            sog_knots=[0.7, 0.5 + variant * 0.03, 0.4, 0.8 + variant * 0.02, 0.5],
            cog_deg=opposite,
            nav_status="RESTRICTED_MANEUVERABILITY",
        )
    )
    observations.extend(
        _track(
            mmsi=f"{mmsi_prefix}003",
            vessel_name=f"{vessel_prefix}-WEAK-DISTANT",
            times=times,
            positions=[
                _offset(center.x, center.y, cross, km)
                for km in [distant_offset_km, distant_offset_km + 0.4, distant_offset_km + 0.8, distant_offset_km + 1.0, distant_offset_km + 1.4]
            ],
            sog_knots=[10.2 + variant * 0.3, 10.8 + variant * 0.25, 10.5 + variant * 0.2, 11.0 + variant * 0.22, 10.6 + variant * 0.18],
            cog_deg=cross,
            nav_status="UNDER_WAY",
        )
    )
    observations.extend(
        _track(
            mmsi=f"{mmsi_prefix}004",
            vessel_name=f"{vessel_prefix}-GAPPY-CANDIDATE",
            times=[window_start - timedelta(minutes=30 + variant * 3), window_start + timedelta(minutes=gap_minutes), window_end + timedelta(minutes=40 + variant * 4)],
            positions=[
                _offset(center.x, center.y, drift_corridor_bearing_deg, -1.0),
                _offset(center.x, center.y, drift_corridor_bearing_deg, 0.0),
                _offset(center.x, center.y, drift_corridor_bearing_deg, 1.0),
            ],
            sog_knots=[4.5 + variant * 0.15, 0.9 + variant * 0.04, 5.2 + variant * 0.2],
            cog_deg=(cross + variant * 4.0) % 360.0,
            nav_status="UNDER_WAY",
        )
    )
    observations.extend(
        _track(
            mmsi=f"{mmsi_prefix}099",
            vessel_name=f"{vessel_prefix}-NONCANDIDATE-FAR",
            times=times,
            positions=[
                _offset(center.x, center.y, cross, km)
                for km in [35.0, 36.0, 37.0, 38.0, 39.0]
            ],
            sog_knots=[12.0, 12.0, 12.0, 12.0, 12.0],
            cog_deg=cross,
            nav_status="UNDER_WAY",
        )
    )
    return sorted(observations, key=lambda item: (item.mmsi, item.timestamp))


def _track(
    mmsi: str,
    vessel_name: str,
    times: list[datetime],
    positions: list[tuple[float, float]],
    sog_knots: list[float],
    cog_deg: float,
    nav_status: str,
) -> list[AISObservation]:
    return [
        AISObservation(
            mmsi=mmsi,
            imo=None,
            vessel_name=vessel_name,
            flag="IN",
            vessel_type="tanker",
            timestamp=timestamp,
            latitude=lat,
            longitude=lon,
            sog_knots=sog_knots[index],
            cog_deg=round(cog_deg, 3),
            heading_deg=round(cog_deg, 3),
            nav_status=nav_status,
            source="synthetic",
        )
        for index, (timestamp, (lon, lat)) in enumerate(zip(times, positions))
    ]


def _offset(lon: float, lat: float, bearing_deg: float, km: float) -> tuple[float, float]:
    bearing = radians(bearing_deg)
    north_m = cos(bearing) * km * 1000.0
    east_m = sin(bearing) * km * 1000.0
    next_lat = lat + north_m / METERS_PER_DEG_LAT
    next_lon = lon + east_m / (METERS_PER_DEG_LAT * cos(radians(lat)))
    return next_lon, next_lat
