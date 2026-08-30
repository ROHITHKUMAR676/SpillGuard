import json
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.db import get_db
from core.security import create_access_token, decode_access_token, verify_password
from modules.cases.jobs import enqueue_job
from modules.attribution.explanation import answer_investigator, explain_candidate
from schemas.case import CaseCreate, CaseOut
from schemas.common import JobOut
from schemas.drift import DriftRunRequest

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


class LoginRequest(BaseModel):
    username: str
    password: str


class DetectRequest(BaseModel):
    scene_id: UUID | None = None


class FeedbackRequest(BaseModel):
    action: Literal[
        "accept_detection",
        "reject_detection",
        "edit_polygon",
        "exclude_candidate",
        "note",
        "close_case",
        "reopen_case",
    ]
    payload: dict[str, Any] = {}


class ObservationRequest(BaseModel):
    payload: dict[str, Any] = {}


class InvestigatorQuestion(BaseModel):
    question: str
    vessel_id: UUID | None = None


def error(status_code: int, code: str, message: str, details: dict | None = None) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message, "details": details or {}})


def geojson(value: str | dict) -> dict:
    return value if isinstance(value, dict) else json.loads(value)


def case_out(row) -> dict:
    data = dict(row)
    data["aoi"] = geojson(data["aoi"])
    return data


def job_out(row) -> dict:
    return dict(row)


def current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        raise error(status.HTTP_401_UNAUTHORIZED, "unauthorized", "Authentication required")
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise error(status.HTTP_401_UNAUTHORIZED, "unauthorized", "Invalid token")
    user = db.execute(
        text("SELECT id, username, role FROM users WHERE id = :id"),
        {"id": payload.get("sub")},
    ).mappings().first()
    if not user:
        raise error(status.HTTP_401_UNAUTHORIZED, "unauthorized", "User not found")
    return user


@router.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        text("SELECT id, username, password_hash, role FROM users WHERE username = :username"),
        {"username": payload.username},
    ).mappings().first()
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Invalid username or password")
    token = create_access_token(str(user["id"]), {"role": user["role"], "username": user["username"]})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/cases", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreate, db: Session = Depends(get_db), user=Depends(current_user)):
    row = db.execute(
        text(
            """
            INSERT INTO cases (title, aoi, time_window_start, time_window_end, created_by)
            VALUES (:title, ST_SetSRID(ST_GeomFromGeoJSON(:aoi), 4326), :start, :end, :user_id)
            RETURNING id, title, status, ST_AsGeoJSON(aoi)::json AS aoi,
                      time_window_start, time_window_end, created_at
            """
        ),
        {
            "title": payload.title,
            "aoi": payload.aoi.model_dump_json(),
            "start": payload.time_window_start,
            "end": payload.time_window_end,
            "user_id": str(user["id"]),
        },
    ).mappings().one()
    db.commit()
    return case_out(row)


@router.get("/cases", response_model=list[CaseOut])
def list_cases(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT id, title, status, ST_AsGeoJSON(aoi)::json AS aoi,
                   time_window_start, time_window_end, created_at
            FROM cases ORDER BY created_at DESC
            """
        )
    ).mappings().all()
    return [case_out(row) for row in rows]


@router.get("/cases/recent")
def recent_cases(limit: int = 20, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT c.id, c.title, c.status, ST_AsGeoJSON(c.aoi)::json AS aoi,
                   c.time_window_start, c.time_window_end, c.created_at,
                   os.id AS latest_slick_id,
                   sh.id AS latest_source_id,
                   b.id AS latest_batch_id,
                   b.status AS latest_batch_status,
                   COALESCE(candidate_counts.candidate_count, 0) AS candidate_count,
                   candidate_counts.top_score
            FROM cases c
            LEFT JOIN LATERAL (
                SELECT os.id
                FROM oil_slicks os
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                WHERE ss.case_id = c.id
                ORDER BY os.created_at DESC
                LIMIT 1
            ) os ON true
            LEFT JOIN LATERAL (
                SELECT sh.id
                FROM source_hypotheses sh
                JOIN drift_runs dr ON dr.id = sh.drift_run_id
                JOIN oil_slicks os2 ON os2.id = dr.slick_id
                JOIN satellite_scenes ss2 ON ss2.id = os2.scene_id
                WHERE ss2.case_id = c.id
                ORDER BY sh.created_at DESC
                LIMIT 1
            ) sh ON true
            LEFT JOIN LATERAL (
                SELECT count(*) AS candidate_count, max(overall_score) AS top_score
                FROM attribution_candidates ac
                WHERE ac.case_id = c.id
            ) candidate_counts ON true
            LEFT JOIN LATERAL (
                SELECT s.batch_id
                FROM synthetic_ingestion_stage_status s
                WHERE s.case_id = c.id
                ORDER BY s.started_at DESC NULLS LAST
                LIMIT 1
            ) latest_stage ON true
            LEFT JOIN synthetic_ingestion_batches b ON b.id = latest_stage.batch_id
            ORDER BY c.created_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings().all()
    return [{**case_out(row), "latest_slick_id": row["latest_slick_id"], "latest_source_id": row["latest_source_id"], "latest_batch_id": row["latest_batch_id"], "latest_batch_status": row["latest_batch_status"], "candidate_count": row["candidate_count"], "top_score": row["top_score"]} for row in rows]


@router.get("/cases/{id}", response_model=CaseOut)
def get_case(id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT id, title, status, ST_AsGeoJSON(aoi)::json AS aoi,
                   time_window_start, time_window_end, created_at
            FROM cases WHERE id = :id
            """
        ),
        {"id": str(id)},
    ).mappings().first()
    if not row:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "Case not found")
    return case_out(row)


@router.get("/cases/{id}/slicks/latest")
def latest_slick(id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT os.id
            FROM oil_slicks os
            JOIN satellite_scenes ss ON ss.id = os.scene_id
            WHERE ss.case_id = :case_id
            ORDER BY os.created_at DESC
            LIMIT 1
            """
        ),
        {"case_id": str(id)},
    ).mappings().first()
    if not row:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "Slick not found")
    from modules.spill_detection.router import get_slick

    return get_slick(row["id"], db)


@router.get("/synthetic-ingestion/batches/recent")
def recent_synthetic_batches(limit: int = 10, db: Session = Depends(get_db)):
    batches = db.execute(
        text(
            """
            SELECT id, status, case_count, started_at, completed_at, error
            FROM synthetic_ingestion_batches
            ORDER BY started_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings().all()
    output = []
    for batch in batches:
        stages = db.execute(
            text(
                """
                SELECT case_id, stage, status, started_at, completed_at, error
                FROM synthetic_ingestion_stage_status
                WHERE batch_id = :batch_id
                ORDER BY case_id, started_at NULLS FIRST, stage
                """
            ),
            {"batch_id": str(batch["id"])},
        ).mappings().all()
        output.append({**dict(batch), "stages": [dict(stage) for stage in stages]})
    return output


@router.post("/cases/{id}/observations")
def create_observation(id: UUID, payload: ObservationRequest, db: Session = Depends(get_db), user=Depends(current_user)):
    db.execute(
        text("INSERT INTO analyst_reviews (case_id, actor_id, action, payload) VALUES (:case_id, :actor_id, 'note', CAST(:payload AS JSONB))"),
        {"case_id": str(id), "actor_id": str(user["id"]), "payload": json.dumps(payload.payload)},
    )
    db.commit()
    return {"ok": True}


@router.post("/cases/{id}/detect", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def detect(id: UUID, payload: DetectRequest, db: Session = Depends(get_db), user=Depends(current_user)):
    row = enqueue_job(db, id, "detect", [str(payload.scene_id) if payload.scene_id else ""])
    return job_out(row)


@router.post("/cases/{id}/drift", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def drift(id: UUID, payload: DriftRunRequest, db: Session = Depends(get_db), user=Depends(current_user)):
    row = enqueue_job(
        db,
        id,
        "drift",
        [str(payload.slick_id), str(payload.backward_hours), str(payload.forward_hours), str(payload.ensemble_size)],
    )
    return job_out(row)


@router.post("/cases/{id}/vessel-analysis", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def vessel_analysis(id: UUID, db: Session = Depends(get_db), user=Depends(current_user)):
    row = enqueue_job(db, id, "vessel_analysis", [str(id)])
    return job_out(row)


@router.get("/cases/{id}/source-hypothesis")
def source_hypothesis(id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT sh.id, sh.drift_run_id, sh.probability_surface_object_key,
                   ST_AsGeoJSON(sh.probable_source_region)::json AS probable_source_region,
                   sh.time_window_start, sh.time_window_end, sh.confidence,
                   sh.drift_corridor_bearing_deg
            FROM source_hypotheses sh
            JOIN drift_runs dr ON dr.id = sh.drift_run_id
            JOIN oil_slicks os ON os.id = dr.slick_id
            JOIN satellite_scenes ss ON ss.id = os.scene_id
            WHERE ss.case_id = :case_id
            ORDER BY sh.created_at DESC
            LIMIT 1
            """
        ),
        {"case_id": str(id)},
    ).mappings().first()
    if not row:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "Source hypothesis not found")
    data = dict(row)
    data["probable_source_region"] = geojson(data["probable_source_region"])
    return data


@router.get("/cases/{id}/forecast")
def forecast(id: UUID, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            WITH latest_run AS (
                SELECT dr.id
                FROM drift_runs dr
                JOIN oil_slicks os ON os.id = dr.slick_id
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                WHERE ss.case_id = :case_id
                ORDER BY dr.completed_at DESC NULLS LAST, dr.started_at DESC
                LIMIT 1
            )
            SELECT ff.drift_run_id, ff.horizon_hours, ff.percentile,
                   ST_AsGeoJSON(ff.envelope)::json AS polygon
            FROM forward_forecasts ff
            JOIN latest_run lr ON lr.id = ff.drift_run_id
            ORDER BY ff.horizon_hours, ff.percentile
            """
        ),
        {"case_id": str(id)},
    ).mappings().all()
    if not rows:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "Forecast not found")
    return {"drift_run_id": rows[0]["drift_run_id"], "contours": [{"horizon_hours": r["horizon_hours"], "percentile": r["percentile"], "polygon": geojson(r["polygon"])} for r in rows]}


@router.get("/cases/{id}/candidates")
def candidates(id: UUID, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT ac.*, v.id AS vessel_id_out, v.mmsi, v.name, v.flag, v.vessel_type
            FROM attribution_candidates ac
            JOIN vessels v ON v.id = ac.vessel_id
            WHERE ac.case_id = :case_id
            ORDER BY ac.rank
            """
        ),
        {"case_id": str(id)},
    ).mappings().all()
    return [_candidate(row) for row in rows]


@router.get("/cases/{id}/candidates/{vessel_id}/evidence")
def candidate_evidence(id: UUID, vessel_id: UUID, db: Session = Depends(get_db)):
    return _candidate_evidence_payload(id, vessel_id, db)


def _candidate_evidence_payload(id: UUID, vessel_id: UUID, db: Session) -> dict:
    row = db.execute(
        text(
            """
            SELECT ac.*, v.id AS vessel_id_out, v.mmsi, v.name, v.flag, v.vessel_type
            FROM attribution_candidates ac
            JOIN vessels v ON v.id = ac.vessel_id
            WHERE ac.case_id = :case_id AND ac.vessel_id = :vessel_id
            """
        ),
        {"case_id": str(id), "vessel_id": str(vessel_id)},
    ).mappings().first()
    if not row:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "Candidate evidence not found")
    events = db.execute(
        text(
            """
            SELECT id, event_type, start_time, end_time, ST_AsGeoJSON(geometry)::json AS geometry, confidence
            FROM vessel_events
            WHERE vessel_id = :vessel_id
            ORDER BY start_time
            """
        ),
        {"vessel_id": str(vessel_id)},
    ).mappings().all()
    candidate = _candidate(row)
    candidate["raw_features"] = _json_value(row["raw_features"])
    candidate["score_breakdown"] = _json_value(row["score_breakdown"])
    candidate["vessel_events"] = [dict(event) for event in events]
    return candidate


@router.post("/cases/{id}/candidates/{vessel_id}/explanation")
def candidate_explanation(id: UUID, vessel_id: UUID, db: Session = Depends(get_db)):
    payload = candidate_evidence(id, vessel_id, db)
    if payload.get("llm_explanation"):
        return {"explanation": payload["llm_explanation"], "stored": True}
    explanation = explain_candidate(payload)
    db.execute(
        text(
            """
            UPDATE attribution_candidates
            SET llm_explanation = :explanation,
                llm_explained_at = now()
            WHERE case_id = :case_id AND vessel_id = :vessel_id
            """
        ),
        {"case_id": str(id), "vessel_id": str(vessel_id), "explanation": explanation},
    )
    db.commit()
    return {"explanation": explanation, "stored": False}


@router.post("/cases/{id}/investigator/ask")
def investigator_ask(id: UUID, payload: InvestigatorQuestion, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT v.id AS vessel_id
            FROM attribution_candidates ac
            JOIN vessels v ON v.id = ac.vessel_id
            WHERE ac.case_id = :case_id
            ORDER BY ac.rank
            """
        ),
        {"case_id": str(id)},
    ).mappings().all()
    if not rows:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "No attribution candidates found")
    candidates_payload = [_candidate_evidence_payload(id, row["vessel_id"], db) for row in rows]
    context = {"case_id": str(id), "selected_vessel_id": str(payload.vessel_id) if payload.vessel_id else None, "candidates": candidates_payload}
    return {"answer": answer_investigator(payload.question, context)}


@router.post("/cases/{id}/feedback")
def feedback(id: UUID, payload: FeedbackRequest, db: Session = Depends(get_db), user=Depends(current_user)):
    db.execute(
        text("INSERT INTO analyst_reviews (case_id, actor_id, action, payload) VALUES (:case_id, :actor_id, :action, CAST(:payload AS JSONB))"),
        {"case_id": str(id), "actor_id": str(user["id"]), "action": payload.action, "payload": json.dumps(payload.payload)},
    )
    if payload.action == "exclude_candidate" and payload.payload.get("candidate_id"):
        db.execute(
            text("UPDATE attribution_candidates SET excluded_by_analyst = TRUE WHERE id = :id"),
            {"id": payload.payload["candidate_id"]},
        )
    elif payload.action == "close_case":
        db.execute(text("UPDATE cases SET status = 'closed' WHERE id = :id"), {"id": str(id)})
    elif payload.action == "reopen_case":
        db.execute(text("UPDATE cases SET status = 'open' WHERE id = :id"), {"id": str(id)})
    db.commit()
    return {"ok": True}


@router.get("/jobs/{id}", response_model=JobOut)
def job(id: UUID, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, job_type, status, progress, result_ref, error FROM jobs WHERE id = :id"),
        {"id": str(id)},
    ).mappings().first()
    if not row:
        raise error(status.HTTP_404_NOT_FOUND, "not_found", "Job not found")
    return job_out(row)


def _candidate(row) -> dict:
    return {
        "id": row["id"],
        "case_id": row["case_id"],
        "vessel": {
            "id": row["vessel_id_out"],
            "mmsi": row["mmsi"],
            "name": row["name"],
            "flag": row["flag"],
            "vessel_type": row["vessel_type"],
        },
        "overall_score": row["overall_score"],
        "sub_scores": {
            "spatial": row["spatial_score"],
            "temporal": row["temporal_score"],
            "trajectory": row["trajectory_score"],
            "source_probability": row["source_probability_score"],
            "behavioural": row["behaviour_score"],
            "ais_continuity": row["ais_continuity_score"],
        },
        "rank": row["rank"],
        "supporting_evidence": row["supporting_evidence"],
        "contradicting_evidence": row["contradicting_evidence"],
        "model_version": row["model_version"],
        "excluded_by_analyst": row["excluded_by_analyst"],
        "llm_explanation": row.get("llm_explanation") if hasattr(row, "get") else row["llm_explanation"],
        "llm_explained_at": row.get("llm_explained_at") if hasattr(row, "get") else row["llm_explained_at"],
    }


def _json_value(value):
    return value if isinstance(value, (dict, list)) else json.loads(value or "{}")
