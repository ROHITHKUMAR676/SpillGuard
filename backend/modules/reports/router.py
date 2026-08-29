from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.db import get_db
from modules.cases.router import current_user

router = APIRouter()


@router.post("/cases/{id}/reports")
def create_report(id: UUID, format: str = "json", db: Session = Depends(get_db), user=Depends(current_user)):
    if format not in {"json", "pdf"}:
        raise HTTPException(status_code=422, detail={"code": "invalid_format", "message": "Report format must be json or pdf", "details": {}})
    row = db.execute(
        text(
            """
            INSERT INTO reports (case_id, object_key, format)
            VALUES (:case_id, :object_key, :format)
            RETURNING id, case_id, object_key, format, created_at
            """
        ),
        {"case_id": str(id), "object_key": f"cases/{id}/reports/pending.{format}", "format": format},
    ).mappings().one()
    db.commit()
    return dict(row)


@router.get("/reports/{id}")
def get_report(id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, case_id, object_key, format, created_at FROM reports WHERE id = :id"),
        {"id": str(id)},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "not_found", "message": "Report not found", "details": {}})
    return dict(row)
