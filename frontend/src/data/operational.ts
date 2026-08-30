import type { AttributionCandidate } from "../types/attribution";
import type { Case } from "../types/case";
import type { ForwardForecast, SourceHypothesis } from "../types/drift";
import type { OilSlick } from "../types/slick";

export const operationalCase: Case = {
  id: "ARB-2026-014",
  title: "Arabian Sea AOI-1",
  status: "open",
  aoi: { type: "Polygon", coordinates: [[[67.25, 15.05], [70.55, 15.05], [70.55, 17.35], [67.25, 17.35], [67.25, 15.05]]] },
  time_window_start: "2026-08-20T00:00:00Z",
  time_window_end: "2026-08-27T00:00:00Z",
  created_at: "2026-08-29T10:30:00Z"
};

export const operationalCases: Case[] = [
  operationalCase,
  { ...operationalCase, id: "LKP-2026-006", title: "Lakshadweep Channel Review", status: "reviewed", created_at: "2026-08-28T14:10:00Z" },
  { ...operationalCase, id: "MUM-2026-021", title: "Mumbai Offshore Slick Review", status: "closed", created_at: "2026-08-25T08:20:00Z" }
];

export const operationalSlick: OilSlick = {
  id: "slick-9f3a",
  scene_id: "scene-s1c-operational",
  geometry: { type: "MultiPolygon", coordinates: [[[[68.886968, 16.147162], [68.921946, 16.115681], [68.984907, 16.126175], [69.023383, 16.164651], [68.9954, 16.21362], [68.93244, 16.231109], [68.883471, 16.199629], [68.862484, 16.168148], [68.886968, 16.147162]]]] },
  area_km2: 142.4,
  perimeter_km: 52.1,
  centroid: { type: "Point", coordinates: [68.9445, 16.1725] },
  orientation_deg: 42,
  confidence: 0.82,
  possible_lookalike: false,
  lookalike_reason: undefined,
  model_version: "oil-seg-v1.0"
};

export const operationalSource: SourceHypothesis = {
  id: "source-hypothesis-operational",
  drift_run_id: "drift-run-operational",
  probable_source_region: { type: "Polygon", coordinates: [[[67.54, 15.43], [67.66, 15.34], [67.82, 15.42], [67.86, 15.58], [67.71, 15.68], [67.55, 15.62], [67.47, 15.51], [67.54, 15.43]]] },
  time_window_start: "2026-08-24T06:00:00Z",
  time_window_end: "2026-08-25T18:00:00Z",
  confidence: "medium",
  drift_corridor_bearing_deg: 62.5
};

export const operationalForecast: ForwardForecast = {
  drift_run_id: "drift-run-operational",
  contours: [50, 80, 95].map((percentile) => ({
    horizon_hours: 48,
    percentile: percentile as 50 | 80 | 95,
    polygon: { type: "Polygon", coordinates: [[[68.83, 16.02], [69.62, 15.9], [70.27, 16.34], [70.1, 17.03], [69.46, 17.26], [68.68, 16.82], [68.42, 16.26], [68.83, 16.02]]] }
  }))
};

export const operationalCandidates: AttributionCandidate[] = [
  {
    id: "cand-7",
    case_id: operationalCase.id,
    vessel: { id: "ves-1", mmsi: "419000111", name: "MV Samudra Prerna", flag: "IN", vessel_type: "tanker" },
    overall_score: 78,
    sub_scores: { spatial: 70, temporal: 72, trajectory: 68, source_probability: 71, behavioural: 58, ais_continuity: 92 },
    rank: 1,
    supporting_evidence: [
      "AIS track overlaps the reconstructed source-region window.",
      "Course history is consistent with transport-model timing."
    ],
    contradicting_evidence: ["AIS source is labelled separately from other evidence layers."],
    model_version: "attribution-v1-deterministic",
    excluded_by_analyst: false
  },
  {
    id: "cand-8",
    case_id: operationalCase.id,
    vessel: { id: "ves-2", mmsi: "419000222", name: "MV Konkan Carrier", flag: "IN", vessel_type: "cargo" },
    overall_score: 61,
    sub_scores: { spatial: 53, temporal: 55, trajectory: 51, source_probability: 54, behavioural: 41, ais_continuity: 88 },
    rank: 2,
    supporting_evidence: ["AIS track intersects the outer source-region contour."],
    contradicting_evidence: ["Track timing is less consistent with the reconstructed release window."],
    model_version: "attribution-v1-deterministic",
    excluded_by_analyst: false
  },
  {
    id: "cand-9",
    case_id: operationalCase.id,
    vessel: { id: "ves-3", mmsi: "419000333", name: "MT Dakshin Star", flag: "IN", vessel_type: "product carrier" },
    overall_score: 57,
    sub_scores: { spatial: 49, temporal: 58, trajectory: 47, source_probability: 50, behavioural: 36, ais_continuity: 82 },
    rank: 3,
    supporting_evidence: ["AIS track passes near the reconstructed source-region window."],
    contradicting_evidence: ["Behavioural anomaly score is lower than the top-ranked vessel."],
    model_version: "attribution-v1-deterministic",
    excluded_by_analyst: false
  }
];
