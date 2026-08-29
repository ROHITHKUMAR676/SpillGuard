import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6">
      <div className="relative w-full max-w-[480px] rounded-md bg-neutral-0 p-6 shadow-elevation-1">
        <button aria-label="Close modal" className="absolute right-3 top-3 text-neutral-500" onClick={onClose}><X size={20} /></button>
        {children}
      </div>
    </div>
  );
}
