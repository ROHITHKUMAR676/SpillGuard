import { AlertCircle } from "lucide-react";

import { Button } from "./Button";

export function ErrorState({ message, retry, full = false }: { message: string; retry?: () => void; full?: boolean }) {
  if (full) {
    return (
      <div className="grid place-items-center rounded-md border border-neutral-200 bg-neutral-0 px-6 py-12 text-center">
        <AlertCircle className="text-status-error" size={32} />
        <p className="mt-3 text-body-medium text-neutral-900">{message}</p>
        {retry && <Button className="mt-4" variant="text" onClick={retry}>Retry</Button>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-l-4 border-status-error bg-status-error-bg px-3 py-2 text-body text-status-error">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && <Button variant="text" size="sm" onClick={retry}>Retry</Button>}
    </div>
  );
}
