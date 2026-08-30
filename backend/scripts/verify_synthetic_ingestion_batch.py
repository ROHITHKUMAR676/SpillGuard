from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text

from core.db import SessionLocal
from modules.cases.router import (
    candidate_evidence,
    candidate_explanation,
    candidates,
    latest_slick,
    recent_cases,
    recent_synthetic_batches,
    source_hypothesis,
)
from workers.synthetic_ingestion_worker import process_synthetic_ingestion_batch


def main() -> None:
    result = process_synthetic_ingestion_batch(schedule_next=False)
    if not result.get("started"):
        raise SystemExit(json.dumps(result, indent=2))
    batch_id = result["batch_id"]
    case_ids = [item["case_id"] for item in result["cases"] if item["status"] == "succeeded"]
    if len(case_ids) != 5:
        raise SystemExit(f"Expected five succeeded cases, got {len(case_ids)}")

    api_summary = []
    db = SessionLocal()
    try:
        for case_id in case_ids:
            slick = latest_slick(case_id, db)
            source = source_hypothesis(case_id, db)
            ranked_candidates = candidates(case_id, db)
            top = ranked_candidates[0]
            evidence = candidate_evidence(case_id, top["vessel"]["id"], db)
            explanation = candidate_explanation(case_id, top["vessel"]["id"], db)
            api_summary.append(
                {
                    "case_id": case_id,
                    "slick_contract_populated": all(
                        slick.get(key) is not None
                        for key in [
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
                    ),
                    "source_contract_populated": all(
                        source.get(key) is not None
                        for key in [
                            "probable_source_region",
                            "time_window_start",
                            "time_window_end",
                            "confidence",
                            "drift_corridor_bearing_deg",
                        ]
                    ),
                    "ranking": [
                        {
                            "rank": candidate["rank"],
                            "mmsi": candidate["vessel"]["mmsi"],
                            "name": candidate["vessel"]["name"],
                            "overall_score": candidate["overall_score"],
                            "sub_scores": candidate["sub_scores"],
                        }
                        for candidate in ranked_candidates
                    ],
                    "top_evidence": {
                        "supporting": evidence["supporting_evidence"],
                        "contradicting": evidence["contradicting_evidence"],
                        "events": [event["event_type"] for event in evidence["vessel_events"]],
                    },
                    "explanation": explanation["explanation"],
                    "explanation_stored": explanation.get("stored"),
                }
            )

            if len(ranked_candidates) < 3:
                raise SystemExit(f"Case {case_id} has too few candidates")
            if [item["rank"] for item in ranked_candidates] != list(range(1, len(ranked_candidates) + 1)):
                raise SystemExit(f"Case {case_id} ranking is not contiguous")
            if top["overall_score"] != evidence["overall_score"] or top["rank"] != evidence["rank"]:
                raise SystemExit(f"Case {case_id} score/rank mismatch between candidates and evidence APIs")
            if "deterministic score" not in explanation["explanation"] and "stored" not in explanation["explanation"].lower():
                raise SystemExit(f"Case {case_id} explanation did not reference stored deterministic result")
            if not api_summary[-1]["slick_contract_populated"] or not api_summary[-1]["source_contract_populated"]:
                raise SystemExit(f"Case {case_id} handoff contract is incomplete")

        db_summary = database_summary(batch_id)
        recent = recent_cases(10, db)
        batch_status = recent_synthetic_batches(1, db)
    finally:
        db.close()
    print(
        json.dumps(
            {
                "batch_id": batch_id,
                "case_ids": case_ids,
                "api_summary": api_summary,
                "db_summary": db_summary,
                "recent_case_ids": [item["id"] for item in recent[:5]],
                "latest_batch_status": batch_status[0] if batch_status else None,
            },
            default=str,
            indent=2,
        )
    )

    if db_summary["case_rows"] != 5 or db_summary["slick_rows"] != 5 or db_summary["source_rows"] != 5:
        raise SystemExit("Expected five persisted case/slick/source rows")
    if db_summary["candidate_rows"] < 15 or db_summary["position_rows"] < 100:
        raise SystemExit("Expected persisted attribution candidates and AIS observations")
    if db_summary["running_batches"] != 0:
        raise SystemExit("A synthetic batch is still marked running")
    if not all(case_id in [str(item["id"]) for item in recent] for case_id in case_ids):
        raise SystemExit("Recent cases API did not include all batch cases")


def database_summary(batch_id: str) -> dict:
    db = SessionLocal()
    try:
        row = db.execute(
            text(
                """
                WITH batch_cases AS (
                  SELECT DISTINCT case_id
                  FROM synthetic_ingestion_stage_status
                  WHERE batch_id = :batch_id AND case_id IS NOT NULL
                )
                SELECT
                  (SELECT count(*) FROM batch_cases) AS case_rows,
                  (SELECT count(*)
                   FROM oil_slicks os
                   JOIN satellite_scenes ss ON ss.id = os.scene_id
                   JOIN batch_cases bc ON bc.case_id = ss.case_id) AS slick_rows,
                  (SELECT count(*)
                   FROM source_hypotheses sh
                   JOIN drift_runs dr ON dr.id = sh.drift_run_id
                   JOIN oil_slicks os ON os.id = dr.slick_id
                   JOIN satellite_scenes ss ON ss.id = os.scene_id
                   JOIN batch_cases bc ON bc.case_id = ss.case_id) AS source_rows,
                  (SELECT count(*)
                   FROM attribution_candidates ac
                   JOIN batch_cases bc ON bc.case_id = ac.case_id) AS candidate_rows,
                  (SELECT count(*)
                   FROM vessel_positions vp
                   JOIN vessels v ON v.id = vp.vessel_id
                   WHERE v.name LIKE 'SYN%') AS position_rows,
                  (SELECT count(*)
                   FROM synthetic_ingestion_stage_status
                   WHERE batch_id = :batch_id AND status = 'succeeded') AS succeeded_stage_rows,
                  (SELECT count(*) FROM synthetic_ingestion_batches WHERE status = 'running') AS running_batches
                """
            ),
            {"batch_id": batch_id},
        ).mappings().one()
        return dict(row)
    finally:
        db.close()


if __name__ == "__main__":
    main()
