import { AlertTriangle } from "lucide-react";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { ConfidenceChip } from "../components/shared/ConfidenceChip";
import { operationalSlick } from "../data/operational";

export function SpillPanel() {
  return (
    <div className="mx-auto max-w-[960px] p-6">
      <section className="rounded-md border border-neutral-200 bg-neutral-0 p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-display">{operationalSlick.id}</h1>
          <ConfidenceChip value="high" />
        </div>
        {operationalSlick.possible_lookalike && (
          <div className="mt-4"><Badge label={`Flagged as possible look-alike - ${operationalSlick.lookalike_reason}`} kind="warning" /></div>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-4 text-body">
          <Fact label="Area" value={`${operationalSlick.area_km2} km2`} />
          <Fact label="Perimeter" value={`${operationalSlick.perimeter_km} km`} />
          <Fact label="Orientation" value={`${operationalSlick.orientation_deg} deg`} />
          <Fact label="Model version" value={operationalSlick.model_version} mono />
          <Fact label="Detected" value="29 Aug 2026, 10:45 UTC" />
        </dl>
        <div className="mt-6 flex gap-3">
          <Button className="bg-status-success hover:bg-status-success">Accept Detection</Button>
          <Button variant="secondary" className="border-status-error text-status-error">Reject Detection</Button>
          <Button variant="text">Edit Polygon</Button>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-caption text-neutral-500">{label}</dt><dd className={mono ? "font-mono text-mono text-neutral-900" : "text-body text-neutral-900"}>{value}</dd></div>;
}
