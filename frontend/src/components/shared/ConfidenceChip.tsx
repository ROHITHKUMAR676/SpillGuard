type Confidence = "low" | "medium" | "high";

const filledCount: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function ConfidenceChip({ value }: { value: Confidence }) {
  const count = filledCount[value];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-0 px-2.5 py-1 text-caption font-medium capitalize text-neutral-700">
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            className={`h-1.5 w-1.5 rounded-full border border-status-running ${dot < count ? "bg-status-running" : "bg-transparent"}`}
            key={dot}
          />
        ))}
      </span>
      {value} confidence
    </span>
  );
}
