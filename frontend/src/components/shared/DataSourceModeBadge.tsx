export function DataSourceModeBadge({ mode = "cached" }: { mode?: "live" | "cached" }) {
  const live = mode === "live";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-2.5 py-1 text-caption text-white">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-status-success" : "bg-status-running"}`} />
      {live ? "Live" : "Validated offline source"}
    </span>
  );
}
