import type { AttributionCandidate } from "../types/attribution";
import type { Case } from "../types/case";
import type { ForwardForecast, SourceHypothesis } from "../types/drift";
import type { OilSlick } from "../types/slick";

export const operationalCase: Case = {
  id: "ARB-2026-014",
  title: "Arabian Sea AOI-1",
  status: "open",
  aoi: { type: "Polygon", coordinates: [[[67.75, 15.28], [69.65, 15.28], [69.65, 16.92], [67.75, 16.92], [67.75, 15.28]]] },
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
  geometry: { type: "MultiPolygon", coordinates: [[[[68.78, 16.1], [68.88, 16.01], [69.06, 16.04], [69.17, 16.15], [69.09, 16.29], [68.91, 16.34], [68.77, 16.25], [68.71, 16.16], [68.78, 16.1]]]] },
  area_km2: 142.4,
  perimeter_km: 52.1,
  centroid: { type: "Point", coordinates: [68.94, 16.18] },
  orientation_deg: 42,
  confidence: 0.82,
  possible_lookalike: false,
  lookalike_reason: undefined,
  model_version: "oil-seg-v1.0"
};

export const operationalSource: SourceHypothesis = {
  id: "source-hypothesis-operational",
  drift_run_id: "drift-run-operational",
  probable_source_region: { type: "Polygon", coordinates: [[[68.02, 15.64], [68.12, 15.57], [68.25, 15.62], [68.28, 15.74], [68.17, 15.82], [68.04, 15.77], [67.98, 15.69], [68.02, 15.64]]] },
  time_window_start: "2026-08-24T06:00:00Z",
  time_window_end: "2026-08-25T18:00:00Z",
  confidence: "medium"
};

export const operationalForecast: ForwardForecast = {
  drift_run_id: "drift-run-operational",
  contours: [50, 80, 95].map((percentile) => ({
    horizon_hours: 48,
    percentile: percentile as 50 | 80 | 95,
    polygon: { type: "Polygon", coordinates: [[[68.76, 16.02], [69.23, 15.93], [69.63, 16.22], [69.52, 16.65], [69.14, 16.88], [68.59, 16.65], [68.42, 16.25], [68.76, 16.02]]] }
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
