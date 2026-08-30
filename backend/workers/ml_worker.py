import json
import time
from datetime import datetime, timezone

from sqlalchemy import text

from core.db import SessionLocal
from workers.celery_app import celery_app


SYNTHETIC_EVENT_ID = "synthetic-sar-arabian-sea-20260824T142210Z"
SYNTHETIC_ACQUISITION_TIME = datetime(2026, 8, 24, 14, 22, 10, tzinfo=timezone.utc)
SYNTHETIC_SOURCE = "synthetic_sar_controlled"
SYNTHETIC_MODEL_VERSION = "oil-seg-v1.0-synthetic"
SYNTHETIC_CRS = "EPSG:4326"
SYNTHETIC_BBOX = [68.862484, 16.115681, 69.023383, 16.231109]
SYNTHETIC_V4_THRESHOLD = 0.64
SYNTHETIC_V3_THRESHOLD = 0.41
SYNTHETIC_CANDIDATE_COUNT = 3
SYNTHETIC_ACCEPTED_CANDIDATES = 1
SYNTHETIC_SOURCE_WIDTH = 2048
SYNTHETIC_SOURCE_HEIGHT = 1536

SLICK_POLYGON = {
    "type": "MultiPolygon",
    "coordinates": [[[[68.886968, 16.147162], [68.921946, 16.115681], [68.984907, 16.126175], [69.023383, 16.164651], [68.9954, 16.21362], [68.93244, 16.231109], [68.883471, 16.199629], [68.862484, 16.168148], [68.886968, 16.147162]]]],
}
SCENE_FOOTPRINT = {
    "type": "Polygon",
    "coordinates": [[[67.25, 15.05], [70.55, 15.05], [70.55, 17.35], [67.25, 17.35], [67.25, 15.05]]],
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
                {"case_id": str(job["case_id"]), "ts": SYNTHETIC_ACQUISITION_TIME, "footprint": _json(SCENE_FOOTPRINT)},
            ).mappings().one()
            scene_id = str(scene["id"])
        slick = db.execute(
            text(
                """
                INSERT INTO oil_slicks
                  (scene_id, geometry, area_km2, perimeter_km, centroid, orientation_deg,
                   confidence, possible_lookalike, lookalike_reason, model_version,
                   event_id, processing_timestamp, source, crs, bbox, v4_threshold, v3_threshold,
                   candidate_count, accepted_candidates, source_width, source_height)
                VALUES
                  (:scene_id,
                   ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326),
                   ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)::geography) / 1000000.0,
                   ST_Perimeter(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)::geography) / 1000.0,
                   ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)),
                   42.0, 0.82, false, null, :model_version,
                   :event_id, now(), :source, :crs, CAST(:bbox AS JSONB), :v4_threshold, :v3_threshold,
                   :candidate_count, :accepted_candidates, :source_width, :source_height)
                RETURNING id
                """
            ),
            {
                "scene_id": scene_id,
                "geometry": _json(SLICK_POLYGON),
                "model_version": SYNTHETIC_MODEL_VERSION,
                "event_id": SYNTHETIC_EVENT_ID,
                "source": SYNTHETIC_SOURCE,
                "crs": SYNTHETIC_CRS,
                "bbox": json.dumps(SYNTHETIC_BBOX),
                "v4_threshold": SYNTHETIC_V4_THRESHOLD,
                "v3_threshold": SYNTHETIC_V3_THRESHOLD,
                "candidate_count": SYNTHETIC_CANDIDATE_COUNT,
                "accepted_candidates": SYNTHETIC_ACCEPTED_CANDIDATES,
                "source_width": SYNTHETIC_SOURCE_WIDTH,
                "source_height": SYNTHETIC_SOURCE_HEIGHT,
            },
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
    return json.dumps(value)
