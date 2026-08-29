import type { GeoJSONPolygon } from "./geo";

export interface Case {
  id: string;
  title: string;
  status: "open" | "reviewed" | "closed";
  aoi: GeoJSONPolygon;
  time_window_start: string;
  time_window_end: string;
  created_at: string;
}
