import { useEffect, useState } from "react";

import { getCandidates } from "../api/cases";
import { Button } from "../components/shared/Button";
import { ErrorState } from "../components/shared/ErrorState";
import { ScoreBar } from "../components/shared/ScoreBar";
import { AISSourceFlag } from "../components/shared/AISSourceFlag";
import type { AttributionCandidate } from "../types/attribution";

export function VesselRanking({ caseId, navigate }: { caseId: string; navigate: (path: string) => void }) {
  const [excluded, setExcluded] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<AttributionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getCandidates(caseId)
      .then((items) => {
        if (!cancelled) setCandidates(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load attribution candidates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <AISSourceFlag />
      <div className="mt-5 flex items-center justify-between">
        <h1 className="text-display">Vessel Investigation</h1>
        <div className="flex gap-2">
          <select className="h-9 rounded-sm border border-neutral-300 bg-neutral-0 px-3 text-body" aria-label="Sort candidates">
            <option>Sort by rank</option>
            <option>Sort by spatial score</option>
            <option>Sort by temporal score</option>
          </select>
          <select className="h-9 rounded-sm border border-neutral-300 bg-neutral-0 px-3 text-body" aria-label="Filter vessel type">
            <option>All vessel types</option>
            <option>Tanker</option>
            <option>Cargo</option>
            <option>Product carrier</option>
          </select>
        </div>
      </div>
      {loading && <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-0 p-5 text-body text-neutral-600">Loading stored attribution candidates...</div>}
      {error && <div className="mt-6"><ErrorState message={error} /></div>}
      <div className="mt-4 grid gap-4">
        {!loading && !error && candidates.map((candidate) => {
          const isExcluded = excluded.includes(candidate.id);
          return (
            <article className={`rounded-md border border-neutral-200 bg-neutral-0 p-5 ${isExcluded ? "opacity-55" : ""}`} key={candidate.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <div className="font-mono text-[26px] font-semibold text-neutral-900">#{candidate.rank}</div>
                  <div>
                    <h2 className={`text-h2 ${isExcluded ? "line-through" : ""}`}>{candidate.vessel.name}</h2>
                    <p className="font-mono text-mono text-neutral-500">MMSI {candidate.vessel.mmsi}</p>
                    <p className="text-caption text-neutral-500">{candidate.vessel.flag} - {candidate.vessel.vessel_type} - vessel type is informational only</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="text" onClick={() => navigate(`/cases/${caseId}/vessels/${candidate.vessel.id}`)}>View evidence</Button>
                  <Button variant="text" onClick={() => setExcluded((items) => [...items, candidate.id])}>Exclude</Button>
                </div>
              </div>
              {!isExcluded && <div className="mt-5"><ScoreBar scores={candidate.sub_scores} overall={candidate.overall_score} /></div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
