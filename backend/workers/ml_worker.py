import time
from datetime import datetime, timezone

from sqlalchemy import text

from core.db import SessionLocal
from workers.celery_app import celery_app


SLICK_POLYGON = {
    "type": "MultiPolygon",
    "coordinates": [[[[72.95, 18.85], [73.14, 18.85], [73.14, 18.98], [72.95, 18.98], [72.95, 18.85]]]],
}
SCENE_FOOTPRINT = {
    "type": "Polygon",
    "coordinates": [[[72.6, 18.5], [73.5, 18.5], [73.5, 19.3], [72.6, 19.3], [72.6, 18.5]]],
}


@celery_app.task(name="workers.ml_worker.run_segmentation")
def run_segmentation(job_id: str, scene_id: str | None = None):
    db = SessionLocal()
    try:
        db.execute(text("UPDATE jobs SET status='running', progress=0.2, updated_at=now() WHERE id=:id"), {"id": job_id})
        db.commit()
        time.sleep(3)
        job = db.execute(text("SELECT case_id FROM jobs WHERE id=:id"), {"id": job_id}).mappings().one()
        if not scene_id:
            scene = db.execute(
                text(
                    """
                    INSERT INTO satellite_scenes (case_id, sensor, acquisition_time, footprint, polarization, local_object_key)
                    VALUES (:case_id, 'S1A_IW_GRDH', :ts, ST_SetSRID(ST_GeomFromGeoJSON(:footprint), 4326),
                            ARRAY['VV','VH'], 'raw/sentinel1/demo-scene')
                    RETURNING id
                    """
                ),
                {"case_id": str(job["case_id"]), "ts": datetime.now(timezone.utc), "footprint": _json(SCENE_FOOTPRINT)},
            ).mappings().one()
            scene_id = str(scene["id"])
        slick = db.execute(
            text(
                """
                INSERT INTO oil_slicks
                  (scene_id, geometry, area_km2, perimeter_km, centroid, orientation_deg,
                   confidence, possible_lookalike, lookalike_reason, model_version)
                VALUES
                  (:scene_id, ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326), 142.4, 52.1,
                   ST_SetSRID(ST_Point(73.045, 18.915), 4326), 42.0, 0.82, false, null, 'oil-seg-v1.0-demo')
                RETURNING id
                """
            ),
            {"scene_id": scene_id, "geometry": _json(SLICK_POLYGON)},
        ).mappings().one()
        db.execute(
            text("UPDATE jobs SET status='succeeded', progress=1, result_ref=:result_ref, updated_at=now() WHERE id=:id"),
            {"id": job_id, "result_ref": str(slick["id"])},
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        db.execute(text("UPDATE jobs SET status='failed', error=:error, updated_at=now() WHERE id=:id"), {"id": job_id, "error": str(exc)})
        db.commit()
    finally:
        db.close()


def _json(value: dict) -> str:
    import json

    return json.dumps(value)
