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
}
