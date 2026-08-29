import { FlaskConical } from "lucide-react";

export function SyntheticFlag({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-caption font-medium" style={{ borderColor: "var(--synthetic-flag)", color: "var(--synthetic-flag)" }}>
        <FlaskConical size={14} /> Synthetic AIS
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-body-medium" style={{ borderColor: "var(--synthetic-flag)", color: "var(--synthetic-flag)", background: "#F3EFFB" }}>
      <FlaskConical size={18} />
      <span>Synthetic AIS - vessel traffic shown is generated for demonstration, not real-world data</span>
    </div>
  );
}
