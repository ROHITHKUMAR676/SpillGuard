import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { askInvestigator, explainCandidate, getCandidateEvidence, getCandidates } from "../api/cases";
import { AISSourceFlag } from "../components/shared/AISSourceFlag";
import { Button } from "../components/shared/Button";
import { ErrorState } from "../components/shared/ErrorState";
import { ScoreBar, OVERALL_SCORE_CAPTION } from "../components/shared/ScoreBar";
import type { AttributionEvidence } from "../types/attribution";

export function EvidenceExplorer({ caseId, vesselId }: { caseId: string; vesselId?: string }) {
  const [candidate, setCandidate] = useState<AttributionEvidence | null>(null);
  const [explanation, setExplanation] = useState("");
  const [question, setQuestion] = useState("Why did this vessel receive this rank?");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    async function loadEvidence() {
      const resolvedVesselId = vesselId ?? (await getCandidates(caseId))[0]?.vessel.id;
      if (!resolvedVesselId) throw new Error("No attribution candidates are available for this case.");
      return Promise.all([getCandidateEvidence(caseId, resolvedVesselId), explainCandidate(caseId, resolvedVesselId)]);
    }
    loadEvidence()
      .then(([evidence, explanationResult]) => {
        if (cancelled) return;
        setCandidate(evidence);
        setExplanation(explanationResult.explanation);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load candidate evidence.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, vesselId]);

  async function submitQuestion() {
    if (!question.trim()) return;
    setAsking(true);
    setError("");
    try {
      const result = await askInvestigator(caseId, question.trim(), candidate?.vessel.id ?? vesselId);
      setAnswer(result.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Investigator question failed.");
    } finally {
      setAsking(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-[1280px] p-6"><AISSourceFlag /><div className="mt-5 rounded-md border border-neutral-200 bg-neutral-0 p-6 text-body text-neutral-600">Loading stored candidate evidence...</div></div>;
  }
  if (error || !candidate) {
    return <div className="mx-auto max-w-[1280px] p-6"><AISSourceFlag /><div className="mt-5"><ErrorState message={error || "Candidate evidence is unavailable."} /></div></div>;
  }

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
              <p className="mt-2 whitespace-pre-wrap text-body text-neutral-700">{explanation}</p>
              <p className="mt-2 text-caption text-neutral-500">Gemini explains stored deterministic evidence only; scores and ranks are read from PostgreSQL.</p>
            </div>
            <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
              <h2 className="text-h3">Investigator Q&A</h2>
              <div className="mt-3 flex gap-2">
                <input className="h-9 flex-1 rounded-sm border border-neutral-300 px-3 text-body" value={question} onChange={(event) => setQuestion(event.target.value)} />
                <Button disabled={asking} onClick={submitQuestion}>{asking ? "Asking..." : "Ask"}</Button>
              </div>
              {answer && <p className="mt-3 whitespace-pre-wrap text-body text-neutral-700">{answer}</p>}
            </section>
          </div>
          <div className="grid gap-5">
            <EvidenceList title="Supporting evidence" items={candidate.supporting_evidence} icon="supporting" />
            <EvidenceList title="Contradicting evidence" items={candidate.contradicting_evidence} icon="contradicting" />
            <section>
              <h2 className="text-h3">Stored events</h2>
              <ul className="mt-3 space-y-2">
                {candidate.vessel_events.map((event) => (
                  <li className="rounded-sm border border-neutral-200 bg-neutral-50 p-2 text-caption" key={event.id}>
                    <span className="font-mono text-neutral-900">{event.event_type}</span>
                    <span className="ml-2 text-neutral-500">{event.start_time}</span>
                  </li>
                ))}
                {!candidate.vessel_events.length && <li className="text-caption text-neutral-500">No stored vessel events for this candidate.</li>}
              </ul>
            </section>
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
