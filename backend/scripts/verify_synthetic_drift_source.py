from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlalchemy import text

from core.db import SessionLocal
from main import create_app
from modules.cases import router as cases_router
from workers.celery_app import celery_app
from workers.drift_worker import run_backward_drift


INTEGRATION_USER_ID = "00000000-0000-0000-0000-000000000001"
SYNTHETIC_EVENT_ID = "synthetic-sar-arabian-sea-20260824T142210Z"


def main() -> None:
    ensure_integration_user()
    case_id, slick_id = latest_synthetic_slick()

    app = create_app()
    app.dependency_overrides[cases_router.current_user] = lambda: {
        "id": INTEGRATION_USER_ID,
        "username": "integration",
        "role": "analyst",
    }
    celery_app.send_task = lambda *args, **kwargs: None

    client = TestClient(app)
    drift_response = client.post(
        f"/cases/{case_id}/drift",
        json={"slick_id": slick_id, "backward_hours": 48, "forward_hours": 72, "ensemble_size": 20},
    )
    drift_response.raise_for_status()
    queued_job = drift_response.json()

    run_backward_drift(queued_job["id"], slick_id, "48", "72", "20")

    job_response = client.get(f"/jobs/{queued_job['id']}")
    job_response.raise_for_status()
    job = job_response.json()
    if job["status"] != "succeeded":
        raise SystemExit(json.dumps({"job": job}, indent=2))

    source_response = client.get(f"/cases/{case_id}/source-hypothesis")
    source_response.raise_for_status()
    source = source_response.json()

    forecast_response = client.get(f"/cases/{case_id}/forecast")
    forecast_response.raise_for_status()
    forecast = forecast_response.json()

    db = SessionLocal()
    try:
        checks = db.execute(
            text(
                """
                SELECT dr.id AS drift_run_id,
                       sh.id AS source_hypothesis_id,
                       count(ff.id) AS forecast_rows,
                       ST_IsValid(sh.probable_source_region) AS valid_source_region,
                       ST_SRID(sh.probable_source_region) AS source_region_srid,
                       ST_Intersects(c.aoi, sh.probable_source_region) AS source_intersects_aoi,
                       sh.time_window_start >= c.time_window_start AS starts_within_case,
                       sh.time_window_end <= ss.acquisition_time AS ends_before_detection,
                       sh.time_window_end > sh.time_window_start AS positive_window,
                       ST_Distance(
                         sh.probable_source_region::geography,
                         os.geometry::geography
                       ) / 1000.0 AS source_to_slick_distance_km,
                       sh.drift_corridor_bearing_deg
                FROM source_hypotheses sh
                JOIN drift_runs dr ON dr.id = sh.drift_run_id
                JOIN oil_slicks os ON os.id = dr.slick_id
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                JOIN cases c ON c.id = ss.case_id
                LEFT JOIN forward_forecasts ff ON ff.drift_run_id = dr.id
                WHERE dr.id = :drift_run_id
                GROUP BY dr.id, sh.id, sh.probable_source_region, c.aoi, c.time_window_start,
                         ss.acquisition_time, sh.time_window_start, sh.time_window_end,
                         os.geometry, sh.drift_corridor_bearing_deg
                """
            ),
            {"drift_run_id": job["result_ref"]},
        ).mappings().one()
        db_checks = dict(checks)
    finally:
        db.close()

    handoff_fields = [
        "probable_source_region",
        "time_window_start",
        "time_window_end",
        "confidence",
        "drift_corridor_bearing_deg",
    ]
    missing = [field for field in handoff_fields if source.get(field) in (None, "")]

    print(
        json.dumps(
            {
                "case_id": case_id,
                "slick_id": slick_id,
                "job": job,
                "source_hypothesis": {field: source[field] for field in handoff_fields},
                "source_hypothesis_id": source["id"],
                "forecast": {
                    "drift_run_id": forecast["drift_run_id"],
                    "contours": [
                        {"horizon_hours": item["horizon_hours"], "percentile": item["percentile"]}
                        for item in forecast["contours"]
                    ],
                },
                "contract_missing_fields": missing,
                "db_checks": db_checks,
            },
            default=str,
            indent=2,
        )
    )

    if missing:
        raise SystemExit(f"Missing source handoff fields: {missing}")
    if job["status"] != "succeeded":
        raise SystemExit("Drift job did not succeed")
    if job["result_ref"] != source["drift_run_id"]:
        raise SystemExit("Job result_ref does not point to the persisted drift run")
    if not db_checks["valid_source_region"] or db_checks["source_region_srid"] != 4326:
        raise SystemExit("Source region is not valid EPSG:4326 PostGIS geometry")
    if not db_checks["source_intersects_aoi"]:
        raise SystemExit("Source region is outside the case AOI")
    if not db_checks["starts_within_case"] or not db_checks["ends_before_detection"] or not db_checks["positive_window"]:
        raise SystemExit("Source time window is not consistent with case/detection timing")
    if not (0 <= source["drift_corridor_bearing_deg"] < 360):
        raise SystemExit("Drift corridor bearing is outside 0-360 degrees")
    if db_checks["forecast_rows"] != 3:
        raise SystemExit("Expected three persisted forecast contours")


def latest_synthetic_slick() -> tuple[str, str]:
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                SELECT ss.case_id, os.id AS slick_id
                FROM oil_slicks os
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                WHERE os.event_id = :event_id
                ORDER BY os.created_at DESC
                LIMIT 1
                """
            ),
            {"event_id": SYNTHETIC_EVENT_ID},
        ).mappings().first()
        if not row:
            raise RuntimeError("No Stage 2 synthetic SAR slick found; run verify_synthetic_sar_detection.py first")
        return str(row["case_id"]), str(row["slick_id"])
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
