import { useEffect, useMemo, useRef, useState } from "react";

import { createCase, createObservation, getJob, triggerDetect, triggerDrift, triggerVesselAnalysis } from "../api/cases";
import { AutomaticIngestTab } from "../components/intake/AutomaticIngestTab";
import { DragDropTab } from "../components/intake/DragDropTab";
import { TabStrip } from "../components/layout/TabStrip";
import { Button } from "../components/shared/Button";
import { ErrorState } from "../components/shared/ErrorState";
import { Stage, StageStepper } from "../components/shared/StageStepper";
import { operationalCase } from "../data/operational";
import { MapCanvas } from "../map/MapCanvas";
import { createDefaultStages, usePipelineStore } from "../store/pipelineStore";
import type { Case } from "../types/case";
import type { GeoJSONPolygon } from "../types/geo";
import type { Job } from "../types/job";

type IntakeTab = "Automatic Ingestion" | "Upload Scene";
type PipelineJobType = "detect" | "drift" | "vessel_analysis";

const intakeTabs: IntakeTab[] = ["Automatic Ingestion", "Upload Scene"];
const defaultAoi = operationalCase.aoi;

export function CaseIntake({ navigate }: { navigate: (path: string) => void }) {
  const formRef = useRef<HTMLElement | null>(null);
  const driftStartedFor = useRef("");
  const vesselStartedFor = useRef("");
  const [createdCase, setCreatedCase] = useState<Case | null>(null);
  const [tab, setTab] = useState<IntakeTab>("Automatic Ingestion");
  const [title, setTitle] = useState("Arabian Sea AOI-1");
  const [start, setStart] = useState("2026-08-20T00:00");
  const [end, setEnd] = useState("2026-08-27T00:00");
  const [creating, setCreating] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const { stagesByCase, jobIdsByCase, setStages, setJobId } = usePipelineStore();
  const activeCaseId = createdCase?.id;
  const stages = activeCaseId ? stagesByCase[activeCaseId] ?? createDefaultStages(activeCaseId) : createDefaultStages();
  const jobIds = activeCaseId ? jobIdsByCase[activeCaseId] ?? {} : {};
  const bbox = useMemo(() => polygonBbox(defaultAoi), []);

  async function handleCreateCase() {
    setIntakeError("");
    if (!title.trim()) {
      setIntakeError("Title is required before scene intake can begin.");
      return;
    }
    if (!start || !end || new Date(start) >= new Date(end)) {
      setIntakeError("Time window end must be later than time window start.");
      return;
    }
    setCreating(true);
    try {
      const nextCase = await createCase({
        title: title.trim(),
        aoi: defaultAoi,
        time_window_start: toApiDate(start),
        time_window_end: toApiDate(end)
      });
      setCreatedCase(nextCase);
      setStages(nextCase.id, createDefaultStages(nextCase.id));
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : "Case creation failed.");
    } finally {
      setCreating(false);
    }
  }

  async function attachScene(source: "automatic" | "upload", payload: Record<string, unknown>) {
    if (!activeCaseId) {
      throw new Error("Create the case before attaching a scene.");
    }
    setIntakeError("");
    await createObservation(activeCaseId, { source, ...payload });
    setStages(activeCaseId, [
      { id: "scene", label: "Scene Attached", detail: "Sentinel-1 scene attached.", state: "done", href: `/cases/${activeCaseId}/map` },
      { id: "detect", label: "Detection", detail: "Queued - segmentation inference.", state: "active" },
      { id: "drift", label: "Drift & Source", detail: "Waiting for detection output.", state: "pending" },
      { id: "vessels", label: "Vessel Attribution", detail: "Waiting for source-region output.", state: "pending" },
      { id: "report", label: "Report Ready", detail: "Waiting for candidate evidence.", state: "pending", href: `/cases/${activeCaseId}/reports` }
    ]);
    const detectJob = await triggerDetect(activeCaseId);
    setJobId(activeCaseId, "detect", detectJob.id);
    setStages(activeCaseId, stagesFromJobs(activeCaseId, { detect: detectJob }));
  }

  async function handleUseScene(sceneId: string) {
    await attachScene("automatic", { scene_id: sceneId });
  }

  async function handleUpload(file: File) {
    await attachScene("upload", { filename: file.name, size_bytes: file.size, mime_type: file.type || "application/octet-stream" });
  }

  useEffect(() => {
    if (!activeCaseId || !hasActiveJob(stages) || !Object.keys(jobIds).length) return;
    const timer = window.setInterval(async () => {
      try {
        const jobs = await pollJobs(jobIds);
        setStages(activeCaseId, stagesFromJobs(activeCaseId, jobs));
        const detect = jobs.detect;
        if (detect?.status === "succeeded" && detect.result_ref && driftStartedFor.current !== detect.id) {
          driftStartedFor.current = detect.id;
          const driftJob = await triggerDrift(activeCaseId, detect.result_ref);
          setJobId(activeCaseId, "drift", driftJob.id);
        }
        const drift = jobs.drift;
        if (drift?.status === "succeeded" && vesselStartedFor.current !== drift.id) {
          vesselStartedFor.current = drift.id;
          const vesselJob = await triggerVesselAnalysis(activeCaseId);
          setJobId(activeCaseId, "vessel_analysis", vesselJob.id);
        }
      } catch (err) {
        setIntakeError(err instanceof Error ? err.message : "Pipeline status refresh failed.");
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeCaseId, jobIds, setJobId, setStages, stages]);

  const caseReady = Boolean(activeCaseId);

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <h1 className="text-display">New Case / Data Intake</h1>
      <section ref={formRef} className="mt-6 rounded-md border border-neutral-200 bg-neutral-0 p-5">
        <h2 className="text-h2">Case metadata</h2>
        <div className="mt-4 grid grid-cols-[1fr_420px] gap-6">
          <div className="grid gap-4">
            <label className="text-body-medium">
              Title
              <input className="mt-1 h-9 w-full rounded-sm border border-neutral-300 px-3 text-body" disabled={caseReady} value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-body-medium">
                Time window start
                <input className="mt-1 h-9 w-full rounded-sm border border-neutral-300 px-3 font-mono text-mono" disabled={caseReady} value={start} type="datetime-local" onChange={(event) => setStart(event.target.value)} />
              </label>
              <label className="text-body-medium">
                Time window end
                <input className="mt-1 h-9 w-full rounded-sm border border-neutral-300 px-3 font-mono text-mono" disabled={caseReady} value={end} type="datetime-local" onChange={(event) => setEnd(event.target.value)} />
              </label>
            </div>
            <div className="text-caption text-neutral-500">
              AOI bbox <span className="font-mono text-neutral-700">{bbox}</span>
            </div>
            {createdCase && <div className="font-mono text-mono text-status-success">Case created: {createdCase.id}</div>}
            {intakeError && <ErrorState message={intakeError} />}
            <Button className="w-fit" disabled={creating || caseReady} onClick={handleCreateCase}>{creating ? "Creating..." : "Create Case"}</Button>
          </div>
          <div className="h-[320px] overflow-hidden rounded-md border border-neutral-200">
            <MapCanvas caseAoi={defaultAoi as GeoJSON.Polygon} embedded />
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-md border border-neutral-200 bg-neutral-0">
        <TabStrip tabs={intakeTabs} active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === "Automatic Ingestion" ? (
            <AutomaticIngestTab caseReady={caseReady} bbox={bbox} start={toApiDate(start)} end={toApiDate(end)} onEditCase={() => formRef.current?.scrollIntoView({ behavior: "smooth" })} onUseScene={handleUseScene} />
          ) : (
            <DragDropTab caseReady={caseReady} onUploadComplete={handleUpload} />
          )}
        </div>
      </section>
      <div className="mt-6">
        <StageStepper stages={stages} />
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" disabled={!activeCaseId} onClick={() => activeCaseId && navigate(`/cases/${activeCaseId}/map`)}>Open Case Map</Button>
      </div>
    </div>
  );
}

function toApiDate(value: string) {
  return new Date(value).toISOString();
}

function polygonBbox(polygon: GeoJSONPolygon) {
  const points = polygon.coordinates[0];
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].join(",");
}

async function pollJobs(jobIds: Partial<Record<PipelineJobType, string>>) {
  const entries = await Promise.all(
    Object.entries(jobIds).map(async ([jobType, jobId]) => [jobType, await getJob(jobId)] as const)
  );
  return Object.fromEntries(entries) as Partial<Record<PipelineJobType, Job>>;
}

function hasActiveJob(stages: Stage[]) {
  return stages.some((stage) => stage.state === "active");
}

function jobState(job?: Job): Stage["state"] {
  if (!job) return "pending";
  if (job.status === "succeeded") return "done";
  if (job.status === "failed") return "failed";
  return "active";
}

function stagesFromJobs(caseId: string, jobs: Partial<Record<PipelineJobType, Job>>): Stage[] {
  const detect = jobs.detect;
  const drift = jobs.drift;
  const vessel = jobs.vessel_analysis;
  const slickId = detect?.result_ref ?? "slick-9f3a";
  return [
    { id: "scene", label: "Scene Attached", detail: "Sentinel-1 scene attached.", state: "done", href: `/cases/${caseId}/map` },
    {
      id: "detect",
      label: "Detection",
      detail: detailFor(detect, "segmentation inference"),
      job: detect,
      state: jobState(detect),
      href: detect?.status === "succeeded" ? `/cases/${caseId}/spill/${slickId}` : undefined
    },
    {
      id: "drift",
      label: "Drift & Source",
      detail: detailFor(drift, "reconstructing source region"),
      job: drift,
      state: detect?.status === "succeeded" ? jobState(drift) : "pending",
      href: drift?.status === "succeeded" ? `/cases/${caseId}/source` : undefined
    },
    {
      id: "vessels",
      label: "Vessel Attribution",
      detail: detailFor(vessel, "candidate analysis"),
      job: vessel,
      state: drift?.status === "succeeded" ? jobState(vessel) : "pending",
      href: vessel?.status === "succeeded" ? `/cases/${caseId}/vessels` : undefined
    },
    {
      id: "report",
      label: "Report Ready",
      detail: vessel?.status === "succeeded" ? "Report generation is available." : "Waiting for candidate evidence.",
      state: "pending",
      href: `/cases/${caseId}/reports`
    }
  ];
}

function detailFor(job: Job | undefined, action: string) {
  if (!job) return "Waiting for upstream output.";
  if (job.status === "queued") return `Queued - ${action}.`;
  if (job.status === "running") return `Running - ${action}.`;
  if (job.status === "succeeded") return "Succeeded.";
  return job.error ?? "Failed.";
}
