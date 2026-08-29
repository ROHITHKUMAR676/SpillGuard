import type { Case } from "../types/case";
import type { GeoJSONPolygon } from "../types/geo";
import type { Job } from "../types/job";
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
