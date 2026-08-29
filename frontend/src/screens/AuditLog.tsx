import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";

const entries = [
  { actor: "analyst1", action: "accept_detection", ts: "29 Aug 2026, 11:10 UTC", payload: { slick_id: "slick-9f3a" } },
  { actor: "analyst1", action: "note", ts: "29 Aug 2026, 11:04 UTC", payload: { note: "Initial review completed against validated cached source bundle." } }
];

export function AuditLog() {
  return (
    <div className="mx-auto max-w-[960px] p-6">
      <h1 className="text-display">Analyst Review Log</h1>
      <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-0 p-5">
        <textarea className="h-24 w-full rounded-sm border border-neutral-300 p-3 text-body" placeholder="Add note" />
        <Button className="mt-3">Add Note</Button>
      </section>
      <div className="mt-5 space-y-3">
        {entries.map((entry) => (
          <article className="rounded-md border border-neutral-200 bg-neutral-0 p-4" key={`${entry.action}-${entry.ts}`}>
            <div className="flex items-center gap-3">
              <span className="text-body-medium">{entry.actor}</span>
              <Badge label={entry.action} kind="action" />
              <span className="text-caption text-neutral-500">{entry.ts} - 3 hours ago</span>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-caption text-navy-500">Payload</summary>
              <pre className="mt-2 rounded-sm bg-neutral-100 p-3 font-mono text-mono">{JSON.stringify(entry.payload, null, 2)}</pre>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
