from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class VesselTrackPoint(BaseModel):
    vessel_id: UUID
    ts: datetime
    lat: float
    lon: float
    sog_knots: Optional[float]
    cog_deg: Optional[float]
    heading_deg: Optional[float]
    nav_status: Optional[str]
    source: Literal["synthetic"] = "synthetic"


class VesselOut(BaseModel):
    id: UUID
    mmsi: Optional[str]
    name: Optional[str]
    flag: Optional[str]
    vessel_type: Optional[str]


class VesselEvent(BaseModel):
    id: UUID
    vessel_id: UUID
    event_type: Literal[
        "AIS_GAP",
        "UNUSUAL_STOP",
        "COURSE_DEVIATION",
        "LOITERING",
        "SOURCE_REGION_ENTRY",
        "SOURCE_REGION_EXIT",
        "SPEED_ANOMALY",
    ]
    start_time: datetime
    end_time: Optional[datetime]
    confidence: Optional[float]
