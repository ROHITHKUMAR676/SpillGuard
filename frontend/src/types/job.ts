export interface Job {
  id: string;
  job_type: "detect" | "drift" | "vessel_analysis" | "report";
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  result_ref?: string;
  error?: string;
}
