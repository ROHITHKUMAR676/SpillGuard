from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from schemas.common import GeoJSONPolygon


class CaseCreate(BaseModel):
    title: str
    aoi: GeoJSONPolygon
    time_window_start: datetime
    time_window_end: datetime


class CaseOut(BaseModel):
    id: UUID
    title: str
    status: Literal["open", "reviewed", "closed"]
    aoi: GeoJSONPolygon
    time_window_start: datetime
    time_window_end: datetime
    created_at: datetime
