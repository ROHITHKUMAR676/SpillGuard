import type { GeoJSONMultiPolygon, GeoJSONPoint } from "./geo";

export interface OilSlick {
  id: string;
  event_id?: string;
  scene_id: string;
  acquisition_timestamp?: string;
  processing_timestamp?: string;
  source?: string;
  geometry: GeoJSONMultiPolygon;
  crs?: string;
  bbox?: number[];
  area_km2: number;
  perimeter_km: number;
  centroid: GeoJSONPoint;
  orientation_deg?: number;
  confidence: number;
  possible_lookalike: boolean;
  lookalike_reason?: string;
  model_version: string;
  v4_threshold?: number;
  v3_threshold?: number;
  candidate_count?: number;
  accepted_candidates?: number;
  source_width?: number;
  source_height?: number;
  created_at?: string;
}
