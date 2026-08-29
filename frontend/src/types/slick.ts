import type { GeoJSONMultiPolygon, GeoJSONPoint } from "./geo";

export interface OilSlick {
  id: string;
  scene_id: string;
  geometry: GeoJSONMultiPolygon;
  area_km2: number;
  perimeter_km: number;
  centroid: GeoJSONPoint;
  orientation_deg?: number;
  confidence: number;
  possible_lookalike: boolean;
  lookalike_reason?: string;
  model_version: string;
}
