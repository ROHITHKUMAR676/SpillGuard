"""Lightweight Euler advection utilities for controlled drift runs."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, degrees, radians

METERS_PER_DEG_LAT = 111_320.0


@dataclass(frozen=True)
class DriftPoint:
    longitude: float
    latitude: float
    hours_from_detection: float


@dataclass(frozen=True)
class SyntheticForcing:
    eastward_mps: float
    northward_mps: float
    windage_factor: float = 0.03
    name: str = "synthetic_copernicus_era5_euler"


def euler_advect(
    longitude: float,
    latitude: float,
    forcing: SyntheticForcing,
    hours: float,
    step_hours: float = 1.0,
) -> list[DriftPoint]:
    if step_hours <= 0:
        raise ValueError("step_hours must be positive")

    direction = 1.0 if hours >= 0 else -1.0
    remaining = abs(hours)
    current_lon = longitude
    current_lat = latitude
    elapsed = 0.0
    points = [DriftPoint(current_lon, current_lat, elapsed)]

    while remaining > 1e-9:
        step = min(step_hours, remaining)
        current_lon, current_lat = advect_once(
            current_lon,
            current_lat,
            forcing.eastward_mps * direction,
            forcing.northward_mps * direction,
            step,
        )
        elapsed += step * direction
        points.append(DriftPoint(current_lon, current_lat, elapsed))
        remaining -= step

    return points


def advect_once(longitude: float, latitude: float, eastward_mps: float, northward_mps: float, hours: float) -> tuple[float, float]:
    seconds = hours * 3600.0
    next_lat = latitude + (northward_mps * seconds) / METERS_PER_DEG_LAT
    meters_per_deg_lon = METERS_PER_DEG_LAT * cos(radians(latitude))
    next_lon = longitude + (eastward_mps * seconds) / meters_per_deg_lon
    return next_lon, next_lat


def bearing_degrees(start_lon: float, start_lat: float, end_lon: float, end_lat: float) -> float:
    mean_lat = radians((start_lat + end_lat) / 2.0)
    east_m = (end_lon - start_lon) * METERS_PER_DEG_LAT * cos(mean_lat)
    north_m = (end_lat - start_lat) * METERS_PER_DEG_LAT
    return (degrees(atan2(east_m, north_m)) + 360.0) % 360.0
