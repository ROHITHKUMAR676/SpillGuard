import { ChevronLeft, Layers2 } from "lucide-react";
import { useState } from "react";

const layerGroups = [
  ["EEZ", "Jurisdiction window"],
  ["SAR", "Scene footprint"],
  ["Slick", "Detection mask"],
  ["Hindcast", "Backward Euler drift"],
  ["Forecast", "50 / 80 / 95 contours"],
  ["AIS", "Tracks and vessel pins"]
];

export function MapControls() {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <button aria-label="Expand layer control" title="Expand layer control" className="absolute left-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-neutral-0 shadow-elevation-1" onClick={() => setCollapsed(false)}>
        <Layers2 size={18} />
      </button>
    );
  }
  return (
    <div className="absolute left-4 top-4 z-20 w-[280px] rounded-md border border-neutral-200 bg-neutral-0/95 p-4 shadow-elevation-1 backdrop-blur">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h3 text-neutral-900"><Layers2 size={17} /> Active Layers</h3>
        <button aria-label="Collapse layer control" title="Collapse layer control" onClick={() => setCollapsed(true)}><ChevronLeft size={18} /></button>
      </div>
      <div className="mt-3 space-y-2 text-caption text-neutral-700">
        {layerGroups.map(([layer, detail]) => (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-neutral-200 bg-neutral-0 px-2 py-1.5" key={layer}>
            <span className="font-medium text-neutral-900">{layer}</span>
            <span className="text-right text-neutral-500">{detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
