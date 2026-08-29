import { Anchor, LogOut } from "lucide-react";

import { DataSourceModeBadge } from "../shared/DataSourceModeBadge";

export function TopBar({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const items = [
    ["Operations", "/operations"],
    ["Map", "/cases/ARB-2026-014/map"],
    ["Reports", "/cases/ARB-2026-014/reports"]
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between bg-navy-900 px-6 text-white">
      <div className="flex min-w-[360px] items-center gap-3">
        <Anchor size={22} strokeWidth={1.5} />
        <span className="text-body-medium">SpillGuard - Maritime Pollution Forensic Intelligence</span>
      </div>
      <nav className="flex h-full items-center gap-6 text-body-medium">
        {items.map(([label, path]) => (
          <button className={`h-full border-b-2 ${route === path ? "border-[#4C7FB8]" : "border-transparent"} px-1`} key={label} onClick={() => navigate(path)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="flex min-w-[360px] items-center justify-end gap-3">
        <DataSourceModeBadge />
        <span className="text-caption text-white/70">Analyst</span>
        <span className="text-caption">analyst1</span>
        <button aria-label="Logout" title="Logout" className="grid h-8 w-8 place-items-center rounded-sm hover:bg-white/10" onClick={() => navigate("/login")}>
          <LogOut size={18} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
