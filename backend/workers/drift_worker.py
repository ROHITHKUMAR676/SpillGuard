import json
import time
from datetime import timedelta

from sqlalchemy import text

from core.db import SessionLocal
from workers.celery_app import celery_app


SOURCE_REGION = {
    "type": "Polygon",
    "coordinates": [[[72.72, 18.68], [72.92, 18.68], [72.92, 18.88], [72.72, 18.88], [72.72, 18.68]]],
}
FORECAST_50 = {
    "type": "Polygon",
    "coordinates": [[[73.02, 18.88], [73.18, 18.88], [73.18, 19.04], [73.02, 19.04], [73.02, 18.88]]],
}
FORECAST_80 = {
    "type": "Polygon",
    "coordinates": [[[72.94, 18.80], [73.28, 18.80], [73.28, 19.12], [72.94, 19.12], [72.94, 18.80]]],
}
FORECAST_95 = {
    "type": "Polygon",
    "coordinates": [[[72.86, 18.72], [73.38, 18.72], [73.38, 19.22], [72.86, 19.22], [72.86, 18.72]]],
}


@celery_app.task(name="workers.drift_worker.run_backward_drift")
def run_backward_drift(job_id: str, slick_id: str, backward_hours: str = "48", forward_hours: str = "72", ensemble_size: str = "20"):
    db = SessionLocal()
    try:
        db.execute(text("UPDATE jobs SET status='running', progress=0.2, updated_at=now() WHERE id=:id"), {"id": job_id})
        db.commit()
        time.sleep(3)
        run = db.execute(
            text(
                """
                INSERT INTO drift_runs (slick_id, direction, ensemble_size, completed_at, result_object_key)
                VALUES (:slick_id, 'backward', :ensemble_size, now(), :object_key)
                RETURNING id, started_at
                """
            ),
            {"slick_id": slick_id, "ensemble_size": int(ensemble_size), "object_key": f"processed/drift/{job_id}/backward.parquet"},
        ).mappings().one()
        db.execute(
            text(
                """
                INSERT INTO source_hypotheses
                  (drift_run_id, probability_surface_object_key, probable_source_region,
                   time_window_start, time_window_end, confidence)
                VALUES
                  (:run_id, :surface, ST_SetSRID(ST_GeomFromGeoJSON(:region), 4326),
                   :start_time, :end_time, 'medium')
                """
            ),
            {
                "run_id": str(run["id"]),
                "surface": f"processed/source_hypothesis/{job_id}.tif",
                "region": json.dumps(SOURCE_REGION),
                "start_time": run["started_at"] - timedelta(hours=int(backward_hours)),
                "end_time": run["started_at"],
            },
        )
        for percentile, polygon in [(50, FORECAST_50), (80, FORECAST_80), (95, FORECAST_95)]:
            db.execute(
                text(
                    """
                    INSERT INTO forward_forecasts (drift_run_id, horizon_hours, percentile, envelope)
                    VALUES (:run_id, :horizon, :percentile, ST_SetSRID(ST_GeomFromGeoJSON(:polygon), 4326))
                    """
                ),
                {"run_id": str(run["id"]), "horizon": int(forward_hours), "percentile": percentile, "polygon": json.dumps(polygon)},
            )
        db.execute(
            text("UPDATE jobs SET status='succeeded', progress=1, result_ref=:result_ref, updated_at=now() WHERE id=:id"),
            {"id": job_id, "result_ref": str(run["id"])},
        )
        db.commit()
    except Exception as exc:
        _fail(db, job_id, exc)
    finally:
        db.close()


@celery_app.task(name="workers.drift_worker.run_forward_drift")
def run_forward_drift(job_id: str, slick_id: str, ensemble_size: str = "20"):
    return run_backward_drift(job_id, slick_id, "0", "72", ensemble_size)


@celery_app.task(name="workers.drift_worker.run_vessel_analysis")
def run_vessel_analysis(job_id: str, case_id: str):
    db = SessionLocal()
    try:
        db.execute(text("UPDATE jobs SET status='running', progress=0.2, updated_at=now() WHERE id=:id"), {"id": job_id})
        db.commit()
        time.sleep(3)
        vessels = [
            ("419000111", "Synthetic Lead One", 73.0, 18.9, 78.0, 1),
            ("419000222", "Synthetic Comparison Two", 72.8, 18.75, 61.0, 2),
        ]
        first_candidate = None
        for mmsi, name, lon, lat, score, rank in vessels:
            vessel = db.execute(
                text(
                    """
                    INSERT INTO vessels (mmsi, name, flag, vessel_type, source_registry)
                    VALUES (:mmsi, :name, 'IN', 'tanker', 'synthetic')
                    ON CONFLICT (mmsi) WHERE mmsi IS NOT NULL DO UPDATE SET name = EXCLUDED.name
                    RETURNING id
                    """
                ),
                {"mmsi": mmsi, "name": name},
            ).mappings().one()
            db.execute(
                text(
                    """
                    INSERT INTO vessel_positions
                      (vessel_id, ts, position, sog_knots, cog_deg, heading_deg, nav_status, source)
                    VALUES (:vessel_id, now(), ST_SetSRID(ST_Point(:lon, :lat), 4326), 8.2, 34.0, 36.0, 'under_way', 'synthetic')
                    """
                ),
                {"vessel_id": str(vessel["id"]), "lon": lon, "lat": lat},
            )
            candidate = db.execute(
                text(
                    """
                    INSERT INTO attribution_candidates
                      (case_id, vessel_id, overall_score, spatial_score, temporal_score, trajectory_score,
                       source_probability_score, behaviour_score, ais_continuity_score,
                       supporting_evidence, contradicting_evidence, rank)
                    VALUES
                      (:case_id, :vessel_id, :overall_score, :spatial, :temporal, :trajectory,
                       :source_probability, :behaviour, :ais_continuity,
                       ARRAY['Synthetic AIS track overlaps the source-region window',
                             'Course history is consistent with transport-model timing'],
                       ARRAY['AIS in this build is synthetic and for demonstration only'],
                       :rank)
                    RETURNING id
                    """
                ),
                {
                    "case_id": case_id,
                    "vessel_id": str(vessel["id"]),
                    "overall_score": score,
                    "spatial": score - 8,
                    "temporal": score - 6,
                    "trajectory": score - 10,
                    "source_probability": score - 7,
                    "behaviour": max(score - 20, 0),
                    "ais_continuity": 92.0,
                    "rank": rank,
                },
            ).mappings().one()
            first_candidate = first_candidate or str(candidate["id"])
        db.execute(
            text("UPDATE jobs SET status='succeeded', progress=1, result_ref=:result_ref, updated_at=now() WHERE id=:id"),
            {"id": job_id, "result_ref": first_candidate},
        )
        db.commit()
    except Exception as exc:
        _fail(db, job_id, exc)
    finally:
        db.close()


def _fail(db, job_id: str, exc: Exception) -> None:
    db.rollback()
    db.execute(text("UPDATE jobs SET status='failed', error=:error, updated_at=now() WHERE id=:id"), {"id": job_id, "error": str(exc)})
    db.commit()
