from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from schemas.common import GeoJSONMultiPolygon, GeoJSONPoint


class OilSlick(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: UUID
    event_id: Optional[str] = None
    scene_id: UUID
    acquisition_timestamp: Optional[datetime] = None
    processing_timestamp: Optional[datetime] = None
    source: Optional[str] = None
    geometry: GeoJSONMultiPolygon
    crs: Optional[str] = None
    bbox: Optional[list[float]] = None
    area_km2: float
    perimeter_km: float
    centroid: GeoJSONPoint
    orientation_deg: Optional[float]
    confidence: float = Field(ge=0, le=1)
    possible_lookalike: bool
    lookalike_reason: Optional[str]
    model_version: str
    v4_threshold: Optional[float] = None
    v3_threshold: Optional[float] = None
    candidate_count: Optional[int] = None
    accepted_candidates: Optional[int] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    created_at: datetime
