export function MapLegend() {
  return (
    <div className="absolute bottom-20 left-4 z-20 w-[310px] rounded-md border border-neutral-200 bg-neutral-0/95 p-4 text-caption shadow-elevation-1 backdrop-blur">
      <h3 className="text-h3 text-neutral-900">Legend</h3>
      <div className="mt-3 space-y-2 text-neutral-700">
        <div className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm bg-[#3A3A3A]/70" /> Detected oil slick</div>
        <div className="flex items-center gap-2"><span className="h-0.5 w-6 border-t-4 border-dashed border-[#2563EB]" /> Euler hindcast path</div>
        <div className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm bg-[#0EA5E9]/30 ring-1 ring-[#0369A1]" /> Probable source region</div>
        <div className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm bg-[#FACC15]/70" /> Forecast 50%</div>
        <div className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm bg-[#FB923C]/60" /> Forecast 80%</div>
        <div className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm bg-[#F87171]/50" /> Forecast 95%</div>
        <div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-status-error text-[10px] font-bold text-white">1</span> Vessel candidate, hover for name</div>
      </div>
    </div>
  );
}
