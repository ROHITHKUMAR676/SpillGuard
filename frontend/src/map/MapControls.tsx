import { ChevronLeft } from "lucide-react";
import { useState } from "react";

import { LAYER_ORDER } from "./layers/base";

export function MapControls() {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <button aria-label="Expand layer control" title="Expand layer control" className="absolute left-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-neutral-0 shadow-elevation-1" onClick={() => setCollapsed(false)}>
        <ChevronLeft size={18} />
      </button>
    );
  }
  return (
    <div className="absolute left-4 top-4 z-20 w-[280px] rounded-md border border-neutral-200 bg-neutral-0 p-4 shadow-elevation-1">
      <div className="flex items-center justify-between">
        <h3 className="text-h3 text-neutral-900">Layer Control</h3>
        <button aria-label="Collapse layer control" title="Collapse layer control" onClick={() => setCollapsed(true)}><ChevronLeft size={18} /></button>
      </div>
      <div className="mt-3 space-y-2 text-caption text-neutral-700">
        {LAYER_ORDER.map((layer, index) => (
          <label className="flex items-center justify-between gap-3" key={layer}>
            <span>{layer}</span>
            <input type="checkbox" defaultChecked={index !== 1 && index !== 8 && index !== 9} disabled={index === 0} />
          </label>
        ))}
      </div>
      <label className="mt-3 block text-caption text-neutral-500">Source heatmap opacity
        <input className="mt-1 w-full" type="range" min={0} max={100} defaultValue={70} />
      </label>
    </div>
  );
}
