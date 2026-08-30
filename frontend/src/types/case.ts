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

export interface RecentCase extends Case {
  latest_slick_id?: string | null;
  latest_source_id?: string | null;
  latest_batch_id?: string | null;
  latest_batch_status?: string | null;
  candidate_count: number;
  top_score?: number | null;
}

export interface SyntheticBatchStage {
  case_id: string;
  stage: string;
  status: "queued" | "running" | "succeeded" | "failed";
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
}

export interface SyntheticBatch {
  id: string;
  status: "running" | "succeeded" | "partial_failed" | "failed";
  case_count: number;
  started_at: string;
  completed_at?: string | null;
  error?: string | null;
  stages: SyntheticBatchStage[];
}
