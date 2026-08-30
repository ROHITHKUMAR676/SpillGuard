import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.db import get_db
from schemas.slick import OilSlick

router = APIRouter()


@router.get("/slicks/{id}", response_model=OilSlick)
def get_slick(id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT os.id, os.event_id, os.scene_id, ss.acquisition_time AS acquisition_timestamp,
                   os.processing_timestamp, os.source, ST_AsGeoJSON(os.geometry)::json AS geometry,
                   os.crs, os.bbox, os.area_km2, os.perimeter_km,
                   ST_AsGeoJSON(os.centroid)::json AS centroid, os.orientation_deg, os.confidence,
                   os.possible_lookalike, os.lookalike_reason, os.model_version,
                   os.v4_threshold, os.v3_threshold, os.candidate_count, os.accepted_candidates,
                   os.source_width, os.source_height, os.created_at
            FROM oil_slicks os
            JOIN satellite_scenes ss ON ss.id = os.scene_id
            WHERE os.id = :id
            """
        ),
        {"id": str(id)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": "Slick not found", "details": {}})
    data = dict(row)
    data["geometry"] = data["geometry"] if isinstance(data["geometry"], dict) else json.loads(data["geometry"])
    data["centroid"] = data["centroid"] if isinstance(data["centroid"], dict) else json.loads(data["centroid"])
    data["bbox"] = data["bbox"] if isinstance(data["bbox"], list) else json.loads(data["bbox"] or "null")
    return data
