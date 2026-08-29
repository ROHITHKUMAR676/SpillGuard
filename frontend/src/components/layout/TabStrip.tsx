export function TabStrip<T extends string>({ tabs, active, onChange }: { tabs: T[]; active: T; onChange: (tab: T) => void }) {
  return (
    <div className="flex h-10 items-end border-b border-neutral-200 bg-neutral-0">
      {tabs.map((tab) => (
        <button
          className={`h-10 border-b-2 px-4 text-body-medium ${active === tab ? "border-navy-500 text-navy-900" : "border-transparent text-neutral-500"}`}
          key={tab}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
