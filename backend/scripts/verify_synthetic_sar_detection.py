from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import text

from core.db import SessionLocal
from main import create_app
from modules.cases import router as cases_router
from workers.celery_app import celery_app
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
    case_payload = {
        "title": f"Synthetic SAR detection verification {datetime.now(timezone.utc).isoformat()}",
        "aoi": {
            "type": "Polygon",
            "coordinates": [[[67.4, 15.2], [70.3, 15.2], [70.3, 17.2], [67.4, 17.2], [67.4, 15.2]]],
        },
        "time_window_start": "2026-08-24T00:00:00Z",
        "time_window_end": "2026-08-25T00:00:00Z",
    }

    case_response = client.post("/cases", json=case_payload)
    case_response.raise_for_status()
    case = case_response.json()

    detect_response = client.post(f"/cases/{case['id']}/detect", json={})
    detect_response.raise_for_status()
    queued_job = detect_response.json()

    run_segmentation(queued_job["id"], "")

    job_response = client.get(f"/jobs/{queued_job['id']}")
    job_response.raise_for_status()
    job = job_response.json()

    slick_response = client.get(f"/slicks/{job['result_ref']}")
    slick_response.raise_for_status()
    slick = slick_response.json()

    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                SELECT ss.id AS scene_id, os.id AS slick_id,
                       ST_IsValid(os.geometry) AS valid_geometry,
                       ST_SRID(os.geometry) AS geometry_srid,
                       ST_IsValid(os.centroid) AS valid_centroid,
                       ST_SRID(os.centroid) AS centroid_srid,
                       ST_Contains(ss.footprint, os.geometry) AS slick_inside_scene,
                       ST_Intersects(c.aoi, os.geometry) AS slick_intersects_aoi,
                       ST_X(os.centroid) AS centroid_lon,
                       ST_Y(os.centroid) AS centroid_lat,
                       ARRAY[
                         ST_XMin(Box2D(os.geometry)),
                         ST_YMin(Box2D(os.geometry)),
                         ST_XMax(Box2D(os.geometry)),
                         ST_YMax(Box2D(os.geometry))
                       ] AS computed_bbox,
                       os.area_km2 AS stored_area_km2
                FROM oil_slicks os
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                JOIN cases c ON c.id = ss.case_id
                WHERE os.id = :slick_id
                """
            ),
            {"slick_id": job["result_ref"]},
        ).mappings().one()
        db_checks = dict(row)
    finally:
        db.close()

    contract_fields = [
        "event_id",
        "scene_id",
        "acquisition_timestamp",
        "processing_timestamp",
        "source",
        "geometry",
        "crs",
        "bbox",
        "centroid",
        "area_km2",
        "confidence",
        "model_version",
        "v4_threshold",
        "v3_threshold",
        "candidate_count",
        "accepted_candidates",
        "source_width",
        "source_height",
    ]
    missing = [field for field in contract_fields if slick.get(field) in (None, "")]

    print(
        json.dumps(
            {
                "case_id": case["id"],
                "job": job,
                "slick_id": slick["id"],
                "contract_missing_fields": missing,
                "detection_output": {field: slick[field] for field in contract_fields},
                "db_checks": db_checks,
                "frontend_endpoint": f"/slicks/{slick['id']}",
            },
            default=str,
            indent=2,
        )
    )

    if missing:
        raise SystemExit(f"Missing contract fields: {missing}")
    if job["status"] != "succeeded" or job["result_ref"] != slick["id"]:
        raise SystemExit("Job did not return the persisted slick id")
    if not db_checks["valid_geometry"] or db_checks["geometry_srid"] != 4326:
        raise SystemExit("Slick geometry is not valid EPSG:4326 PostGIS geometry")
    if not db_checks["valid_centroid"] or db_checks["centroid_srid"] != 4326:
        raise SystemExit("Slick centroid is not valid EPSG:4326 PostGIS geometry")
    if not db_checks["slick_inside_scene"] or not db_checks["slick_intersects_aoi"]:
        raise SystemExit("Synthetic slick is not consistent with scene footprint/AOI")


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
