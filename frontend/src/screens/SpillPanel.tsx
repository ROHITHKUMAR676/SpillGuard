import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { getSlick } from "../api/cases";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { ConfidenceChip } from "../components/shared/ConfidenceChip";
import { EmptyState } from "../components/shared/EmptyState";
import { ErrorState } from "../components/shared/ErrorState";
import type { OilSlick } from "../types/slick";

export function SpillPanel() {
  const slickId = window.location.pathname.split("/spill/")[1]?.split("/")[0] ?? "";
  const [slick, setSlick] = useState<OilSlick | null>(null);
  const [loading, setLoading] = useState(Boolean(slickId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slickId) {
      setLoading(false);
      setError("Slick ID is missing from the route.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSlick(slickId)
      .then((result) => {
        if (!cancelled) setSlick(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load slick.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slickId]);

  if (loading) {
    return <div className="mx-auto max-w-[960px] p-6"><EmptyState icon={AlertTriangle} headline="Loading slick characterization" body="Fetching the persisted detection output." /></div>;
  }

  if (error || !slick) {
    return <div className="mx-auto max-w-[960px] p-6"><ErrorState message={error || "Slick not found."} /></div>;
  }

  return (
    <div className="mx-auto max-w-[960px] p-6">
      <section className="rounded-md border border-neutral-200 bg-neutral-0 p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-display">{slick.event_id ?? slick.id}</h1>
          <ConfidenceChip value={slick.confidence >= 0.75 ? "high" : slick.confidence >= 0.5 ? "medium" : "low"} />
        </div>
        {slick.possible_lookalike && (
          <div className="mt-4"><Badge label={`Flagged as possible look-alike - ${slick.lookalike_reason}`} kind="warning" /></div>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-4 text-body">
          <Fact label="Scene ID" value={slick.scene_id} mono />
          <Fact label="Source" value={slick.source ?? "unknown"} mono />
          <Fact label="Acquisition" value={formatDate(slick.acquisition_timestamp)} />
          <Fact label="Processed" value={formatDate(slick.processing_timestamp ?? slick.created_at)} />
          <Fact label="CRS" value={slick.crs ?? "EPSG:4326"} mono />
          <Fact label="BBox" value={slick.bbox?.map((value) => value.toFixed(4)).join(", ") ?? "n/a"} mono />
          <Fact label="Centroid" value={slick.centroid.coordinates.map((value) => value.toFixed(4)).join(", ")} mono />
          <Fact label="Area" value={`${slick.area_km2.toFixed(2)} km2`} />
          <Fact label="Perimeter" value={`${slick.perimeter_km.toFixed(2)} km`} />
          <Fact label="Confidence" value={slick.confidence.toFixed(2)} mono />
          <Fact label="V4 threshold" value={formatNumber(slick.v4_threshold)} mono />
          <Fact label="V3 threshold" value={formatNumber(slick.v3_threshold)} mono />
          <Fact label="Candidates" value={`${slick.accepted_candidates ?? 0}/${slick.candidate_count ?? 0}`} mono />
          <Fact label="Raster size" value={`${slick.source_width ?? "?"} x ${slick.source_height ?? "?"}`} mono />
          <Fact label="Orientation" value={`${slick.orientation_deg ?? 0} deg`} />
          <Fact label="Model version" value={slick.model_version} mono />
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

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "n/a";
}

function formatNumber(value?: number) {
  return typeof value === "number" ? value.toFixed(2) : "n/a";
}
