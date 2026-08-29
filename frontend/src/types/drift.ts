import type { GeoJSONPolygon } from "./geo";

export interface SourceHypothesis {
  id: string;
  drift_run_id: string;
  probable_source_region: GeoJSONPolygon;
  time_window_start: string;
  time_window_end: string;
  confidence: "low" | "medium" | "high";
}
export interface ForecastContour { horizon_hours: number; percentile: 50 | 80 | 95; polygon: GeoJSONPolygon; }
export interface ForwardForecast { drift_run_id: string; contours: ForecastContour[]; }
