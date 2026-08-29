import type { SubScores } from "../../types/attribution";

export const OVERALL_SCORE_CAPTION =
  "Degree of spatio-temporal and behavioural consistency with the reconstructed spill source - an investigative lead, not a determination of guilt.";

const segments: Array<[keyof SubScores, string, string]> = [
  ["spatial", "Spatial", "#0B2545"],
  ["temporal", "Temporal", "#13355E"],
  ["trajectory", "Trajectory", "#1D4E89"],
  ["source_probability", "Source probability", "#4C7FB8"],
  ["behavioural", "Behavioural", "#6B7280"],
  ["ais_continuity", "AIS continuity", "#9AA4B2"]
];

export function ScoreBar({ scores, overall }: { scores: SubScores; overall: number }) {
  const total = Math.max(segments.reduce((sum, [key]) => sum + scores[key], 0), 1);
  return (
    <div className="grid gap-3">
      <div>
        <div className="flex h-3 overflow-hidden rounded-sm bg-neutral-100" aria-label="Sub-score breakdown">
          {segments.map(([key, label, color]) => (
            <div
              key={key}
              title={`${label}: ${scores[key].toFixed(1)}`}
              style={{ width: `${(scores[key] / total) * 100}%`, backgroundColor: color }}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-caption text-neutral-500 xl:grid-cols-3">
          {segments.map(([key, label]) => (
            <span className="min-w-0" key={key}>
              <span className="block truncate">{label}</span>
              <span className="block font-mono text-neutral-700">{scores[key].toFixed(0)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-sm bg-neutral-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-caption text-neutral-500">Overall score</span>
          <span className="font-mono text-[28px] leading-8 font-semibold text-neutral-900">{overall.toFixed(0)}</span>
        </div>
        <p className="mt-1 text-caption text-neutral-500">{OVERALL_SCORE_CAPTION}</p>
      </div>
    </div>
  );
}
