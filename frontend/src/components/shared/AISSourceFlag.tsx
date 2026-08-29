import { Database } from "lucide-react";

export function AISSourceFlag({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-caption font-medium" style={{ borderColor: "var(--ais-source-flag)", color: "var(--ais-source-flag)" }}>
        <Database size={14} /> AIS source
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-body-medium" style={{ borderColor: "var(--ais-source-flag)", color: "var(--ais-source-flag)", background: "#F0F4F8" }}>
      <Database size={18} />
      <span>AIS vessel traffic is labelled by source and separated from other evidence layers</span>
    </div>
  );
}
