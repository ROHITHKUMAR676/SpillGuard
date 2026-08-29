import { AlertTriangle, Check, Sparkles } from "lucide-react";

import { AISSourceFlag } from "../components/shared/AISSourceFlag";
import { ScoreBar, OVERALL_SCORE_CAPTION } from "../components/shared/ScoreBar";
import { operationalCandidates } from "../data/operational";

export function EvidenceExplorer() {
  const candidate = operationalCandidates[0];
  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <AISSourceFlag />
      <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-0 p-6">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-display">#{candidate.rank} {candidate.vessel.name}</h1>
            <p className="font-mono text-mono text-neutral-500">MMSI {candidate.vessel.mmsi}</p>
          </div>
          <div>
            <div className="font-mono text-[28px] font-semibold">{candidate.overall_score}</div>
            <p className="max-w-[360px] text-caption text-neutral-500">{OVERALL_SCORE_CAPTION}</p>
          </div>
        </header>
        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <ScoreBar scores={candidate.sub_scores} overall={candidate.overall_score} />
            <div className="mt-5 border-l-4 border-navy-500 bg-navy-50 p-4">
              <div className="flex items-center gap-2 text-body-medium text-navy-900"><Sparkles size={18} /> AI-generated explanation of the scores above</div>
              <p className="mt-2 text-body text-neutral-700">The candidate track is consistent with the reconstructed source-region window across spatial and temporal factors, with lower weight assigned to behavioural anomaly than spatial evidence.</p>
              <p className="mt-2 text-caption text-neutral-500">AI-generated explanation of the scores above - always shown alongside the underlying evidence, never in place of it</p>
            </div>
          </div>
          <div className="grid gap-5">
            <EvidenceList title="Supporting evidence" items={candidate.supporting_evidence} icon="supporting" />
            <EvidenceList title="Contradicting evidence" items={candidate.contradicting_evidence} icon="contradicting" />
          </div>
        </div>
      </section>
    </div>
  );
}

function EvidenceList({ title, items, icon }: { title: string; items: string[]; icon: "supporting" | "contradicting" }) {
  const Icon = icon === "supporting" ? Check : AlertTriangle;
  return (
    <section>
      <h2 className="text-h3">{title}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li className="flex gap-2 text-body text-neutral-700" key={item}>
            <Icon className={icon === "supporting" ? "text-status-success" : "text-status-running"} size={18} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
