import { FileText } from "lucide-react";
import { useState } from "react";

import { Button } from "../components/shared/Button";
import { EmptyState } from "../components/shared/EmptyState";

export function Reports() {
  const [report, setReport] = useState(false);
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[360px_1fr] gap-6 p-6">
      <section className="rounded-md border border-neutral-200 bg-neutral-0 p-5">
        <h1 className="text-h2">Reports</h1>
        <div className="mt-4">
          {report ? <div className="rounded-md border border-neutral-200 p-3 font-mono text-mono">report-session-json-001</div> : <EmptyState icon={FileText} headline="No reports in this session" body="Generate a report to add it to this working list." />}
        </div>
      </section>
      <section className="rounded-md border border-neutral-200 bg-neutral-0 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-h2">Generate Report</h2>
          <div className="flex gap-2"><Button variant="secondary">PDF</Button><Button onClick={() => setReport(true)}>JSON</Button></div>
        </div>
        <pre className="mt-5 overflow-auto rounded-md bg-neutral-900 p-4 font-mono text-mono text-neutral-100">
{JSON.stringify({ case_id: "ARB-2026-014", format: "json", source_region_confidence: "medium", ais_source: "synthetic" }, null, 2)}
        </pre>
      </section>
    </div>
  );
}
