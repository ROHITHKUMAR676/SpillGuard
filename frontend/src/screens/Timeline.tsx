import { Camera } from "lucide-react";

export function Timeline() {
  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <h1 className="text-display">Timeline</h1>
      <section className="mt-6 rounded-md border border-neutral-200 bg-neutral-0 p-6">
        <div className="relative h-40">
          <div className="absolute left-0 right-0 top-20 h-px bg-neutral-200" />
          <div className="absolute left-[18%] top-12 grid place-items-center text-caption text-neutral-700">
            <Camera size={18} className="mb-2 text-navy-500" />
            Scene acquisition
          </div>
          <div className="absolute left-[32%] top-16 h-8 w-[28%] rounded-sm bg-navy-50 text-center text-caption leading-8 text-navy-900">Reconstructed source time window</div>
          {[12, 24, 48, 72].map((hour, index) => (
            <div className="absolute top-[74px] text-caption text-status-running" style={{ left: `${60 + index * 9}%`, opacity: 1 - index * 0.16 }} key={hour}>
              <div className="mx-auto h-4 w-px bg-status-running" />T+{hour}h
            </div>
          ))}
          <input aria-label="Forecast timeline scrubber" className="absolute bottom-4 left-0 right-0 w-full accent-navy-900" type="range" min={12} max={72} step={12} defaultValue={48} />
        </div>
      </section>
    </div>
  );
}
