from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class GeoJSONPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[list[float]]]


class GeoJSONMultiPolygon(BaseModel):
    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: list[list[list[list[float]]]]


class GeoJSONPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: list[float]


class JobOut(BaseModel):
    id: UUID
    job_type: Literal["detect", "drift", "vessel_analysis", "report"]
    status: Literal["queued", "running", "succeeded", "failed"]
    progress: float = 0
    result_ref: Optional[UUID] = None
    error: Optional[str] = None


class ErrorEnvelope(BaseModel):
    error: dict
