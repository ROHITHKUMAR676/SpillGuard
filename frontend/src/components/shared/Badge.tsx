type BadgeKind = "open" | "reviewed" | "closed" | "queued" | "running" | "succeeded" | "failed" | "action" | "warning";

const styles: Record<BadgeKind, string> = {
  open: "bg-neutral-100 text-neutral-700",
  reviewed: "bg-navy-50 text-navy-500",
  closed: "bg-neutral-100 text-neutral-500",
  queued: "bg-neutral-100 text-neutral-700",
  running: "bg-status-running-bg text-status-running",
  succeeded: "bg-status-success-bg text-status-success",
  failed: "bg-status-error-bg text-status-error",
  action: "bg-neutral-100 text-neutral-700",
  warning: "bg-status-running-bg text-status-running"
};

export function Badge({ label, kind }: { label: string; kind: BadgeKind }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-caption font-medium ${styles[kind]}`}>{label}</span>;
}
