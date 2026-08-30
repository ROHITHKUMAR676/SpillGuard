from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from schemas.common import GeoJSONPolygon


class DriftRunRequest(BaseModel):
    slick_id: UUID
    backward_hours: int = 48
    forward_hours: int = 72
    ensemble_size: int = 20


class SourceHypothesis(BaseModel):
    id: UUID
    drift_run_id: UUID
    probability_surface_object_key: str
    probable_source_region: GeoJSONPolygon
    time_window_start: datetime
    time_window_end: datetime
    confidence: Literal["low", "medium", "high"]
    drift_corridor_bearing_deg: float


class ForecastContour(BaseModel):
    horizon_hours: int
    percentile: Literal[50, 80, 95]
    polygon: GeoJSONPolygon


class ForwardForecast(BaseModel):
    drift_run_id: UUID
    contours: list[ForecastContour]
