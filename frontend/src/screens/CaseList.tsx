import { ChevronRight, FolderSearch, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { listRecentCases, listRecentSyntheticBatches } from "../api/cases";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { DataTable } from "../components/shared/DataTable";
import { EmptyState } from "../components/shared/EmptyState";
import type { RecentCase, SyntheticBatch } from "../types/case";

export function CaseList({ navigate }: { navigate: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState(["open", "reviewed", "closed"]);
  const [recentCases, setRecentCases] = useState<RecentCase[]>([]);
  const [latestBatch, setLatestBatch] = useState<SyntheticBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cases = useMemo(() => recentCases.filter((item) => statuses.includes(item.status) && item.title.toLowerCase().includes(query.toLowerCase())), [query, recentCases, statuses]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => window.clearInterval(interval);
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [cases, batches] = await Promise.all([listRecentCases(50), listRecentSyntheticBatches(1)]);
      setRecentCases(cases);
      setLatestBatch(batches[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load recent cases.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(status: string) {
    setStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-display">Cases</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refresh}><RefreshCw size={16} /> View Recent Cases</Button>
          <Button onClick={() => navigate("/cases/new")}>New Case</Button>
        </div>
      </div>
      {latestBatch && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-0 p-3 text-caption text-neutral-700">
          <span className="font-mono">Latest synthetic batch {latestBatch.id}</span>
          <span>{latestBatch.status} - {completedCaseCount(latestBatch)}/{latestBatch.case_count} cases complete</span>
          <span>{latestBatch.completed_at ? `Completed ${formatDateTime(latestBatch.completed_at)}` : "Running now"}</span>
        </div>
      )}
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
        {loading ? (
          <div className="rounded-md border border-neutral-200 bg-neutral-0 p-5 text-body text-neutral-600">Loading recent processed cases...</div>
        ) : error ? (
          <div className="rounded-md border border-status-error bg-neutral-0 p-5 text-body text-status-error">{error}</div>
        ) : cases.length === 0 ? (
          <EmptyState icon={FolderSearch} headline="No recent cases" body="Synthetic and investigator-created cases will appear here after processing starts." action={<Button onClick={refresh}>View Recent Cases</Button>} />
        ) : (
          <DataTable headers={["Title", "Status", "Pipeline", "Time window", "Created", "Top score", ""]}>
            {cases.map((item) => (
              <tr className="cursor-pointer border-b border-neutral-200" key={item.id} onClick={() => navigate(`/cases/${item.id}/map`)}>
                <td className="px-4 py-3"><button className="text-body-medium text-navy-500" onClick={(event) => { event.stopPropagation(); navigate(`/cases/${item.id}/map`); }}>{item.title}</button></td>
                <td className="px-4 py-3"><Badge label={item.status} kind={item.status} /></td>
                <td className="px-4 py-3 text-caption text-neutral-600">{item.candidate_count} ranked candidates{item.latest_batch_status ? ` - batch ${item.latest_batch_status}` : ""}</td>
                <td className="px-4 py-3 font-mono text-mono">{formatDate(item.time_window_start)} - {formatDate(item.time_window_end)}</td>
                <td className="px-4 py-3 text-caption text-neutral-500">{formatDateTime(item.created_at)}</td>
                <td className="px-4 py-3 font-mono text-mono">{item.top_score == null ? "n/a" : item.top_score.toFixed(1)}</td>
                <td className="px-4 py-3"><button aria-label={`Open ${item.title}`} title={`Open ${item.title}`} onClick={(event) => { event.stopPropagation(); navigate(`/cases/${item.id}/map`); }}><ChevronRight size={18} /></button></td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}

function completedCaseCount(batch: SyntheticBatch) {
  return new Set(batch.stages.filter((stage) => stage.stage === "llm_explanation" && stage.status === "succeeded").map((stage) => stage.case_id)).size;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
