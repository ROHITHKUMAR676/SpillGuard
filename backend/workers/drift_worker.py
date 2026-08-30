import json
import time

from sqlalchemy import text
from shapely.geometry import mapping, shape

from core.db import SessionLocal
from modules.ais.synthetic import AISObservation, generate_controlled_attribution_tracks, validate_observations
from modules.attribution.features import detect_region_events, extract_features
from modules.attribution.filter import SourceHypothesis, filter_candidate_tracks
from modules.attribution.scorer import MODEL_VERSION, generate_evidence, rank_scores, score_candidates
from modules.drift.engine import EulerDriftEngine, SlickInput
from workers.celery_app import celery_app


@celery_app.task(name="workers.drift_worker.run_backward_drift")
def run_backward_drift(job_id: str, slick_id: str, backward_hours: str = "48", forward_hours: str = "72", ensemble_size: str = "20"):
    db = SessionLocal()
    try:
        db.execute(text("UPDATE jobs SET status='running', progress=0.2, updated_at=now() WHERE id=:id"), {"id": job_id})
        db.commit()
        time.sleep(3)

        slick_row = db.execute(
            text(
                """
                SELECT os.id, ST_AsGeoJSON(os.geometry)::json AS geometry,
                       ST_AsGeoJSON(os.centroid)::json AS centroid,
                       ss.acquisition_time, c.time_window_start, c.time_window_end,
                       ST_AsGeoJSON(c.aoi)::json AS case_aoi
                FROM oil_slicks os
                JOIN satellite_scenes ss ON ss.id = os.scene_id
                JOIN cases c ON c.id = ss.case_id
                WHERE os.id = :slick_id
                """
            ),
            {"slick_id": slick_id},
        ).mappings().first()
        if not slick_row:
            raise RuntimeError(f"Oil slick not found: {slick_id}")

        drift_result = EulerDriftEngine().run(
            SlickInput(
                geometry=shape(_json_value(slick_row["geometry"])),
                centroid=shape(_json_value(slick_row["centroid"])),
                acquisition_timestamp=slick_row["acquisition_time"],
                case_time_window_start=slick_row["time_window_start"],
                case_time_window_end=slick_row["time_window_end"],
            ),
            backward_hours=int(backward_hours),
            forward_hours=int(forward_hours),
        )
        forcing_key = f"processed/environment/synthetic/{job_id}.json"
        environment = db.execute(
            text(
                """
                INSERT INTO environmental_fields (source, variable, valid_time, bbox, object_key)
                VALUES ('copernicus_marine', 'synthetic_euler_surface_current',
                        :valid_time, ST_SetSRID(ST_GeomFromGeoJSON(:bbox), 4326), :object_key)
                RETURNING id
                """
            ),
            {
                "valid_time": slick_row["acquisition_time"],
                "bbox": json.dumps(_json_value(slick_row["case_aoi"])),
                "object_key": forcing_key,
            },
        ).mappings().one()
        run = db.execute(
            text(
                """
                INSERT INTO drift_runs (slick_id, direction, engine, ensemble_size, environment_field_ids, completed_at, result_object_key)
                VALUES (:slick_id, 'backward', 'lightweight_particle', :ensemble_size, ARRAY[CAST(:environment_id AS UUID)], now(), :object_key)
                RETURNING id, started_at
                """
            ),
            {
                "slick_id": slick_id,
                "ensemble_size": int(ensemble_size),
                "environment_id": str(environment["id"]),
                "object_key": f"processed/drift/{job_id}/backward_euler.json",
            },
        ).mappings().one()
        db.execute(
            text(
                """
                INSERT INTO source_hypotheses
                  (drift_run_id, probability_surface_object_key, probable_source_region,
                   time_window_start, time_window_end, confidence, drift_corridor_bearing_deg)
                VALUES
                  (:run_id, :surface, ST_SetSRID(ST_GeomFromGeoJSON(:region), 4326),
                   :start_time, :end_time, :confidence, :bearing)
                """
            ),
            {
                "run_id": str(run["id"]),
                "surface": f"processed/source_hypothesis/{job_id}.tif",
                "region": json.dumps(mapping(drift_result.source_hypothesis.probable_source_region)),
                "start_time": drift_result.source_hypothesis.time_window_start,
                "end_time": drift_result.source_hypothesis.time_window_end,
                "confidence": drift_result.source_hypothesis.confidence,
                "bearing": drift_result.source_hypothesis.drift_corridor_bearing_deg,
            },
        )
        for percentile, polygon in drift_result.forecast_envelopes.items():
            db.execute(
                text(
                    """
                    INSERT INTO forward_forecasts (drift_run_id, horizon_hours, percentile, envelope)
                    VALUES (:run_id, :horizon, :percentile, ST_SetSRID(ST_GeomFromGeoJSON(:polygon), 4326))
                    """
                ),
                {"run_id": str(run["id"]), "horizon": int(forward_hours), "percentile": percentile, "polygon": json.dumps(mapping(polygon))},
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

        source = _load_source_hypothesis(db, case_id)
        observations = generate_controlled_attribution_tracks(
            source.probable_source_region,
            source.time_window_start,
            source.time_window_end,
            source.drift_corridor_bearing_deg or 0.0,
        )
        validate_observations(observations)
        tracks: dict[str, list[AISObservation]] = {}
        for observation in observations:
            tracks.setdefault(observation.mmsi, []).append(observation)
        candidate_tracks = filter_candidate_tracks(tracks, source)
        if not candidate_tracks:
            raise RuntimeError("No AIS candidate tracks intersect the source-region/time-window gate")

        features_by_mmsi = {mmsi: extract_features(track, source) for mmsi, track in candidate_tracks.items()}
        source_window_hours = (source.time_window_end - source.time_window_start).total_seconds() / 3600.0
        scores = score_candidates(features_by_mmsi, source_window_hours)

        db.execute(text("DELETE FROM attribution_candidates WHERE case_id = :case_id"), {"case_id": case_id})
        vessel_ids: dict[str, str] = {}
        for mmsi, track in tracks.items():
            vessel_ids[mmsi] = _persist_vessel_track(db, mmsi, track)

        first_candidate = None
        db.execute(text("UPDATE jobs SET progress=0.65, updated_at=now() WHERE id=:id"), {"id": job_id})
        for mmsi, score, rank in rank_scores(scores):
            track = candidate_tracks[mmsi]
            vessel_id = vessel_ids[mmsi]
            features = features_by_mmsi[mmsi]
            name = track[0].vessel_name or mmsi
            supporting, contradicting = generate_evidence(name, features)
            raw_features = features.to_json()
            score_breakdown = {
                key: {"score": value, "model_version": MODEL_VERSION}
                for key, value in score.sub_scores.items()
            }
            for event in _events_for_track(track, source, features):
                db.execute(
                    text(
                        """
                        INSERT INTO vessel_events (vessel_id, event_type, start_time, end_time, geometry, confidence)
                        VALUES (:vessel_id, :event_type, :start_time, :end_time,
                                CASE WHEN :lon IS NULL THEN NULL ELSE ST_SetSRID(ST_Point(:lon, :lat), 4326) END,
                                :confidence)
                        """
                    ),
                    {
                        "vessel_id": vessel_id,
                        "event_type": event["event_type"],
                        "start_time": event["start_time"],
                        "end_time": event.get("end_time"),
                        "lon": event.get("longitude"),
                        "lat": event.get("latitude"),
                        "confidence": event.get("confidence", 0.75),
                    },
                )
            candidate = db.execute(
                text(
                    """
                    INSERT INTO attribution_candidates
                      (case_id, vessel_id, overall_score, spatial_score, temporal_score, trajectory_score,
                       source_probability_score, behaviour_score, ais_continuity_score,
                       supporting_evidence, contradicting_evidence, raw_features, score_breakdown,
                       model_version, rank)
                    VALUES
                      (:case_id, :vessel_id, :overall_score, :spatial, :temporal, :trajectory,
                       :source_probability, :behaviour, :ais_continuity,
                       :supporting, :contradicting, CAST(:raw_features AS JSONB), CAST(:score_breakdown AS JSONB),
                       :model_version, :rank)
                    RETURNING id
                    """
                ),
                {
                    "case_id": case_id,
                    "vessel_id": vessel_id,
                    "overall_score": score.overall_score,
                    "spatial": score.sub_scores["spatial"],
                    "temporal": score.sub_scores["temporal"],
                    "trajectory": score.sub_scores["trajectory"],
                    "source_probability": score.sub_scores["source_probability"],
                    "behaviour": score.sub_scores["behavioural"],
                    "ais_continuity": score.sub_scores["ais_continuity"],
                    "supporting": supporting,
                    "contradicting": contradicting,
                    "raw_features": json.dumps(raw_features),
                    "score_breakdown": json.dumps(score_breakdown),
                    "model_version": MODEL_VERSION,
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


def _persist_vessel_track(db, mmsi: str, track: list[AISObservation]) -> str:
    first = track[0]
    vessel = db.execute(
        text(
            """
            INSERT INTO vessels (mmsi, imo, name, flag, vessel_type, source_registry)
            VALUES (:mmsi, :imo, :name, :flag, :vessel_type, 'synthetic')
            ON CONFLICT (mmsi) WHERE mmsi IS NOT NULL DO UPDATE
              SET imo = EXCLUDED.imo,
                  name = EXCLUDED.name,
                  flag = EXCLUDED.flag,
                  vessel_type = EXCLUDED.vessel_type,
                  source_registry = EXCLUDED.source_registry
            RETURNING id
            """
        ),
        {"mmsi": mmsi, "imo": first.imo, "name": first.vessel_name, "flag": first.flag, "vessel_type": first.vessel_type},
    ).mappings().one()
    vessel_id = str(vessel["id"])
    db.execute(text("DELETE FROM vessel_positions WHERE vessel_id = :vessel_id AND source = 'synthetic'"), {"vessel_id": vessel_id})
    db.execute(text("DELETE FROM vessel_events WHERE vessel_id = :vessel_id"), {"vessel_id": vessel_id})
    for point in track:
        db.execute(
            text(
                """
                INSERT INTO vessel_positions
                  (vessel_id, ts, position, sog_knots, cog_deg, heading_deg, nav_status, source)
                VALUES (:vessel_id, :ts, ST_SetSRID(ST_Point(:lon, :lat), 4326),
                        :sog, :cog, :heading, :nav_status, 'synthetic')
                """
            ),
            {
                "vessel_id": vessel_id,
                "ts": point.timestamp,
                "lon": point.longitude,
                "lat": point.latitude,
                "sog": point.sog_knots,
                "cog": point.cog_deg,
                "heading": point.heading_deg,
                "nav_status": point.nav_status,
            },
        )
    return vessel_id


def _load_source_hypothesis(db, case_id: str) -> SourceHypothesis:
    row = db.execute(
        text(
            """
            SELECT ST_AsGeoJSON(sh.probable_source_region) AS probable_source_region,
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
        {"case_id": case_id},
    ).mappings().first()
    if not row:
        raise RuntimeError("Source hypothesis not found; run Track C drift before AIS attribution")
    if row["drift_corridor_bearing_deg"] is None:
        raise RuntimeError("Source hypothesis is missing drift_corridor_bearing_deg")
    return SourceHypothesis(
        probable_source_region=shape(json.loads(row["probable_source_region"])),
        time_window_start=row["time_window_start"],
        time_window_end=row["time_window_end"],
        confidence=row["confidence"],
        drift_corridor_bearing_deg=row["drift_corridor_bearing_deg"],
    )


def _events_for_track(track, source, features):
    events = [
        {
            "event_type": event["event_type"],
            "start_time": event["timestamp"],
            "latitude": event["latitude"],
            "longitude": event["longitude"],
        }
        for event in detect_region_events(track, source)
    ]
    if features.loitering_h > 0:
        events.append({"event_type": "LOITERING", "start_time": source.time_window_start, "end_time": source.time_window_end, "confidence": 0.7})
    for gap in features.ais_gaps:
        events.append({"event_type": "AIS_GAP", "start_time": gap.gap_start, "end_time": gap.gap_end, "confidence": 0.8})
    if features.speed_anomaly > 2:
        events.append({"event_type": "SPEED_ANOMALY", "start_time": source.time_window_start, "end_time": source.time_window_end, "confidence": 0.65})
    return events


def _fail(db, job_id: str, exc: Exception) -> None:
    db.rollback()
    db.execute(text("UPDATE jobs SET status='failed', error=:error, updated_at=now() WHERE id=:id"), {"id": job_id, "error": str(exc)})
    db.commit()


def _json_value(value):
    return value if isinstance(value, (dict, list)) else json.loads(value)
