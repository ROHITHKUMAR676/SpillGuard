from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import text
from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon, mapping, shape

from core.config import settings
from core.db import SessionLocal
from modules.ais.synthetic import AISObservation, generate_controlled_attribution_tracks, validate_observations
from modules.attribution.explanation import explain_candidate
from modules.attribution.features import extract_features
from modules.attribution.filter import filter_candidate_tracks
from modules.attribution.scorer import MODEL_VERSION, generate_evidence, rank_scores, score_candidates
from modules.drift.advection import SyntheticForcing
from modules.drift.engine import EulerDriftEngine, SlickInput
from workers.celery_app import celery_app
from workers.drift_worker import _events_for_track, _persist_vessel_track


SYNTHETIC_BATCH_USER_ID = "00000000-0000-0000-0000-000000000002"
SYNTHETIC_BATCH_SIZE = 5
SYNTHETIC_NEXT_DELAY_SECONDS = 180
SYNTHETIC_BATCH_LOCK_ID = 26143005
STAGES = ("case", "sar", "detection", "drift", "ais_attribution", "ranking_evidence", "llm_explanation")


@dataclass(frozen=True)
class SyntheticScenario:
    index: int
    title: str
    center_lon: float
    center_lat: float
    acquisition_time: datetime
    forcing: SyntheticForcing
    orientation_deg: float
    confidence: float
    v4_threshold: float
    v3_threshold: float
    source_width: int
    source_height: int


@celery_app.task(name="workers.synthetic_ingestion_worker.run_synthetic_ingestion_batch")
def run_synthetic_ingestion_batch() -> dict:
    if not settings.synthetic_ingestion_enabled:
        return {"started": False, "reason": "synthetic ingestion is disabled"}
    result = process_synthetic_ingestion_batch(schedule_next=settings.synthetic_ingestion_enabled)
    return result


def process_synthetic_ingestion_batch(schedule_next: bool = False) -> dict:
    db = SessionLocal()
    batch_id = None
    have_lock = False
    try:
        have_lock = _try_batch_lock(db)
        if not have_lock:
            return {"started": False, "reason": "synthetic ingestion batch already locked by another worker"}
        if _running_batch_exists(db):
            return {"started": False, "reason": "synthetic ingestion batch already running"}
        _ensure_user(db)
        batch = db.execute(
            text(
                """
                INSERT INTO synthetic_ingestion_batches (status, case_count)
                VALUES ('running', :case_count)
                RETURNING id
                """
            ),
            {"case_count": SYNTHETIC_BATCH_SIZE},
        ).mappings().one()
        batch_id = str(batch["id"])
        db.commit()

        results = []
        for scenario in _scenarios(SYNTHETIC_BATCH_SIZE):
            results.append(_process_case(db, batch_id, scenario))

        failed = [item for item in results if item["status"] == "failed"]
        status = "succeeded" if not failed else "partial_failed" if len(failed) < len(results) else "failed"
        db.execute(
            text("UPDATE synthetic_ingestion_batches SET status=:status, completed_at=now(), error=:error WHERE id=:id"),
            {"id": batch_id, "status": status, "error": "; ".join(item["error"] for item in failed) or None},
        )
        db.commit()

        if schedule_next:
            run_synthetic_ingestion_batch.apply_async(countdown=SYNTHETIC_NEXT_DELAY_SECONDS)

        return {"started": True, "batch_id": batch_id, "status": status, "cases": results}
    except Exception as exc:
        db.rollback()
        if batch_id:
            db.execute(
                text("UPDATE synthetic_ingestion_batches SET status='failed', completed_at=now(), error=:error WHERE id=:id"),
                {"id": batch_id, "error": str(exc)},
            )
            db.commit()
        raise
    finally:
        if have_lock:
            try:
                db.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": SYNTHETIC_BATCH_LOCK_ID})
                db.commit()
            except Exception:
                db.rollback()
        db.close()


def _process_case(db, batch_id: str, scenario: SyntheticScenario) -> dict:
    case_id = None
    try:
        case_id = _create_case(db, scenario)
        _create_stage_rows(db, batch_id, case_id)
        _mark_stage(db, batch_id, case_id, "case", "succeeded")
        _mark_stage(db, batch_id, case_id, "sar", "running")
        scene_id = _create_scene(db, case_id, scenario)
        _mark_stage(db, batch_id, case_id, "sar", "succeeded")

        _mark_stage(db, batch_id, case_id, "detection", "running")
        slick_id = _create_slick(db, scene_id, scenario)
        _mark_stage(db, batch_id, case_id, "detection", "succeeded")

        _mark_stage(db, batch_id, case_id, "drift", "running")
        source = _run_drift(db, case_id, slick_id, scenario)
        _mark_stage(db, batch_id, case_id, "drift", "succeeded")

        _mark_stage(db, batch_id, case_id, "ais_attribution", "running")
        observations = generate_controlled_attribution_tracks(
            source.probable_source_region,
            source.time_window_start,
            source.time_window_end,
            source.drift_corridor_bearing_deg,
            mmsi_prefix=f"419{UUID(case_id).int % 1_000_000:06d}{scenario.index % 10}",
            vessel_prefix=f"SYN{scenario.index + 1:02d}",
            variant=scenario.index,
        )
        validate_observations(observations)
        tracks = _tracks_by_mmsi(observations)
        candidate_tracks = filter_candidate_tracks(tracks, source)
        features_by_mmsi = {mmsi: extract_features(track, source) for mmsi, track in candidate_tracks.items()}
        _mark_stage(db, batch_id, case_id, "ais_attribution", "succeeded")

        _mark_stage(db, batch_id, case_id, "ranking_evidence", "running")
        ranking = _persist_attribution(db, case_id, tracks, candidate_tracks, features_by_mmsi, source)
        _mark_stage(db, batch_id, case_id, "ranking_evidence", "succeeded")

        _mark_stage(db, batch_id, case_id, "llm_explanation", "running")
        explanation = _explain_top_candidate(db, case_id)
        _mark_stage(db, batch_id, case_id, "llm_explanation", "succeeded")

        db.execute(text("UPDATE cases SET status='reviewed' WHERE id=:id"), {"id": case_id})
        db.commit()
        return {"case_id": case_id, "status": "succeeded", "ranking": ranking, "explanation": explanation}
    except Exception as exc:
        db.rollback()
        if case_id:
            _fail_active_stage(db, batch_id, case_id, exc)
            db.commit()
        return {"case_id": case_id, "status": "failed", "error": str(exc)}


def _create_case(db, scenario: SyntheticScenario) -> str:
    half_width = 0.82 + scenario.index * 0.05
    half_height = 0.58 + scenario.index * 0.03
    aoi = {
        "type": "Polygon",
        "coordinates": [[
            [scenario.center_lon - half_width, scenario.center_lat - half_height],
            [scenario.center_lon + half_width, scenario.center_lat - half_height],
            [scenario.center_lon + half_width, scenario.center_lat + half_height],
            [scenario.center_lon - half_width, scenario.center_lat + half_height],
            [scenario.center_lon - half_width, scenario.center_lat - half_height],
        ]],
    }
    row = db.execute(
        text(
            """
            INSERT INTO cases (title, aoi, time_window_start, time_window_end, created_by)
            VALUES (:title, ST_SetSRID(ST_GeomFromGeoJSON(:aoi), 4326), :start_time, :end_time, :user_id)
            RETURNING id
            """
        ),
        {
            "title": scenario.title,
            "aoi": json.dumps(aoi),
            "start_time": scenario.acquisition_time - timedelta(hours=72),
            "end_time": scenario.acquisition_time + timedelta(hours=12),
            "user_id": SYNTHETIC_BATCH_USER_ID,
        },
    ).mappings().one()
    case_id = str(row["id"])
    db.commit()
    return case_id


def _create_stage_rows(db, batch_id: str, case_id: str) -> None:
    for stage in STAGES:
        db.execute(
            text(
                """
                INSERT INTO synthetic_ingestion_stage_status (batch_id, case_id, stage, status)
                VALUES (:batch_id, :case_id, :stage, 'queued')
                """
            ),
            {"batch_id": batch_id, "case_id": case_id, "stage": stage},
        )
    db.commit()


def _create_scene(db, case_id: str, scenario: SyntheticScenario) -> str:
    footprint = _box_polygon(scenario.center_lon, scenario.center_lat, 1.25, 0.9)
    row = db.execute(
        text(
            """
            INSERT INTO satellite_scenes (case_id, sensor, acquisition_time, footprint, polarization, local_object_key, checksum)
            VALUES (:case_id, 'S1A_IW_GRDH', :ts, ST_SetSRID(ST_GeomFromGeoJSON(:footprint), 4326),
                    ARRAY['VV','VH'], :object_key, :checksum)
            RETURNING id
            """
        ),
        {
            "case_id": case_id,
            "ts": scenario.acquisition_time,
            "footprint": json.dumps(mapping(footprint)),
            "object_key": f"raw/synthetic/batch/{case_id}/scene.tif",
            "checksum": f"synthetic-{case_id}",
        },
    ).mappings().one()
    db.commit()
    return str(row["id"])


def _create_slick(db, scene_id: str, scenario: SyntheticScenario) -> str:
    slick = _slick_geometry(scenario)
    min_lon, min_lat, max_lon, max_lat = slick.bounds
    row = db.execute(
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
               :orientation, :confidence, false, null, :model_version,
               :event_id, :processing_timestamp, 'synthetic_sar_batch', 'EPSG:4326',
               CAST(:bbox AS JSONB), :v4_threshold, :v3_threshold,
               :candidate_count, :accepted_candidates, :source_width, :source_height)
            RETURNING id
            """
        ),
        {
            "scene_id": scene_id,
            "geometry": json.dumps(mapping(slick)),
            "orientation": scenario.orientation_deg,
            "confidence": scenario.confidence,
            "model_version": "oil-seg-v1.0-synthetic-batch",
            "event_id": f"synthetic-batch-{scenario.acquisition_time.strftime('%Y%m%dT%H%M%SZ')}-{scenario.index + 1}",
            "processing_timestamp": scenario.acquisition_time + timedelta(minutes=12 + scenario.index),
            "bbox": json.dumps([min_lon, min_lat, max_lon, max_lat]),
            "v4_threshold": scenario.v4_threshold,
            "v3_threshold": scenario.v3_threshold,
            "candidate_count": 3 + scenario.index,
            "accepted_candidates": 1,
            "source_width": scenario.source_width,
            "source_height": scenario.source_height,
        },
    ).mappings().one()
    db.commit()
    return str(row["id"])


def _run_drift(db, case_id: str, slick_id: str, scenario: SyntheticScenario):
    row = db.execute(
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
    ).mappings().one()
    drift_result = EulerDriftEngine(scenario.forcing).run(
        SlickInput(
            geometry=shape(_json_value(row["geometry"])),
            centroid=shape(_json_value(row["centroid"])),
            acquisition_timestamp=row["acquisition_time"],
            case_time_window_start=row["time_window_start"],
            case_time_window_end=row["time_window_end"],
        ),
        backward_hours=48,
        forward_hours=72,
    )
    environment = db.execute(
        text(
            """
            INSERT INTO environmental_fields (source, variable, valid_time, bbox, object_key)
            VALUES ('copernicus_marine', 'synthetic_batch_euler_surface_current',
                    :valid_time, ST_SetSRID(ST_GeomFromGeoJSON(:bbox), 4326), :object_key)
            RETURNING id
            """
        ),
        {
            "valid_time": row["acquisition_time"],
            "bbox": json.dumps(_json_value(row["case_aoi"])),
            "object_key": f"processed/environment/synthetic-batch/{case_id}.json",
        },
    ).mappings().one()
    run = db.execute(
        text(
            """
            INSERT INTO drift_runs (slick_id, direction, engine, ensemble_size, environment_field_ids, completed_at, result_object_key)
            VALUES (:slick_id, 'backward', 'lightweight_particle', 20, ARRAY[CAST(:environment_id AS UUID)], now(), :object_key)
            RETURNING id
            """
        ),
        {
            "slick_id": slick_id,
            "environment_id": str(environment["id"]),
            "object_key": f"processed/drift/synthetic-batch/{case_id}/backward_euler.json",
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
            "surface": f"processed/source_hypothesis/synthetic-batch/{case_id}.tif",
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
                VALUES (:run_id, 72, :percentile, ST_SetSRID(ST_GeomFromGeoJSON(:polygon), 4326))
                """
            ),
            {"run_id": str(run["id"]), "percentile": percentile, "polygon": json.dumps(mapping(polygon))},
        )
    db.commit()
    return drift_result.source_hypothesis


def _persist_attribution(db, case_id: str, tracks, candidate_tracks, features_by_mmsi, source) -> list[dict]:
    source_window_hours = (source.time_window_end - source.time_window_start).total_seconds() / 3600.0
    scores = score_candidates(features_by_mmsi, source_window_hours)
    db.execute(text("DELETE FROM attribution_candidates WHERE case_id = :case_id"), {"case_id": case_id})
    vessel_ids = {mmsi: _persist_vessel_track(db, mmsi, track) for mmsi, track in tracks.items()}
    ranking = []
    for mmsi, score, rank in rank_scores(scores):
        track = candidate_tracks[mmsi]
        vessel_id = vessel_ids[mmsi]
        features = features_by_mmsi[mmsi]
        name = track[0].vessel_name or mmsi
        supporting, contradicting = generate_evidence(name, features)
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
        db.execute(
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
                "raw_features": json.dumps(features.to_json()),
                "score_breakdown": json.dumps({key: {"score": value, "model_version": MODEL_VERSION} for key, value in score.sub_scores.items()}),
                "model_version": MODEL_VERSION,
                "rank": rank,
            },
        )
        ranking.append({"rank": rank, "mmsi": mmsi, "name": name, "overall_score": score.overall_score})
    db.commit()
    return ranking


def _explain_top_candidate(db, case_id: str) -> str:
    row = db.execute(
        text(
            """
            SELECT ac.*, v.id AS vessel_id_out, v.mmsi, v.name, v.flag, v.vessel_type
            FROM attribution_candidates ac
            JOIN vessels v ON v.id = ac.vessel_id
            WHERE ac.case_id = :case_id
            ORDER BY ac.rank
            LIMIT 1
            """
        ),
        {"case_id": case_id},
    ).mappings().one()
    events = db.execute(
        text(
            """
            SELECT id, event_type, start_time, end_time, ST_AsGeoJSON(geometry)::json AS geometry, confidence
            FROM vessel_events
            WHERE vessel_id = :vessel_id
            ORDER BY start_time
            """
        ),
        {"vessel_id": str(row["vessel_id"])},
    ).mappings().all()
    payload = {
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
        "raw_features": _json_value(row["raw_features"]),
        "score_breakdown": _json_value(row["score_breakdown"]),
        "vessel_events": [dict(event) for event in events],
        "model_version": row["model_version"],
        "excluded_by_analyst": row["excluded_by_analyst"],
    }
    explanation = explain_candidate(payload)
    db.execute(
        text(
            """
            UPDATE attribution_candidates
            SET llm_explanation = :explanation,
                llm_explained_at = now()
            WHERE id = :candidate_id
            """
        ),
        {"candidate_id": str(row["id"]), "explanation": explanation},
    )
    db.commit()
    return explanation


def _mark_stage(db, batch_id: str, case_id: str, stage: str, status: str, error: str | None = None) -> None:
    db.execute(
        text(
            """
            UPDATE synthetic_ingestion_stage_status
            SET status=:status,
                started_at=COALESCE(started_at, CASE WHEN :status IN ('running','succeeded','failed') THEN now() ELSE started_at END),
                completed_at=CASE WHEN :status IN ('succeeded','failed') THEN now() ELSE completed_at END,
                error=:error
            WHERE batch_id=:batch_id AND case_id=:case_id AND stage=:stage
            """
        ),
        {"batch_id": batch_id, "case_id": case_id, "stage": stage, "status": status, "error": error},
    )
    db.commit()


def _fail_active_stage(db, batch_id: str, case_id: str, exc: Exception) -> None:
    row = db.execute(
        text(
            """
            SELECT stage
            FROM synthetic_ingestion_stage_status
            WHERE batch_id=:batch_id AND case_id=:case_id AND status='running'
            ORDER BY started_at DESC
            LIMIT 1
            """
        ),
        {"batch_id": batch_id, "case_id": case_id},
    ).mappings().first()
    if row:
        _mark_stage(db, batch_id, case_id, row["stage"], "failed", str(exc))


def _running_batch_exists(db) -> bool:
    row = db.execute(
        text("SELECT id FROM synthetic_ingestion_batches WHERE status='running' LIMIT 1")
    ).mappings().first()
    return row is not None


def _try_batch_lock(db) -> bool:
    row = db.execute(
        text("SELECT pg_try_advisory_lock(:lock_id) AS locked"),
        {"lock_id": SYNTHETIC_BATCH_LOCK_ID},
    ).mappings().one()
    return bool(row["locked"])


def _ensure_user(db) -> None:
    db.execute(
        text(
            """
            INSERT INTO users (id, username, password_hash, role)
            VALUES (:id, 'synthetic_batch_worker', 'not-used-by-worker', 'analyst')
            ON CONFLICT (username) DO NOTHING
            """
        ),
        {"id": SYNTHETIC_BATCH_USER_ID},
    )
    db.commit()


def _scenarios(count: int) -> list[SyntheticScenario]:
    base_time = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    centers = [(68.9, 16.2), (70.35, 14.85), (72.1, 18.05), (66.95, 12.75), (74.2, 15.95)]
    scenarios = []
    for index in range(count):
        lon, lat = centers[index % len(centers)]
        offset = index // len(centers)
        scenarios.append(
            SyntheticScenario(
                index=index + offset * len(centers),
                title=f"Synthetic E2E Batch Case {base_time.strftime('%Y%m%dT%H%MZ')} #{index + 1}",
                center_lon=lon + offset * 0.31,
                center_lat=lat + offset * 0.17,
                acquisition_time=base_time - timedelta(hours=2 * index),
                forcing=SyntheticForcing(eastward_mps=0.08 + index * 0.025, northward_mps=0.04 + index * 0.012),
                orientation_deg=28.0 + index * 17.0,
                confidence=round(0.76 + index * 0.035, 3),
                v4_threshold=round(0.6 + index * 0.015, 3),
                v3_threshold=round(0.38 + index * 0.012, 3),
                source_width=1800 + index * 96,
                source_height=1300 + index * 80,
            )
        )
    return scenarios


def _slick_geometry(scenario: SyntheticScenario) -> MultiPolygon:
    radius = 0.055 + scenario.index * 0.006
    points = []
    for step in range(12):
        angle = 2.0 * math.pi * step / 12.0
        radial_warp = 1.0 + (0.18 if step % 3 == 0 else -0.08 if step % 4 == 0 else 0.04)
        points.append(
            (
                scenario.center_lon + math.cos(angle) * radius * 1.9 * radial_warp,
                scenario.center_lat + math.sin(angle) * radius * 0.85 * radial_warp,
            )
        )
    points.append(points[0])
    polygon = Polygon(points).buffer(0)
    polygon = affinity.rotate(polygon, scenario.orientation_deg, origin=(scenario.center_lon, scenario.center_lat))
    return MultiPolygon([polygon])


def _box_polygon(lon: float, lat: float, half_width: float, half_height: float) -> Polygon:
    return Polygon([
        (lon - half_width, lat - half_height),
        (lon + half_width, lat - half_height),
        (lon + half_width, lat + half_height),
        (lon - half_width, lat + half_height),
        (lon - half_width, lat - half_height),
    ])


def _tracks_by_mmsi(observations: list[AISObservation]) -> dict[str, list[AISObservation]]:
    tracks: dict[str, list[AISObservation]] = {}
    for observation in observations:
        tracks.setdefault(observation.mmsi, []).append(observation)
    return tracks


def _json_value(value):
    return value if isinstance(value, (dict, list)) else json.loads(value)
