import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.db import get_db

router = APIRouter()


@router.get("/scenes/search")
def search_scenes(bbox: str = Query(...), start: datetime = Query(...), end: datetime = Query(...), db: Session = Depends(get_db)):
    min_lon, min_lat, max_lon, max_lat = [float(part) for part in bbox.split(",")]
    rows = db.execute(
        text(
            """
            SELECT id, case_id, sensor, acquisition_time, ST_AsGeoJSON(footprint)::json AS footprint,
                   polarization, local_object_key, checksum, created_at
            FROM satellite_scenes
            WHERE acquisition_time BETWEEN :start AND :end
              AND ST_Intersects(footprint, ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326))
            ORDER BY acquisition_time DESC
            """
        ),
        {"start": start, "end": end, "min_lon": min_lon, "min_lat": min_lat, "max_lon": max_lon, "max_lat": max_lat},
    ).mappings().all()
    return [{**dict(row), "footprint": row["footprint"] if isinstance(row["footprint"], dict) else json.loads(row["footprint"])} for row in rows]
