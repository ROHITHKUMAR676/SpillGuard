import { Button } from "../components/shared/Button";
import { ConfidenceChip } from "../components/shared/ConfidenceChip";
import { operationalSource } from "../data/operational";

export function SourcePanel() {
  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <section className="rounded-md border border-neutral-200 bg-neutral-0 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-display">Source Analysis</h1>
          <ConfidenceChip value={operationalSource.confidence} />
        </div>
        <div className="mt-2 font-mono text-mono text-neutral-500">24 Aug 2026, 06:00 UTC - 25 Aug 2026, 18:00 UTC</div>
        <div className="mt-6 grid grid-cols-[360px_1fr] gap-6">
          <div className="h-56 rounded-md border border-neutral-200 bg-[linear-gradient(90deg,#EEF3FA,#1D4E89,#0B2545)] opacity-90" />
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Time window start" value="24 Aug 2026, 06:00 UTC" />
            <Fact label="Time window end" value="25 Aug 2026, 18:00 UTC" />
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
