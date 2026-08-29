import { Check, RotateCw, UploadCloud, X } from "lucide-react";
import { DragEvent, useState } from "react";

import { Button } from "../shared/Button";
import { ErrorState } from "../shared/ErrorState";

type UploadState = "idle" | "uploading" | "complete";

export function DragDropTab({ caseReady, onUploadComplete }: { caseReady: boolean; onUploadComplete: (file: File) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");

  async function accept(next: File | null) {
    if (!caseReady || !next) return;
    const name = next.name.toLowerCase();
    const valid = name.endsWith(".tif") || name.endsWith(".tiff") || name.endsWith(".zip") || name.endsWith(".safe");
    const maxBytes = 2 * 1024 * 1024 * 1024;
    if (!valid) {
      setError("This file type isn't supported. Accepted formats: GeoTIFF, .SAFE, .tif.");
      return;
    }
    if (next.size > maxBytes) {
      setError("This file is larger than 2 GB. Select a smaller Sentinel-1 scene package.");
      return;
    }
    setError("");
    setFile(next);
    setUploadState("uploading");
    try {
      await onUploadComplete(next);
      setUploadState("complete");
    } catch (err) {
      setUploadState("idle");
      setError(err instanceof Error ? err.message : "Scene upload registration failed.");
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    void accept(event.dataTransfer.files?.[0] ?? null);
  }

  if (file) {
    return (
      <div>
        <div className="rounded-md border border-neutral-200 bg-neutral-0 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-mono text-neutral-900">{file.name}</div>
              <div className="text-caption text-neutral-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            <div className={`flex items-center gap-3 ${uploadState === "complete" ? "text-status-success" : "text-status-running"}`}>
              {uploadState === "complete" ? <Check size={18} /> : <RotateCw className="stage-ring" size={18} />}
              <button
                aria-label="Cancel upload"
                className="grid h-7 w-7 place-items-center rounded-sm text-neutral-700 hover:bg-neutral-100"
                onClick={() => {
                  setFile(null);
                  setUploadState("idle");
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </div>
    );
  }

  return (
    <div>
      <label
        className={`grid h-[200px] place-items-center rounded-md border-2 border-dashed border-neutral-300 bg-neutral-0 text-center ${caseReady ? "hover:border-navy-500 hover:bg-navy-50" : "opacity-60"} ${dragActive ? "border-solid border-navy-500 bg-navy-50" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input className="sr-only" type="file" disabled={!caseReady} onChange={(event) => accept(event.target.files?.[0] ?? null)} />
        <span>
          <UploadCloud className="mx-auto text-neutral-500" size={32} strokeWidth={1.5} />
          <span className="mt-3 block text-body-medium text-neutral-900">Drag and drop a Sentinel-1 scene file here</span>
          <span className="mt-1 block text-caption text-navy-500">or click to browse</span>
          <span className="mt-1 block text-caption text-neutral-500">Accepted: GeoTIFF, .SAFE (zipped), .tif - max 2 GB.</span>
        </span>
      </label>
      {error && <div className="mt-3"><ErrorState message={error} /></div>}
      <Button
        className="mt-3"
        variant="text"
        disabled={!caseReady}
        onClick={() => {
          const demoFile = new File(["demo"], "S1C_IW_GRDH_20260824T142210.SAFE.zip", { type: "application/zip" });
          void accept(demoFile);
        }}
      >
        Use demo uploaded scene
      </Button>
    </div>
  );
}
