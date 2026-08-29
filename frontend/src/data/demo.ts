import type { AttributionCandidate } from "../types/attribution";
import type { Case } from "../types/case";
import type { ForwardForecast, SourceHypothesis } from "../types/drift";
import type { OilSlick } from "../types/slick";

export const demoCase: Case = {
  id: "ARB-2026-014",
  title: "Arabian Sea AOI-1",
  status: "open",
  aoi: { type: "Polygon", coordinates: [[[72.6, 18.5], [73.5, 18.5], [73.5, 19.3], [72.6, 19.3], [72.6, 18.5]]] },
  time_window_start: "2026-08-20T00:00:00Z",
  time_window_end: "2026-08-27T00:00:00Z",
  created_at: "2026-08-29T10:30:00Z"
};

export const demoCases: Case[] = [
  demoCase,
  { ...demoCase, id: "LKP-2026-006", title: "Lakshadweep Channel Review", status: "reviewed", created_at: "2026-08-28T14:10:00Z" },
  { ...demoCase, id: "MUM-2026-021", title: "Mumbai Offshore Slick Review", status: "closed", created_at: "2026-08-25T08:20:00Z" }
];

export const demoSlick: OilSlick = {
  id: "slick-9f3a",
  scene_id: "scene-s1c-demo",
  geometry: { type: "MultiPolygon", coordinates: [[[[72.95, 18.85], [73.14, 18.85], [73.14, 18.98], [72.95, 18.98], [72.95, 18.85]]]] },
  area_km2: 142.4,
  perimeter_km: 52.1,
  centroid: { type: "Point", coordinates: [73.045, 18.915] },
  orientation_deg: 42,
  confidence: 0.82,
  possible_lookalike: false,
  lookalike_reason: undefined,
  model_version: "oil-seg-v1.0-demo"
};

export const demoSource: SourceHypothesis = {
  id: "source-hypothesis-demo",
  drift_run_id: "drift-run-demo",
  probable_source_region: { type: "Polygon", coordinates: [[[72.72, 18.68], [72.92, 18.68], [72.92, 18.88], [72.72, 18.88], [72.72, 18.68]]] },
  time_window_start: "2026-08-24T06:00:00Z",
  time_window_end: "2026-08-25T18:00:00Z",
  confidence: "medium"
};

export const demoForecast: ForwardForecast = {
  drift_run_id: "drift-run-demo",
  contours: [50, 80, 95].map((percentile) => ({
    horizon_hours: 72,
    percentile: percentile as 50 | 80 | 95,
    polygon: { type: "Polygon", coordinates: [[[72.86, 18.72], [73.38, 18.72], [73.38, 19.22], [72.86, 19.22], [72.86, 18.72]]] }
  }))
};

export const demoCandidates: AttributionCandidate[] = [
  {
    id: "cand-7",
    case_id: demoCase.id,
    vessel: { id: "ves-1", mmsi: "419000111", name: "Synthetic Lead One", flag: "IN", vessel_type: "tanker" },
    overall_score: 78,
    sub_scores: { spatial: 70, temporal: 72, trajectory: 68, source_probability: 71, behavioural: 58, ais_continuity: 92 },
    rank: 1,
    supporting_evidence: [
      "Synthetic AIS track overlaps the reconstructed source-region window.",
      "Course history is consistent with transport-model timing."
    ],
    contradicting_evidence: ["AIS in this build is synthetic and for demonstration only."],
    model_version: "attribution-v1-deterministic",
    excluded_by_analyst: false
  },
  {
    id: "cand-8",
    case_id: demoCase.id,
    vessel: { id: "ves-2", mmsi: "419000222", name: "Synthetic Comparison Two", flag: "IN", vessel_type: "cargo" },
    overall_score: 61,
    sub_scores: { spatial: 53, temporal: 55, trajectory: 51, source_probability: 54, behavioural: 41, ais_continuity: 88 },
    rank: 2,
    supporting_evidence: ["Synthetic AIS track intersects the outer source-region contour."],
    contradicting_evidence: ["Track timing is less consistent with the reconstructed release window."],
    model_version: "attribution-v1-deterministic",
    excluded_by_analyst: false
  }
];
