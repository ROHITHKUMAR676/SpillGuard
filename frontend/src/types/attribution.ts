export interface SubScores {
  spatial: number; temporal: number; trajectory: number;
  source_probability: number; behavioural: number; ais_continuity: number;
}
export interface Vessel { id: string; mmsi?: string; name?: string; flag?: string; vessel_type?: string; }
export interface AttributionCandidate {
  id: string; case_id: string; vessel: Vessel;
  overall_score: number; sub_scores: SubScores; rank: number;
  supporting_evidence: string[]; contradicting_evidence: string[];
  model_version: string; excluded_by_analyst: boolean;
  llm_explanation?: string | null; llm_explained_at?: string | null;
}

export interface VesselEvent {
  id: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  geometry?: unknown;
  confidence?: number | null;
}

export interface AttributionEvidence extends AttributionCandidate {
  raw_features: Record<string, unknown>;
  score_breakdown: Record<string, { score: number; model_version: string }>;
  vessel_events: VesselEvent[];
}

export interface AISPosition {
  vessel_id: string;
  ts: string;
  lon: number;
  lat: number;
  sog_knots?: number | null;
  cog_deg?: number | null;
  heading_deg?: number | null;
  nav_status?: string | null;
  source: string;
  mmsi?: string;
  name?: string;
  flag?: string;
  vessel_type?: string;
}
