"""Authoritative deterministic Track D scorer."""

from __future__ import annotations

from dataclasses import dataclass

from modules.attribution.features import TrackDFeatures

WEIGHTS = {
    "spatial": 0.25,
    "temporal": 0.20,
    "trajectory": 0.20,
    "source_probability": 0.15,
    "behavioural": 0.10,
    "ais_continuity": 0.05,
}
WEIGHT_TOTAL = sum(WEIGHTS.values())
NORMALIZED_WEIGHTS = {key: value / WEIGHT_TOTAL for key, value in WEIGHTS.items()}
MODEL_VERSION = "attribution-v1-deterministic"


@dataclass(frozen=True)
class CandidateScore:
    overall_score: float
    sub_scores: dict[str, float]


def score_candidates(features_by_mmsi: dict[str, TrackDFeatures], source_window_hours: float) -> dict[str, CandidateScore]:
    raw_behaviour = {mmsi: max(features.loitering_h, 0.0) + max(features.speed_anomaly, 0.0) for mmsi, features in features_by_mmsi.items()}
    behaviour_min = min(raw_behaviour.values()) if raw_behaviour else 0.0
    behaviour_max = max(raw_behaviour.values()) if raw_behaviour else 0.0

    scores: dict[str, CandidateScore] = {}
    for mmsi, features in features_by_mmsi.items():
        behavioural = 50.0
        if behaviour_max > behaviour_min:
            behavioural = (raw_behaviour[mmsi] - behaviour_min) / (behaviour_max - behaviour_min) * 100.0

        sub_scores = {
            "spatial": _clamp(100.0 / (1.0 + max(features.spatial_proximity_km, 0.0))),
            "temporal": _clamp((max(features.temporal_overlap_h, 0.0) / max(source_window_hours, 1.0)) * 100.0),
            "trajectory": 50.0,
            "source_probability": 50.0,
            "behavioural": _clamp(behavioural),
            "ais_continuity": 40.0 if features.has_ais_gap_in_window else 100.0,
        }
        overall = sum(NORMALIZED_WEIGHTS[key] * sub_scores[key] for key in NORMALIZED_WEIGHTS)
        scores[mmsi] = CandidateScore(overall_score=_clamp(overall), sub_scores=sub_scores)
    return scores


def rank_scores(scores: dict[str, CandidateScore]) -> list[tuple[str, CandidateScore, int]]:
    ordered = sorted(scores.items(), key=lambda item: (-item[1].overall_score, item[0]))
    return [(mmsi, score, index + 1) for index, (mmsi, score) in enumerate(ordered)]


def generate_evidence(vessel_name: str, features: TrackDFeatures) -> tuple[list[str], list[str]]:
    supporting: list[str] = []
    contradicting: list[str] = []

    if features.time_in_region_h > 0:
        supporting.append(f"{vessel_name}: spent {features.time_in_region_h:.2f} h inside the probable source region during the source time window.")
    if features.has_ais_gap_in_window:
        supporting.append(f"{vessel_name}: AIS gap observed during the relevant source time window.")
    if features.loitering_h > 0:
        supporting.append(f"{vessel_name}: low-speed loitering observed for {features.loitering_h:.2f} h inside the probable source region.")

    if not features.has_ais_gap_in_window:
        contradicting.append(f"{vessel_name}: no AIS gap observed during the relevant time window, reducing evidence for deliberate AIS concealment.")
    if features.spatial_proximity_km > 20:
        contradicting.append(f"{vessel_name}: {features.spatial_proximity_km:.1f} km from the source region, indicating weak spatial proximity.")

    return supporting, contradicting


def _clamp(value: float) -> float:
    return float(max(0.0, min(100.0, value)))
