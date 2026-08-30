"""Synthetic AIS provider for Track D development/test data."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


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
