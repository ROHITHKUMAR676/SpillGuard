import { ChevronRight, FolderSearch, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { DataTable } from "../components/shared/DataTable";
import { EmptyState } from "../components/shared/EmptyState";
import { operationalCases } from "../data/operational";

export function CaseList({ navigate }: { navigate: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState(["open", "reviewed", "closed"]);
  const cases = useMemo(() => operationalCases.filter((item) => statuses.includes(item.status) && item.title.toLowerCase().includes(query.toLowerCase())), [query, statuses]);

  function toggle(status: string) {
    setStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-display">Cases</h1>
        <Button onClick={() => navigate("/cases/new")}>New Case</Button>
      </div>
      <div className="mt-6 flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-0 p-3">
        <div className="flex gap-2">
          {["open", "reviewed", "closed"].map((status) => (
            <button className={`rounded-full px-3 py-1 text-caption ${statuses.includes(status) ? "bg-navy-900 text-white" : "bg-neutral-100 text-neutral-700"}`} key={status} onClick={() => toggle(status)}>
              {status[0].toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <label className="flex h-9 w-[320px] items-center gap-2 rounded-sm border border-neutral-300 px-3 text-neutral-500">
          <Search size={16} />
          <input className="w-full bg-transparent text-body text-neutral-900 outline-none" placeholder="Search title" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="mt-4">
        {cases.length === 0 ? (
          <EmptyState icon={FolderSearch} headline="No cases yet" body="Create a case to begin an investigation" action={<Button onClick={() => navigate("/cases/new")}>New Case</Button>} />
        ) : (
          <DataTable headers={["Title", "Status", "AOI", "Time window", "Created", "Created by", ""]}>
            {cases.map((item) => (
              <tr className="border-b border-neutral-200" key={item.id}>
                <td className="px-4 py-3"><button className="text-body-medium text-navy-500" onClick={() => navigate(`/cases/${item.id}/map`)}>{item.title}</button></td>
                <td className="px-4 py-3"><Badge label={item.status} kind={item.status} /></td>
                <td className="px-4 py-3"><div className="h-12 w-20 rounded-sm border border-neutral-200 bg-navy-50" /></td>
                <td className="px-4 py-3 font-mono text-mono">20 Aug - 27 Aug 2026</td>
                <td className="px-4 py-3 text-caption text-neutral-500">3 hours ago</td>
                <td className="px-4 py-3 text-body">analyst1</td>
                <td className="px-4 py-3"><ChevronRight size={18} /></td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
