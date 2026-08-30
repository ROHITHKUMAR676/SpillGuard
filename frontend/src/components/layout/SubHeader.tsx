import { Badge } from "../shared/Badge";

const tabs = ["Map", "Timeline", "Spill", "Source", "Vessels", "Evidence", "Reports", "Audit"];

export function SubHeader({ route, navigate, caseId }: { route: string; navigate: (path: string) => void; caseId: string }) {
  const base = `/cases/${caseId}`;
  const paths: Record<string, string> = {
    Map: `${base}/map`,
    Timeline: `${base}/timeline`,
    Spill: `${base}/spill`,
    Source: `${base}/source`,
    Vessels: `${base}/vessels`,
    Evidence: `${base}/evidence`,
    Reports: `${base}/reports`,
    Audit: `${base}/audit`
  };
  return (
    <div className="fixed inset-x-0 top-14 z-40 flex h-12 items-center gap-5 border-b border-neutral-200 bg-neutral-50 px-6">
      <div className="text-caption text-neutral-500">
        Cases / <span className="font-mono text-neutral-700">{caseId}</span>
      </div>
      <Badge label="open" kind="open" />
      <nav className="flex h-full items-end gap-5">
        {tabs.map((tab) => (
          <button
            className={`h-full border-b-2 text-body-medium ${route === paths[tab] ? "border-navy-500 text-navy-900" : "border-transparent text-neutral-500"}`}
            key={tab}
            onClick={() => navigate(paths[tab])}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}
