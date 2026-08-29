import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.db import get_db

router = APIRouter()


@router.get("/vessels")
def vessels(bbox: str = Query(...), start: datetime = Query(...), end: datetime = Query(...), db: Session = Depends(get_db)):
    min_lon, min_lat, max_lon, max_lat = [float(part) for part in bbox.split(",")]
    rows = db.execute(
        text(
            """
            SELECT vp.vessel_id, vp.ts, ST_X(vp.position) AS lon, ST_Y(vp.position) AS lat,
                   vp.sog_knots, vp.cog_deg, vp.heading_deg, vp.nav_status, vp.source,
                   v.mmsi, v.name, v.flag, v.vessel_type
            FROM vessel_positions vp
            JOIN vessels v ON v.id = vp.vessel_id
            WHERE vp.ts BETWEEN :start AND :end
              AND ST_Intersects(vp.position, ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326))
            ORDER BY vp.ts
            """
        ),
        {"start": start, "end": end, "min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat},
    ).mappings().all()
    return [dict(row) for row in rows]
