import type { Case } from "../types/case";
import type { Job } from "../types/job";
import { api } from "./client";

export const listCases = () => api<Case[]>("/cases");

export const createCase = (payload: Omit<Case, "id" | "status" | "created_at">) =>
  api<Case>("/cases", { method: "POST", body: JSON.stringify(payload) });

export const triggerDetect = (caseId: string) =>
  api<Job>(`/cases/${caseId}/detect`, { method: "POST", body: JSON.stringify({}) });

export const getJob = (jobId: string) => api<Job>(`/jobs/${jobId}`);
