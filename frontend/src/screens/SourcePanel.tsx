import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { getForecast, getSourceHypothesis } from "../api/cases";
import { Button } from "../components/shared/Button";
import { ConfidenceChip } from "../components/shared/ConfidenceChip";
import { EmptyState } from "../components/shared/EmptyState";
import { ErrorState } from "../components/shared/ErrorState";
import type { ForwardForecast, SourceHypothesis } from "../types/drift";

export function SourcePanel() {
  const caseId = window.location.pathname.split("/cases/")[1]?.split("/")[0] ?? "";
  const [source, setSource] = useState<SourceHypothesis | null>(null);
  const [forecast, setForecast] = useState<ForwardForecast | null>(null);
  const [loading, setLoading] = useState(Boolean(caseId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!caseId) {
      setLoading(false);
      setError("Case ID is missing from the route.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([getSourceHypothesis(caseId), getForecast(caseId)])
      .then(([sourceResult, forecastResult]) => {
        if (!cancelled) {
          setSource(sourceResult);
          setForecast(forecastResult);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load source hypothesis.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (loading) {
    return <div className="mx-auto max-w-[1200px] p-6"><EmptyState icon={AlertTriangle} headline="Loading source hypothesis" body="Fetching persisted Euler drift output." /></div>;
  }

  if (error || !source) {
    return <div className="mx-auto max-w-[1200px] p-6"><ErrorState message={error || "Source hypothesis not found."} /></div>;
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <section className="rounded-md border border-neutral-200 bg-neutral-0 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-display">Source Analysis</h1>
          <ConfidenceChip value={source.confidence} />
        </div>
        <div className="mt-2 font-mono text-mono text-neutral-500">{formatDate(source.time_window_start)} - {formatDate(source.time_window_end)}</div>
        <div className="mt-6 grid grid-cols-[360px_1fr] gap-6">
          <div className="h-56 rounded-md border border-neutral-200 bg-[linear-gradient(90deg,#EEF3FA,#1D4E89,#0B2545)] opacity-90" />
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Time window start" value={formatDate(source.time_window_start)} />
            <Fact label="Time window end" value={formatDate(source.time_window_end)} />
            <Fact label="Bearing" value={`${source.drift_corridor_bearing_deg.toFixed(1)} deg`} mono />
            <Fact label="Forecast contours" value={String(forecast?.contours.length ?? 0)} mono />
            <Fact label="Drift engine used" value="lightweight_particle" mono />
            <Fact label="Ensemble size" value="20" mono />
          </dl>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <input className="h-9 rounded-sm border border-neutral-300 px-3 text-body" defaultValue="48" aria-label="Backward hours" />
          <input className="h-9 rounded-sm border border-neutral-300 px-3 text-body" defaultValue="72" aria-label="Forward hours" />
          <Button>Adjust & Re-run</Button>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-caption text-neutral-500">{label}</dt><dd className={mono ? "font-mono text-mono" : "text-body"}>{value}</dd></div>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
