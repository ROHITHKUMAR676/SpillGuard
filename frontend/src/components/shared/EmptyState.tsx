import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, headline, body, action }: { icon: LucideIcon; headline: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-md border border-neutral-200 bg-neutral-0 px-6 py-12 text-center">
      <Icon className="text-neutral-300" size={32} strokeWidth={1.5} />
      <h3 className="mt-3 text-h3 text-neutral-900">{headline}</h3>
      <p className="mt-1 text-body text-neutral-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
