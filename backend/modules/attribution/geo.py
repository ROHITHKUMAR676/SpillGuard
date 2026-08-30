"""Small geospatial helpers used by Track D."""

from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt

from shapely.geometry import Point, Polygon


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    p1 = radians(lat1)
    p2 = radians(lat2)
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(p1) * cos(p2) * sin(dlon / 2) ** 2
    return 2 * radius_km * atan2(sqrt(a), sqrt(1 - a))


def point_to_region_distance_km(lat: float, lon: float, region: Polygon) -> float:
    point = Point(lon, lat)
    if region.contains(point) or region.touches(point):
        return 0.0

    coords = list(region.exterior.coords)
    minimum = float("inf")
    for index in range(len(coords) - 1):
        lon1, lat1 = coords[index]
        lon2, lat2 = coords[index + 1]
        for step in range(25):
            fraction = step / 24
            boundary_lon = lon1 + fraction * (lon2 - lon1)
            boundary_lat = lat1 + fraction * (lat2 - lat1)
            minimum = min(minimum, haversine_km(lat, lon, boundary_lat, boundary_lon))
    return minimum
