from datetime import datetime, timedelta, timezone
import unittest

from shapely.geometry import Polygon

from modules.ais.synthetic import AISObservation
from modules.attribution.features import extract_features
from modules.attribution.filter import SourceHypothesis, filter_candidate_tracks
from modules.attribution.scorer import generate_evidence, rank_scores, score_candidates


class TrackDPipelineTest(unittest.TestCase):
    def test_deterministic_pipeline_ranks_contract_aligned_tracks(self):
        release_time = datetime(2025, 5, 24, 18, tzinfo=timezone.utc)
        source = SourceHypothesis(
            probable_source_region=Polygon([(71.9, 14.9), (72.1, 14.9), (72.1, 15.1), (71.9, 15.1), (71.9, 14.9)]),
            time_window_start=release_time - timedelta(hours=1),
            time_window_end=release_time + timedelta(hours=1),
            confidence="medium",
        )
        tracks = {
            "419000001": [
                _point("419000001", "SYNTH-001", release_time - timedelta(minutes=30), 15.0, 72.0, 1.0),
                _point("419000001", "SYNTH-001", release_time, 15.01, 72.01, 1.0),
                _point("419000001", "SYNTH-001", release_time + timedelta(minutes=30), 15.02, 72.02, 1.0),
            ],
            "419000999": [
                _point("419000999", "FAR", release_time, 17.0, 74.0, 10.0),
                _point("419000999", "FAR", release_time + timedelta(minutes=30), 17.1, 74.1, 10.0),
            ],
        }

        candidates = filter_candidate_tracks(tracks, source)
        features = {mmsi: extract_features(track, source) for mmsi, track in candidates.items()}
        scores = score_candidates(features, 2.0)
        ranked = rank_scores(scores)

        self.assertEqual(["419000001"], list(candidates.keys()))
        self.assertEqual(ranked[0][0], "419000001")
        self.assertEqual(set(scores["419000001"].sub_scores), {"spatial", "temporal", "trajectory", "source_probability", "behavioural", "ais_continuity"})
        self.assertEqual(scores["419000001"].sub_scores["trajectory"], 50.0)
        self.assertTrue(0 <= scores["419000001"].overall_score <= 100)
        supporting, contradicting = generate_evidence("SYNTH-001", features["419000001"])
        self.assertTrue(supporting)
        self.assertTrue(contradicting)

    def test_trajectory_score_uses_source_drift_bearing(self):
        release_time = datetime(2025, 5, 24, 18, tzinfo=timezone.utc)
        source = SourceHypothesis(
            probable_source_region=Polygon([(71.9, 14.9), (72.1, 14.9), (72.1, 15.1), (71.9, 15.1), (71.9, 14.9)]),
            time_window_start=release_time - timedelta(hours=1),
            time_window_end=release_time + timedelta(hours=1),
            confidence="medium",
            drift_corridor_bearing_deg=55.0,
        )
        aligned = [
            _point("419000001", "ALIGNED", release_time - timedelta(minutes=30), 15.0, 72.0, 1.0, cog=55.0),
            _point("419000001", "ALIGNED", release_time, 15.01, 72.01, 1.0, cog=55.0),
        ]
        opposite = [
            _point("419000002", "OPPOSITE", release_time - timedelta(minutes=30), 15.0, 72.0, 1.0, cog=235.0),
            _point("419000002", "OPPOSITE", release_time, 15.01, 72.01, 1.0, cog=235.0),
        ]

        features = {"aligned": extract_features(aligned, source), "opposite": extract_features(opposite, source)}
        scores = score_candidates(features, 2.0)

        self.assertEqual(scores["aligned"].sub_scores["trajectory"], 100.0)
        self.assertEqual(scores["opposite"].sub_scores["trajectory"], 0.0)


def _point(mmsi: str, name: str, timestamp: datetime, lat: float, lon: float, sog: float, cog: float = 55.0) -> AISObservation:
    return AISObservation(
        mmsi=mmsi,
        imo=None,
        vessel_name=name,
        flag="IN",
        vessel_type="tanker",
        timestamp=timestamp,
        latitude=lat,
        longitude=lon,
        sog_knots=sog,
        cog_deg=cog,
        heading_deg=cog,
        nav_status="UNDER_WAY",
    )
