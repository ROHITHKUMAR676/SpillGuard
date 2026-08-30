import type { Case, RecentCase, SyntheticBatch } from "../types/case";
import type { AISPosition, AttributionCandidate, AttributionEvidence } from "../types/attribution";
import type { ForwardForecast, SourceHypothesis } from "../types/drift";
import type { GeoJSONPolygon } from "../types/geo";
import type { Job } from "../types/job";
import type { OilSlick } from "../types/slick";
import { api } from "./client";

export interface SceneSearchResult {
  id: string;
  case_id?: string;
  sensor: string;
  acquisition_time: string;
  footprint: GeoJSONPolygon;
  polarization?: string;
  local_object_key?: string;
  checksum?: string;
  created_at?: string;
}

export const listCases = () => api<Case[]>("/cases");

export const listRecentCases = (limit = 20) => api<RecentCase[]>(`/cases/recent?limit=${limit}`);

export const listRecentSyntheticBatches = (limit = 1) => api<SyntheticBatch[]>(`/synthetic-ingestion/batches/recent?limit=${limit}`);

export const getCase = (caseId: string) => api<Case>(`/cases/${caseId}`);

export const createCase = (payload: Omit<Case, "id" | "status" | "created_at">) =>
  api<Case>("/cases", { method: "POST", body: JSON.stringify(payload) });

export const searchScenes = (bbox: string, start: string, end: string) =>
  api<SceneSearchResult[]>(`/scenes/search?bbox=${encodeURIComponent(bbox)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);

export const createObservation = (caseId: string, payload: Record<string, unknown>) =>
  api<{ ok: boolean }>(`/cases/${caseId}/observations`, { method: "POST", body: JSON.stringify({ payload }) });

export const triggerDetect = (caseId: string, sceneId?: string) =>
  api<Job>(`/cases/${caseId}/detect`, { method: "POST", body: JSON.stringify({ scene_id: sceneId }) });

export const triggerDrift = (caseId: string, slickId: string) =>
  api<Job>(`/cases/${caseId}/drift`, {
    method: "POST",
    body: JSON.stringify({ slick_id: slickId, backward_hours: 48, forward_hours: 72, ensemble_size: 20 })
  });

export const triggerVesselAnalysis = (caseId: string) =>
  api<Job>(`/cases/${caseId}/vessel-analysis`, { method: "POST", body: JSON.stringify({}) });

export const getJob = (jobId: string) => api<Job>(`/jobs/${jobId}`);

export const getSlick = (slickId: string) => api<OilSlick>(`/slicks/${slickId}`);

export const getLatestSlick = (caseId: string) => api<OilSlick>(`/cases/${caseId}/slicks/latest`);

export const getSourceHypothesis = (caseId: string) => api<SourceHypothesis>(`/cases/${caseId}/source-hypothesis`);

export const getForecast = (caseId: string) => api<ForwardForecast>(`/cases/${caseId}/forecast`);

export const getVessels = (bbox: string, start: string, end: string) =>
  api<AISPosition[]>(`/vessels?bbox=${encodeURIComponent(bbox)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);

export const getCandidates = (caseId: string) => api<AttributionCandidate[]>(`/cases/${caseId}/candidates`);

export const getCandidateEvidence = (caseId: string, vesselId: string) =>
  api<AttributionEvidence>(`/cases/${caseId}/candidates/${vesselId}/evidence`);

export const explainCandidate = (caseId: string, vesselId: string) =>
  api<{ explanation: string }>(`/cases/${caseId}/candidates/${vesselId}/explanation`, { method: "POST", body: JSON.stringify({}) });

export const askInvestigator = (caseId: string, question: string, vesselId?: string) =>
  api<{ answer: string }>(
    `/cases/${caseId}/investigator/ask`,
    { method: "POST", body: JSON.stringify({ question, vessel_id: vesselId }) }
  );
