from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import text

from core.db import SessionLocal
from main import create_app
from modules.cases import router as cases_router
from workers.celery_app import celery_app
from workers.drift_worker import run_backward_drift, run_vessel_analysis
from workers.ml_worker import run_segmentation


INTEGRATION_USER_ID = "00000000-0000-0000-0000-000000000001"


def main() -> None:
    ensure_integration_user()

    app = create_app()
    app.dependency_overrides[cases_router.current_user] = lambda: {
        "id": INTEGRATION_USER_ID,
        "username": "integration",
        "role": "analyst",
    }
    celery_app.send_task = lambda *args, **kwargs: None
    client = TestClient(app)

    case = client.post(
        "/cases",
        json={
            "title": f"Final synthetic E2E {datetime.now(timezone.utc).isoformat()}",
            "aoi": {
                "type": "Polygon",
                "coordinates": [[[67.4, 15.2], [70.3, 15.2], [70.3, 17.2], [67.4, 17.2], [67.4, 15.2]]],
            },
            "time_window_start": "2026-08-24T00:00:00Z",
            "time_window_end": "2026-08-25T00:00:00Z",
        },
    ).json()

    detect_job = client.post(f"/cases/{case['id']}/detect", json={}).json()
    run_segmentation(detect_job["id"], "")
    detect_job = client.get(f"/jobs/{detect_job['id']}").json()
    require_succeeded("detect", detect_job)

    slick = client.get(f"/slicks/{detect_job['result_ref']}").json()

    drift_job = client.post(
        f"/cases/{case['id']}/drift",
        json={"slick_id": slick["id"], "backward_hours": 48, "forward_hours": 72, "ensemble_size": 20},
    ).json()
    run_backward_drift(drift_job["id"], slick["id"], "48", "72", "20")
    drift_job = client.get(f"/jobs/{drift_job['id']}").json()
    require_succeeded("drift", drift_job)
    source = client.get(f"/cases/{case['id']}/source-hypothesis").json()

    vessel_job = client.post(f"/cases/{case['id']}/vessel-analysis").json()
    run_vessel_analysis(vessel_job["id"], case["id"])
    vessel_job = client.get(f"/jobs/{vessel_job['id']}").json()
    require_succeeded("vessel_analysis", vessel_job)

    candidates = client.get(f"/cases/{case['id']}/candidates").json()
    top = candidates[0]
    evidence = client.get(f"/cases/{case['id']}/candidates/{top['vessel']['id']}/evidence").json()
    explanation = client.post(f"/cases/{case['id']}/candidates/{top['vessel']['id']}/explanation").json()
    qa = client.post(
        f"/cases/{case['id']}/investigator/ask",
        json={"question": "Why did vessel SG-STRONG-SPATIAL rank higher than SG-GAPPY-CANDIDATE?"},
    ).json()

    db_summary = database_summary(case["id"])
    output = {
        "case_id": case["id"],
        "slick_id": slick["id"],
        "source_hypothesis": {
            "time_window_start": source["time_window_start"],
            "time_window_end": source["time_window_end"],
            "confidence": source["confidence"],
            "drift_corridor_bearing_deg": source["drift_corridor_bearing_deg"],
        },
        "jobs": {"detect": detect_job, "drift": drift_job, "vessel_analysis": vessel_job},
        "ranking": [
            {
                "rank": candidate["rank"],
                "mmsi": candidate["vessel"]["mmsi"],
                "name": candidate["vessel"]["name"],
                "overall_score": candidate["overall_score"],
                "sub_scores": candidate["sub_scores"],
            }
            for candidate in candidates
        ],
        "top_evidence": {
            "raw_features": evidence["raw_features"],
            "score_breakdown": evidence["score_breakdown"],
            "supporting_evidence": evidence["supporting_evidence"],
            "contradicting_evidence": evidence["contradicting_evidence"],
            "vessel_events": evidence["vessel_events"],
        },
        "explanation": explanation["explanation"],
        "investigator_answer": qa["answer"],
        "db_summary": db_summary,
        "frontend_contract": {
            "candidate_api_is_authoritative": True,
            "frontend_score_source": "GET /cases/{id}/candidates overall_score and sub_scores",
        },
    }
    print(json.dumps(output, default=str, indent=2))

    if [item["mmsi"] for item in output["ranking"]] != ["419910001", "419910004", "419910002", "419910003"]:
        raise SystemExit("Unexpected deterministic ranking")
    if top["overall_score"] != evidence["overall_score"] or top["rank"] != evidence["rank"]:
        raise SystemExit("Candidate list and evidence endpoint disagree on stored score/rank")
    if "deterministic score" not in explanation["explanation"] and "stored" not in explanation["explanation"].lower():
        raise SystemExit("Explanation did not describe stored deterministic result")
    if db_summary["candidate_rows"] != 4 or db_summary["position_rows"] != 23:
        raise SystemExit("Unexpected persisted attribution rows")


def require_succeeded(name: str, job: dict) -> None:
    if job["status"] != "succeeded":
        raise SystemExit(f"{name} job failed: {json.dumps(job, indent=2)}")


def database_summary(case_id: str) -> dict:
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                SELECT
                  (SELECT count(*) FROM oil_slicks os JOIN satellite_scenes ss ON ss.id = os.scene_id WHERE ss.case_id = :case_id) AS slick_rows,
                  (SELECT count(*) FROM source_hypotheses sh JOIN drift_runs dr ON dr.id = sh.drift_run_id JOIN oil_slicks os ON os.id = dr.slick_id JOIN satellite_scenes ss ON ss.id = os.scene_id WHERE ss.case_id = :case_id) AS source_rows,
                  (SELECT count(*) FROM attribution_candidates WHERE case_id = :case_id) AS candidate_rows,
                  (SELECT count(*) FROM vessels WHERE mmsi LIKE '419910%') AS vessel_rows,
                  (SELECT count(*) FROM vessel_positions vp JOIN vessels v ON v.id = vp.vessel_id WHERE v.mmsi LIKE '419910%' AND vp.source = 'synthetic') AS position_rows,
                  (SELECT count(*) FROM vessel_events ve JOIN vessels v ON v.id = ve.vessel_id WHERE v.mmsi LIKE '419910%') AS event_rows
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
