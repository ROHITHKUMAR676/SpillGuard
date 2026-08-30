import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Crosshair,
  FileText,
  Gauge,
  MapPinned,
  Radar,
  Route,
  Ship,
  UploadCloud
} from "lucide-react";
import { useEffect, useState } from "react";

import { DragDropTab } from "../components/intake/DragDropTab";
import { Button } from "../components/shared/Button";
import { ScoreBar } from "../components/shared/ScoreBar";
import { MapCanvas, type OperationPhase } from "../map/MapCanvas";
import type { SubScores } from "../types/attribution";

type IntakeMode = "automatic" | "upload";

interface WorkflowStage {
  id: OperationPhase;
  label: string;
  detail: string;
  metric: string;
  status: string;
}

interface RankedVessel {
  rank: number;
  name: string;
  mmsi: string;
  type: string;
  score: number;
  reason: string;
  subs: SubScores;
}

const automaticStages: WorkflowStage[] = [
  {
    id: "monitoring",
    label: "Automatic SAR ingestion",
    detail: "The system watches SAR availability over Indian maritime zones and receives the next acquisition when it is available.",
    metric: "Sentinel-1 IW GRDH",
    status: "Listening for scene"
  },
  {
    id: "eez",
    label: "India EEZ validation",
    detail: "The scene footprint is checked against India's Exclusive Economic Zone before it is accepted for analysis.",
    metric: "Footprint intersects India EEZ",
    status: "Jurisdiction in scope"
  },
  {
    id: "detection",
    label: "Oil spill detection",
    detail: "The ML model segments the slick candidate and reveals the polygon mask as a drawn outline over open Arabian Sea water.",
    metric: "Confidence 0.82",
    status: "Mask drawn"
  },
  {
    id: "hindcast",
    label: "Euler hindcast",
    detail: "Current, wind, and drift forcing animate a copy of the detected slick backward through T-12h, T-24h, and T-48h positions until it reaches the small irregular source polygon.",
    metric: "T-12h / T-24h / T-48h",
    status: "Source location saved"
  },
  {
    id: "forecast",
    label: "48 hour forecast",
    detail: "Forward drift slowly expands new copies from the slick polygon, showing how far the surface oil could spread over the next 48 hours.",
    metric: "12/24/36/48 hour intervals",
    status: "48 hour spread projected"
  },
  {
    id: "ais",
    label: "AIS correlation",
    detail: "Vessel tracks inside the offshore hindcast source window are compared for spatial, temporal, speed, loitering, and continuity anomalies.",
    metric: "5 vessel tracks scanned",
    status: "Candidates shortlisted"
  },
  {
    id: "ranking",
    label: "Transparent suspect ranking",
    detail: "The LLM explains the ordered vessel leads using the same metrics shown to the investigator.",
    metric: "Top 3 vessel leads",
    status: "Explanation ready"
  }
];

const uploadStages = automaticStages.filter((stage) => stage.id !== "monitoring" && stage.id !== "eez");

const rankedVessels: RankedVessel[] = [
  {
    rank: 1,
    name: "MV Samudra Prerna",
    mmsi: "419000111",
    type: "Tanker",
    score: 78,
    reason: "Highest overlap with the source-region window, strong release-time consistency, and a low-speed segment near the reconstructed origin.",
    subs: { spatial: 70, temporal: 72, trajectory: 68, source_probability: 71, behavioural: 58, ais_continuity: 92 }
  },
  {
    rank: 2,
    name: "MV Konkan Carrier",
    mmsi: "419000222",
    type: "Cargo",
    score: 61,
    reason: "Track intersects the outer source contour, but timing is weaker and the trajectory only partially follows the hindcast drift window.",
    subs: { spatial: 53, temporal: 55, trajectory: 51, source_probability: 54, behavioural: 41, ais_continuity: 88 }
  },
  {
    rank: 3,
    name: "MT Dakshin Star",
    mmsi: "419000333",
    type: "Product carrier",
    score: 57,
    reason: "Nearby vessel with acceptable AIS continuity, but lower behavioural anomaly and weaker source-probability match.",
    subs: { spatial: 49, temporal: 58, trajectory: 47, source_probability: 50, behavioural: 36, ais_continuity: 82 }
  }
];

export function OperationalConsole() {
  const [mode, setMode] = useState<IntakeMode>("automatic");
  const [activeIndex, setActiveIndex] = useState(0);
  const [highestCompletedIndex, setHighestCompletedIndex] = useState(0);
  const [running, setRunning] = useState(true);
  const stages = mode === "automatic" ? automaticStages : uploadStages;
  const activeStage = stages[activeIndex];
  const sequenceComplete = highestCompletedIndex >= stages.length - 1 && !running;
  const completedProgress = Math.round(((highestCompletedIndex + 1) / stages.length) * 100);

  useEffect(() => {
    if (!running || activeIndex >= stages.length - 1) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        const next = Math.min(current + 1, stages.length - 1);
        setHighestCompletedIndex((completed) => Math.max(completed, next));
        if (next === stages.length - 1) setRunning(false);
        return next;
      });
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [activeIndex, running, stages.length]);

  async function startUpload() {
    setMode("upload");
    setActiveIndex(0);
    setHighestCompletedIndex(0);
    setRunning(true);
  }

  function selectMode(nextMode: IntakeMode) {
    setMode(nextMode);
    setActiveIndex(0);
    setHighestCompletedIndex(0);
    setRunning(nextMode === "automatic");
  }

  function advance() {
    setRunning(false);
    setActiveIndex((current) => {
      const next = Math.min(current + 1, stages.length - 1);
      setHighestCompletedIndex((completed) => Math.max(completed, next));
      return next;
    });
  }

  function rewind() {
    setRunning(false);
    setActiveIndex((current) => Math.max(current - 1, 0));
  }

  function resume() {
    if (activeIndex >= stages.length - 1) return;
    setRunning(true);
  }

  function replayFromStart() {
    setActiveIndex(0);
    setHighestCompletedIndex(0);
    setRunning(true);
  }

  return (
    <main className="grid min-h-[calc(100vh-56px)] grid-cols-[360px_minmax(560px,1fr)_380px] bg-neutral-100">
      <aside className="border-r border-neutral-200 bg-neutral-0 p-5">
        <header>
          <p className="text-caption uppercase text-neutral-500">SpillGuard / Case ARB-2026-014</p>
          <h1 className="mt-1 text-display text-neutral-900">Maritime Spill Attribution Console</h1>
          <p className="mt-3 text-body text-neutral-700">
            Automated SAR intake, slick detection, Euler drift reconstruction, AIS correlation, and vessel-lead ranking for investigator review.
          </p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-2" aria-label="Scene input mode">
          <ModeButton active={mode === "automatic"} icon={<Radar size={17} />} label="Automatic ingestion" onClick={() => selectMode("automatic")} />
          <ModeButton active={mode === "upload"} icon={<UploadCloud size={17} />} label="Upload scene" onClick={() => selectMode("upload")} />
        </section>

        <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4 shadow-elevation-1">
          {mode === "automatic" ? (
            <>
              <div className="flex items-center gap-2 text-body-medium text-neutral-900">
                <Radar size={18} /> SAR scene watch
              </div>
              <AutomatedSceneStatus activeStage={activeStage} activeIndex={activeIndex} complete={activeIndex === stages.length - 1} />
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-body-medium text-neutral-900">
                <UploadCloud size={18} /> SAR scene upload
              </div>
              <p className="mb-3 text-caption text-neutral-600">Uploaded scenes enter directly at oil spill detection and follow the same analysis chain.</p>
              <DragDropTab caseReady onUploadComplete={startUpload} />
            </>
          )}
        </section>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-caption uppercase text-neutral-500">Workflow</p>
            <h2 className="text-h3 text-neutral-900">{sequenceComplete ? "Manual review mode" : "Automated run"}</h2>
          </div>
          <span className="font-mono text-caption text-neutral-500">{completedProgress}%</span>
        </div>

        <ol className="mt-3 space-y-2">
          {stages.map((stage, index) => (
            <li key={stage.id}>
              <button
                className={`w-full rounded-md border p-3 text-left shadow-sm transition-none ${
                  index === activeIndex
                    ? "border-navy-500 bg-navy-50 ring-1 ring-navy-500"
                    : index <= highestCompletedIndex
                      ? "border-status-success bg-status-success-bg"
                      : "border-neutral-200 bg-neutral-0"
                }`}
                onClick={() => {
                  setActiveIndex(index);
                  setRunning(false);
                }}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-caption ${
                    index <= highestCompletedIndex && index !== activeIndex
                      ? "bg-status-success text-white"
                      : index === activeIndex && running
                        ? "bg-navy-500 text-white"
                        : "border border-neutral-300 text-neutral-500"
                  }`}>
                    {index < activeIndex ? <Check size={14} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-body-medium text-neutral-900">{iconFor(stage.id)} {stage.label}</span>
                    <span className="mt-1 block text-caption text-neutral-500">{stage.status}</span>
                    <span className="mt-2 block font-mono text-caption text-neutral-700">{stage.metric}</span>
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="relative min-w-0 border-x border-neutral-200 bg-neutral-100">
        <MapCanvas phase={activeStage.id} />
      </section>

      <aside className="border-l border-neutral-200 bg-neutral-0 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-caption uppercase text-neutral-500">Current stage</p>
            <h2 className="mt-1 text-h2 text-neutral-900">{activeStage.label}</h2>
          </div>
          <span className={`rounded-full px-2 py-1 font-mono text-caption ${sequenceComplete ? "bg-status-success-bg text-status-success" : "bg-status-running-bg text-status-running"}`}>
            {sequenceComplete ? "READY" : `${completedProgress}%`}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`flex items-center gap-2 text-caption ${running ? "text-status-running" : "text-neutral-500"}`}>
            <span className={`h-2 w-2 rounded-full ${running ? "bg-status-running pulse-dot" : "bg-neutral-300"}`} />
            {running ? "Auto-playing pipeline" : sequenceComplete ? "Automation complete - manual stage review" : `Paused on stage ${activeIndex + 1}`}
          </span>
          {!running && (
            activeIndex === stages.length - 1
              ? <button className="text-caption font-medium text-navy-500 underline" onClick={replayFromStart}>Replay from start</button>
              : <button className="text-caption font-medium text-navy-500 underline" onClick={resume}>Resume auto-play</button>
          )}
        </div>

        <section className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4 shadow-elevation-1">
          <div className="flex items-center gap-2 text-body-medium text-neutral-900">{iconFor(activeStage.id)} {activeStage.status}</div>
          <p className="mt-2 text-body text-neutral-700">{activeStage.detail}</p>
          <div className="mt-4 h-2 rounded-full bg-neutral-200">
            <div className="h-2 rounded-full bg-navy-500" style={{ width: `${completedProgress}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={activeIndex === 0} onClick={rewind}>Previous</Button>
            <Button disabled={activeIndex === stages.length - 1} onClick={advance}>Next stage</Button>
          </div>
        </section>

        {(activeStage.id === "hindcast" || activeStage.id === "forecast") && <DriftCallout phase={activeStage.id} />}

        <StageFacts phase={activeStage.id} mode={mode} />

        {(activeStage.id === "ais" || activeStage.id === "ranking") && (
          <section className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-h3 text-neutral-900">Top 3 Vessel Leads</h3>
              <span className="text-caption text-status-error">High attention</span>
            </div>
            <div className="mt-3 grid gap-3">
              {rankedVessels.map((vessel) => (
                <article className="rounded-md border border-neutral-200 bg-neutral-0 p-3" key={vessel.mmsi}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full border border-status-error text-status-error">
                      <Ship size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-mono text-neutral-900">#{vessel.rank} MMSI {vessel.mmsi}</span>
                        <span className="text-caption text-neutral-500">{vessel.type}</span>
                      </div>
                      <div className="mt-1 text-body-medium text-neutral-900">{vessel.name}</div>
                      <p className="mt-1 text-caption text-neutral-600">{vessel.reason}</p>
                    </div>
                  </div>
                  {activeStage.id === "ranking" && <div className="mt-3"><ScoreBar scores={vessel.subs} overall={vessel.score} /></div>}
                </article>
              ))}
            </div>
          </section>
        )}
      </aside>
    </main>
  );
}

function DriftCallout({ phase }: { phase: OperationPhase }) {
  const isForecast = phase === "forecast";
  return (
    <section className={`mt-5 rounded-md border p-4 ${isForecast ? "border-[#EA580C] bg-[#FFF7ED]" : "border-[#2563EB] bg-[#EFF6FF]"}`}>
      <h3 className="text-h3 text-neutral-900">{isForecast ? "Forecast stays layered over hindcast" : "Euler hindcast reconstruction"}</h3>
      <p className="mt-2 text-caption text-neutral-700">
        {isForecast
          ? "Forward copies expand from the detected slick at +12h, +24h, +36h, and +48h. Hover the spread envelopes to inspect each interval."
          : "A copy of the detected slick moves backward through T-12h, T-24h, and T-48h positions, shrinking into the probable offshore source polygon."}
      </p>
    </section>
  );
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-left text-caption ${
        active ? "border-navy-500 bg-navy-50 text-navy-900" : "border-neutral-200 bg-neutral-0 text-neutral-700"
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {active && <ChevronRight className="ml-auto" size={16} />}
    </button>
  );
}

function AutomatedSceneStatus({ activeStage, activeIndex, complete }: { activeStage: WorkflowStage; activeIndex: number; complete: boolean }) {
  const queue = [
    { id: "S1C_20260824T142210", result: complete ? "Ranked lead ready" : activeStage.status, tone: complete ? "error" : "running" },
    { id: "S1C_20260824T101505", result: "Outside India EEZ", tone: "neutral" },
    { id: "S1A_20260823T231040", result: "No oil slick detected", tone: "neutral" }
  ];

  return (
    <div className="mt-3">
      <dl className="space-y-2 text-caption">
        <FactLine label="Maritime window" value="India EEZ" />
        <FactLine label="Current scene" value="S1C_20260824T142210" />
        <FactLine label="Scene time" value="24 Aug 2026 14:22 IST" />
        <FactLine label="Running stage" value={complete ? "Ranking complete" : `${activeIndex + 1}. ${activeStage.label}`} />
      </dl>
      <div className="mt-3 space-y-2">
        {queue.map((scene, index) => (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-neutral-200 bg-neutral-0 px-3 py-2 text-caption" key={scene.id}>
            <span className="font-mono text-neutral-700">{scene.id}</span>
            <span className={scene.tone === "error" ? "font-medium text-status-error" : scene.tone === "running" ? "text-status-running" : "text-neutral-500"}>
              {scene.result}
            </span>
            {index === 0 && !complete && <span className="h-2 w-2 rounded-full bg-status-running" />}
          </div>
        ))}
      </div>
      {complete && (
        <div className="mt-3 rounded-sm border border-status-error bg-status-error-bg px-3 py-2 text-caption">
          <div className="font-medium text-status-error">Suspect 1: MV Samudra Prerna</div>
          <div className="mt-1 font-mono text-neutral-700">MMSI 419000111 - score 78</div>
        </div>
      )}
    </div>
  );
}

function StageFacts({ phase, mode }: { phase: OperationPhase; mode: IntakeMode }) {
  const facts: Record<OperationPhase, Array<[string, string]>> = {
    monitoring: [["Input", "Automatic SAR feed"], ["Sensor", "Sentinel-1"], ["Polling state", "Ready for acquisition"]],
    eez: [["Jurisdiction", "India EEZ"], ["Validation", "Footprint-coordinate intersection"], ["Decision", "Forward to ML detection"]],
    detection: [["Slick area", "142.4 km2"], ["Perimeter", "52.1 km"], ["Centroid", "68.940,16.180"], ["Mask confidence", "0.82"]],
    hindcast: [["Model", "Euler drift"], ["Forcing", "Ocean currents + wind"], ["Source region", "67.47,15.34 to 67.86,15.82"], ["Backtrack", "T-12h, T-24h, T-48h"]],
    forecast: [["Horizon", "48 hours"], ["Intervals", "+12h, +24h, +36h, +48h"], ["Use", "Response and monitoring priority"]],
    ais: [["AIS window", "Hindcast release interval"], ["Scanned vessels", "5"], ["Shown as suspects", "Top 3 only in ranking"], ["Anomalies", "Speed, loitering, timing"]],
    ranking: [["Model", "Attribution LLM"], ["Score inputs", "Spatial, temporal, trajectory, behaviour, source, AIS continuity"], ["Output", "Ranked investigative leads"]]
  };
  const visibleFacts = mode === "upload" && phase === "detection" ? [["Input", "Uploaded SAR scene"], ...facts.detection] : facts[phase];

  return (
    <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="text-h3 text-neutral-900">Transparent Metrics</h3>
      <dl className="mt-3 space-y-2">
        {visibleFacts.map(([label, value]) => (
          <FactLine key={label} label={label} value={value} />
        ))}
      </dl>
      {phase === "ranking" && (
        <div className="mt-3 rounded-sm border border-status-running bg-status-running-bg p-2 text-caption text-neutral-700">
          Rankings are investigative leads based on measured consistency and require investigator review.
        </div>
      )}
    </section>
  );
}

function FactLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-caption">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-mono text-neutral-900">{value}</dd>
    </div>
  );
}

function iconFor(phase: OperationPhase) {
  if (phase === "monitoring") return <Radar size={18} />;
  if (phase === "eez") return <Crosshair size={18} />;
  if (phase === "detection") return <AlertTriangle size={18} />;
  if (phase === "hindcast") return <Route size={18} />;
  if (phase === "forecast") return <Clock size={18} />;
  if (phase === "ais") return <MapPinned size={18} />;
  if (phase === "ranking") return <Gauge size={18} />;
  return <FileText size={18} />;
}
