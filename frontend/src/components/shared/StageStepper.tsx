import { Check, RotateCw, X } from "lucide-react";

import type { Job } from "../../types/job";
import { Button } from "./Button";

export type StageState = "pending" | "active" | "done" | "failed";

export interface Stage {
  id: string;
  label: string;
  detail?: string;
  job?: Job;
  href?: string;
  state: StageState;
}

export function StageStepper({ stages }: { stages: Stage[] }) {
  return (
    <ol className="grid grid-cols-5 gap-0 rounded-md border border-neutral-200 bg-neutral-0 p-4">
      {stages.map((stage, index) => (
        <li className="relative flex flex-col items-center gap-2 px-2 text-center" key={stage.id}>
          {index < stages.length - 1 && <span className="absolute left-1/2 top-4 h-px w-full bg-neutral-200" aria-hidden="true" />}
          <StageNode state={stage.state} />
          <div className="relative z-10">
            <a className={`text-caption font-medium ${stage.href && stage.state === "done" ? "text-navy-500" : "text-neutral-700"}`} href={stage.href}>
              {stage.label}
            </a>
            <p className="mt-1 min-h-8 text-caption text-neutral-500">{stage.job?.status === "failed" ? stage.job.error : stage.detail}</p>
            {stage.state === "failed" && <Button variant="text" size="sm">Retry</Button>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StageNode({ state }: { state: StageState }) {
  if (state === "active") {
    return (
      <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-status-running text-white">
        <span className="stage-ring absolute inset-[-3px] rounded-full border border-dashed border-status-running" />
        <RotateCw size={14} strokeWidth={1.5} />
      </span>
    );
  }
  if (state === "done") {
    return <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-status-success text-white"><Check size={15} /></span>;
  }
  if (state === "failed") {
    return <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-status-error text-white"><X size={15} /></span>;
  }
  return <span className="relative z-10 h-8 w-8 rounded-full border border-neutral-300 bg-neutral-0" />;
}
