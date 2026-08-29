import { useState } from "react";

import { Button } from "../components/shared/Button";
import { ScoreBar } from "../components/shared/ScoreBar";
import { AISSourceFlag } from "../components/shared/AISSourceFlag";
import { operationalCandidates } from "../data/operational";

export function VesselRanking({ navigate }: { navigate: (path: string) => void }) {
  const [excluded, setExcluded] = useState<string[]>([]);
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
      <div className="mt-4 grid gap-4">
        {operationalCandidates.map((candidate) => {
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
                  <Button variant="text" onClick={() => navigate(`/cases/ARB-2026-014/vessels/${candidate.vessel.id}`)}>View evidence</Button>
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
