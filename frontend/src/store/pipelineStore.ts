import { create } from "zustand";

import type { Stage } from "../components/shared/StageStepper";

interface PipelineState {
  stagesByCase: Record<string, Stage[]>;
  jobIdsByCase: Record<string, Partial<Record<"detect" | "drift" | "vessel_analysis", string>>>;
  setStages: (caseId: string, stages: Stage[]) => void;
  setJobId: (caseId: string, jobType: "detect" | "drift" | "vessel_analysis", jobId: string) => void;
}

export const createDefaultStages = (caseId?: string): Stage[] => [
  { id: "scene", label: "Scene Attached", detail: "Waiting for scene selection.", state: "pending" },
  { id: "detect", label: "Detection", detail: "Segmentation inference pending.", state: "pending" },
  { id: "drift", label: "Drift & Source", detail: "Transport model pending.", state: "pending" },
  { id: "vessels", label: "Vessel Attribution", detail: "Candidate analysis pending.", state: "pending" },
  { id: "report", label: "Report Ready", detail: "Report generation pending.", state: "pending", href: caseId ? `/cases/${caseId}/reports` : undefined }
];

export const defaultStages = createDefaultStages();

export const usePipelineStore = create<PipelineState>((set) => ({
  stagesByCase: {},
  jobIdsByCase: {},
  setStages: (caseId, stages) => set((state) => ({ stagesByCase: { ...state.stagesByCase, [caseId]: stages } })),
  setJobId: (caseId, jobType, jobId) =>
    set((state) => ({
      jobIdsByCase: {
        ...state.jobIdsByCase,
        [caseId]: { ...state.jobIdsByCase[caseId], [jobType]: jobId }
      }
    }))
}));
