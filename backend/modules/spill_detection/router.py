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
            SELECT id, scene_id, ST_AsGeoJSON(geometry)::json AS geometry, area_km2, perimeter_km,
                   ST_AsGeoJSON(centroid)::json AS centroid, orientation_deg, confidence,
                   possible_lookalike, lookalike_reason, model_version, created_at
            FROM oil_slicks WHERE id = :id
            """
        ),
        {"id": str(id)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": "Slick not found", "details": {}})
    data = dict(row)
    data["geometry"] = data["geometry"] if isinstance(data["geometry"], dict) else json.loads(data["geometry"])
    data["centroid"] = data["centroid"] if isinstance(data["centroid"], dict) else json.loads(data["centroid"])
    return data
