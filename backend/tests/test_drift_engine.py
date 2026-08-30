from datetime import datetime, timezone
import unittest

from shapely.geometry import MultiPolygon, Polygon

from modules.drift.advection import METERS_PER_DEG_LAT
from modules.drift.engine import EulerDriftEngine, SlickInput


class EulerDriftEngineTest(unittest.TestCase):
    def test_backtrack_is_constrained_by_case_window(self):
        acquisition = datetime(2026, 8, 24, 14, tzinfo=timezone.utc)
        slick_geometry = MultiPolygon(
            [
                Polygon(
                    [
                        (68.99, 16.00),
                        (69.01, 16.00),
                        (69.01, 16.02),
                        (68.99, 16.02),
                        (68.99, 16.00),
                    ]
                )
            ]
        )
        slick = SlickInput(
            geometry=slick_geometry,
            centroid=slick_geometry.centroid,
            acquisition_timestamp=acquisition,
            case_time_window_start=datetime(2026, 8, 24, 2, tzinfo=timezone.utc),
            case_time_window_end=datetime(2026, 8, 25, 0, tzinfo=timezone.utc),
        )

        result = EulerDriftEngine().run(slick, backward_hours=48, forward_hours=72)
        source = result.source_hypothesis

        self.assertEqual(source.time_window_start, slick.case_time_window_start)
        self.assertGreater(source.time_window_end, source.time_window_start)
        self.assertLessEqual(source.time_window_end, slick.acquisition_timestamp)

        expected_north_shift_deg = (result.forcing.northward_mps * 12 * 3600) / METERS_PER_DEG_LAT
        actual_north_shift_deg = slick.centroid.y - source.probable_source_region.centroid.y
        self.assertAlmostEqual(actual_north_shift_deg, expected_north_shift_deg, places=4)
        self.assertTrue(0 <= source.drift_corridor_bearing_deg < 360)


if __name__ == "__main__":
    unittest.main()
