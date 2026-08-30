from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlalchemy import text

from core.db import SessionLocal
from main import create_app
from modules.cases import router as cases_router
from workers.celery_app import celery_app
from workers.drift_worker import run_vessel_analysis


INTEGRATION_USER_ID = "00000000-0000-0000-0000-000000000001"
SYNTHETIC_EVENT_ID = "synthetic-sar-arabian-sea-20260824T142210Z"


def main() -> None:
    ensure_integration_user()
    case_id = latest_track_c_case()

    app = create_app()
    app.dependency_overrides[cases_router.current_user] = lambda: {
        "id": INTEGRATION_USER_ID,
        "username": "integration",
        "role": "analyst",
    }
    celery_app.send_task = lambda *args, **kwargs: None

    client = TestClient(app)
    analysis_response = client.post(f"/cases/{case_id}/vessel-analysis")
    analysis_response.raise_for_status()
    queued_job = analysis_response.json()

    run_vessel_analysis(queued_job["id"], case_id)

    job_response = client.get(f"/jobs/{queued_job['id']}")
    job_response.raise_for_status()
    job = job_response.json()
    if job["status"] != "succeeded":
        raise SystemExit(json.dumps({"job": job}, indent=2))

    candidates_response = client.get(f"/cases/{case_id}/candidates")
    candidates_response.raise_for_status()
    candidates = candidates_response.json()
    if len(candidates) < 3:
        raise SystemExit(f"Expected at least three attribution candidates, got {len(candidates)}")

    evidence_payloads = []
    for candidate in candidates:
        evidence_response = client.get(f"/cases/{case_id}/candidates/{candidate['vessel']['id']}/evidence")
        evidence_response.raise_for_status()
        evidence_payloads.append(evidence_response.json())

    db_summary = database_summary(case_id)
    ranking = [
        {
            "rank": candidate["rank"],
            "mmsi": candidate["vessel"]["mmsi"],
            "name": candidate["vessel"]["name"],
            "overall_score": round(candidate["overall_score"], 3),
            "sub_scores": candidate["sub_scores"],
        }
        for candidate in candidates
    ]
    evidence_summary = [
        {
            "rank": payload["rank"],
            "mmsi": payload["vessel"]["mmsi"],
            "raw_features": payload["raw_features"],
            "score_breakdown": payload["score_breakdown"],
            "vessel_events": [
                {"event_type": event["event_type"], "start_time": event["start_time"], "end_time": event["end_time"]}
                for event in payload["vessel_events"]
            ],
            "supporting_evidence": payload["supporting_evidence"],
            "contradicting_evidence": payload["contradicting_evidence"],
        }
        for payload in evidence_payloads
    ]

    print(
        json.dumps(
            {
                "case_id": case_id,
                "job": job,
                "ranking": ranking,
                "evidence": evidence_summary,
                "db_summary": db_summary,
            },
            default=str,
            indent=2,
        )
    )

    required_scores = {"spatial", "temporal", "trajectory", "source_probability", "behavioural", "ais_continuity"}
    for candidate in candidates:
        if set(candidate["sub_scores"]) != required_scores:
            raise SystemExit(f"Unexpected sub-score contract for {candidate['vessel']['mmsi']}")
    for payload in evidence_payloads:
        raw = payload["raw_features"]
        if raw.get("source_probability_note") != "neutral_placeholder_no_probability_surface_reader":
            raise SystemExit("Source probability placeholder was not labelled")
        if payload["score_breakdown"]["trajectory"]["score"] != payload["sub_scores"]["trajectory"]:
            raise SystemExit("Trajectory score breakdown does not match candidate sub-score")
    if ranking[0]["mmsi"] != "419910001":
        raise SystemExit(f"Expected SG-STRONG-SPATIAL to rank first, got {ranking[0]['mmsi']}")
    if db_summary["candidate_rows"] != len(candidates):
        raise SystemExit("Candidate API count does not match persisted candidate rows")
    if db_summary["position_rows"] != 23:
        raise SystemExit("Expected 23 persisted synthetic AIS observations")
    if db_summary["event_rows"] < 3:
        raise SystemExit("Expected persisted vessel events for source entries/loitering/AIS gaps")


def latest_track_c_case() -> str:
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                SELECT ss.case_id
                FROM source_hypotheses sh
                JOIN drift_runs dr ON dr.id = sh.drift_run_id
                JOIN oil_slicks os ON os.id = dr.slick_id
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                WHERE os.event_id = :event_id
                  AND sh.drift_corridor_bearing_deg IS NOT NULL
                ORDER BY sh.created_at DESC
                LIMIT 1
                """
            ),
            {"event_id": SYNTHETIC_EVENT_ID},
        ).mappings().first()
        if not row:
            raise RuntimeError("No Track C source hypothesis found; run verify_synthetic_drift_source.py first")
        return str(row["case_id"])
    finally:
        db.close()


def database_summary(case_id: str) -> dict:
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                SELECT count(DISTINCT ac.id) AS candidate_rows,
                       count(DISTINCT vp.id) FILTER (WHERE vp.source = 'synthetic') AS position_rows,
                       count(DISTINCT ve.id) AS event_rows,
                       count(DISTINCT v.id) AS vessel_rows
                FROM vessels v
                LEFT JOIN vessel_positions vp ON vp.vessel_id = v.id
                LEFT JOIN vessel_events ve ON ve.vessel_id = v.id
                LEFT JOIN attribution_candidates ac ON ac.vessel_id = v.id AND ac.case_id = :case_id
                WHERE v.mmsi LIKE '419910%'
                """
            ),
            {"case_id": case_id},
        ).mappings().one()
        return dict(row)
    finally:
        db.close()


def ensure_integration_user() -> None:
    db = SessionLocal()
    try:
        db.execute(
            text(
                """
                INSERT INTO users (id, username, password_hash, role)
                VALUES (:id, 'integration_verifier', 'not-used-by-verifier', 'analyst')
                ON CONFLICT (username) DO NOTHING
                """
            ),
            {"id": INTEGRATION_USER_ID},
        )
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
