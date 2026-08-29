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
import { useEffect, useMemo, useState } from "react";

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
    detail: "The ML model segments the slick candidate and publishes a polygon mask with area, perimeter, and centroid.",
    metric: "Confidence 0.82",
    status: "Mask generated"
  },
  {
    id: "hindcast",
    label: "Euler hindcast",
    detail: "Current, wind, and drift forcing contract the slick envelope back toward the probable source region and release time.",
    metric: "24 Aug 06:00-25 Aug 18:00",
    status: "Source window reconstructed"
  },
  {
    id: "forecast",
    label: "48 hour forecast",
    detail: "Forward drift spreads the slick envelope for the next 48 hours so response teams can prioritize monitoring.",
    metric: "50/80/95 contour bands",
    status: "Spread envelope projected"
  },
  {
    id: "ais",
    label: "AIS correlation",
    detail: "Vessel tracks inside the hindcast source window are compared for spatial, temporal, speed, loitering, and continuity anomalies.",
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
  const [running, setRunning] = useState(true);
  const stages = mode === "automatic" ? automaticStages : uploadStages;
  const activeStage = stages[activeIndex];
  const progress = useMemo(() => Math.round(((activeIndex + 1) / stages.length) * 100), [activeIndex, stages.length]);

  useEffect(() => {
    if (mode !== "automatic" || !running || activeIndex >= stages.length - 1) return;
    const timer = window.setTimeout(() => setActiveIndex((current) => Math.min(current + 1, stages.length - 1)), 4200);
    return () => window.clearTimeout(timer);
  }, [activeIndex, mode, running, stages.length]);

  async function startUpload() {
    setMode("upload");
    setActiveIndex(0);
    setRunning(true);
  }

  function selectMode(nextMode: IntakeMode) {
    setMode(nextMode);
    setActiveIndex(0);
    setRunning(nextMode === "automatic");
  }

  function advance() {
    setRunning(true);
    setActiveIndex((current) => Math.min(current + 1, stages.length - 1));
  }

  function rewind() {
    setActiveIndex((current) => Math.max(current - 1, 0));
  }

  return (
    <main className="grid min-h-[calc(100vh-56px)] grid-cols-[380px_minmax(520px,1fr)_400px] bg-neutral-50">
      <aside className="border-r border-neutral-200 bg-neutral-0 p-5">
        <header>
          <p className="text-caption uppercase text-neutral-500">SpillGuard</p>
          <h1 className="mt-1 text-display text-neutral-900">Maritime Spill Attribution Console</h1>
          <p className="mt-3 text-body text-neutral-700">
            Automated SAR intake, oil detection, drift reconstruction, AIS correlation, and transparent vessel-lead ranking for investigator review.
          </p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-2" aria-label="Scene input mode">
          <ModeButton active={mode === "automatic"} icon={<Radar size={17} />} label="Automatic ingestion" onClick={() => selectMode("automatic")} />
          <ModeButton active={mode === "upload"} icon={<UploadCloud size={17} />} label="Upload scene" onClick={() => selectMode("upload")} />
        </section>

        <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
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

        <ol className="mt-5 space-y-2">
          {stages.map((stage, index) => (
            <li key={stage.id}>
              <button
                className={`w-full rounded-md border p-3 text-left transition-none ${
                  index === activeIndex
                    ? "border-navy-500 bg-navy-50"
                    : index < activeIndex
                      ? "border-status-success bg-status-success-bg"
                      : "border-neutral-200 bg-neutral-0"
                }`}
                onClick={() => {
                  setActiveIndex(index);
                  setRunning(true);
                }}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-caption ${
                    index < activeIndex
                      ? "bg-status-success text-white"
                      : index === activeIndex && running
                        ? "bg-navy-500 text-white"
                        : "border border-neutral-300 text-neutral-500"
                  }`}>
                    {index < activeIndex ? <Check size={14} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body-medium text-neutral-900">{stage.label}</span>
                    <span className="mt-1 block text-caption text-neutral-500">{stage.status}</span>
                    <span className="mt-2 block font-mono text-caption text-neutral-700">{stage.metric}</span>
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="relative min-w-0">
        <MapCanvas phase={activeStage.id} />
      </section>

      <aside className="border-l border-neutral-200 bg-neutral-0 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-caption uppercase text-neutral-500">Current stage</p>
            <h2 className="mt-1 text-h2 text-neutral-900">{activeStage.label}</h2>
          </div>
          <span className="font-mono text-caption text-neutral-500">{progress}%</span>
        </div>

        <section className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex items-center gap-2 text-body-medium text-neutral-900">{iconFor(activeStage.id)} {activeStage.status}</div>
          <p className="mt-2 text-body text-neutral-700">{activeStage.detail}</p>
          <div className="mt-4 h-2 rounded-full bg-neutral-200">
            <div className="h-2 rounded-full bg-navy-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={activeIndex === 0} onClick={rewind}>Previous</Button>
            <Button disabled={activeIndex === stages.length - 1} onClick={advance}>Next stage</Button>
          </div>
        </section>

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
    detection: [["Slick area", "142.4 km2"], ["Perimeter", "52.1 km"], ["Centroid", "73.045,18.915"], ["Mask confidence", "0.82"]],
    hindcast: [["Model", "Euler drift"], ["Forcing", "Ocean currents + wind"], ["Source region", "72.72,18.68 to 72.92,18.88"], ["Release window", "24 Aug 06:00-25 Aug 18:00"]],
    forecast: [["Horizon", "48 hours"], ["Contours", "50%, 80%, 95%"], ["Use", "Response and monitoring priority"]],
    ais: [["AIS window", "Hindcast release interval"], ["Scanned vessels", "5"], ["Shortlisted", "3"], ["Anomalies", "Speed, loitering, timing"]],
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
