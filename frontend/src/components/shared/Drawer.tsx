import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <aside className="absolute right-0 top-0 z-40 h-full w-[420px] overflow-auto border-l border-neutral-200 bg-neutral-0 p-5 shadow-elevation-1">
      <button aria-label="Close drawer" className="absolute right-3 top-3 text-neutral-500" onClick={onClose}><X size={20} /></button>
      {children}
    </aside>
  );
}
