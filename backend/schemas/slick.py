from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from schemas.common import GeoJSONMultiPolygon, GeoJSONPoint


class OilSlick(BaseModel):
    id: UUID
    scene_id: UUID
    geometry: GeoJSONMultiPolygon
    area_km2: float
    perimeter_km: float
    centroid: GeoJSONPoint
    orientation_deg: Optional[float]
    confidence: float = Field(ge=0, le=1)
    possible_lookalike: bool
    lookalike_reason: Optional[str]
    model_version: str
    created_at: datetime
