export function MapLegend() {
  return (
    <div className="absolute bottom-20 left-4 z-20 w-[300px] rounded-md border border-neutral-200 bg-neutral-0 p-4 text-caption shadow-elevation-1">
      <h3 className="text-h3 text-neutral-900">Legend</h3>
      <div className="mt-3 space-y-2 text-neutral-700">
        <div className="flex items-center gap-2"><span className="h-3 w-6 bg-[#3A3A3A]/60" /> Slick confidence opacity</div>
        <div className="flex items-center gap-2"><span className="h-3 w-20 bg-gradient-to-r from-[#EEF3FA] via-[#1D4E89] to-[#0B2545]" /> Source density contours 50/80/95%</div>
        <div className="flex items-center gap-2"><span className="h-3 w-6 bg-status-running/50" /> Forecast envelope</div>
        <div className="flex items-center gap-2"><span className="h-3 w-6 bg-status-error" /> Top-ranked candidate marker</div>
      </div>
    </div>
  );
}
