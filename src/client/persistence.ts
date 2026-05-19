import type { BatchSummary } from "../sim/batch";
import type { BirthEvent, DeathEvent, WorldSnapshot } from "../sim/types";

export type PersistResult = {
  ok: boolean;
  message: string;
  experimentId?: number;
  jobId?: number;
};

export type BatchJobStatus = "queued" | "running" | "cancel_requested" | "complete" | "cancelled" | "failed";

export type SavedBatchExperiment = {
  id: number;
  created_at: string;
  label: string | null;
  status: BatchJobStatus;
  requested_runs: number;
  completed_runs: number;
  stop_tick: number;
  base_seed: number;
  job_id: number | null;
  aggregate: BatchSummary["aggregate"];
};

export type BatchJob = {
  id: number;
  experiment_id: number;
  created_at: string;
  updated_at: string;
  status: BatchJobStatus;
  requested_runs: number;
  completed_runs: number;
  stop_tick: number;
  base_seed: number;
  current_run_index: number;
  current_tick: number;
  error: string | null;
};

export async function persistSnapshot(worldId: string, snapshot: WorldSnapshot): Promise<PersistResult> {
  return postJson("/api/world/snapshot", { worldId, snapshot });
}

export async function persistEvents(worldId: string, births: BirthEvent[], deaths: DeathEvent[]): Promise<PersistResult> {
  if (births.length === 0 && deaths.length === 0) {
    return { ok: true, message: "No new events" };
  }
  return postJson("/api/world/events", { worldId, births, deaths });
}

export async function persistBatchExperiment(
  summary: BatchSummary,
  status: "complete" | "cancelled",
): Promise<PersistResult> {
  return postJson("/api/batch/experiments", { summary, status });
}

export async function listBatchExperiments(limit = 50): Promise<{ ok: boolean; message: string; experiments: SavedBatchExperiment[] }> {
  try {
    const response = await fetch(`/api/batch/experiments?limit=${encodeURIComponent(String(limit))}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: payload.error ?? response.statusText, experiments: [] };
    }
    return {
      ok: true,
      message: "Loaded",
      experiments: Array.isArray(payload.experiments) ? payload.experiments : [],
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Load failed", experiments: [] };
  }
}

export async function loadBatchExperiment(id: number): Promise<{ ok: boolean; message: string; summary: BatchSummary | null }> {
  try {
    const response = await fetch(`/api/batch/experiments/${encodeURIComponent(String(id))}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: payload.error ?? response.statusText, summary: null };
    }
    return { ok: true, message: "Loaded", summary: payload.summary ?? null };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Load failed", summary: null };
  }
}

export async function deleteBatchExperiment(id: number): Promise<PersistResult> {
  try {
    const response = await fetch(`/api/batch/experiments/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { ok: false, message: payload.error ?? response.statusText };
    }
    return { ok: true, message: "Deleted" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Delete failed" };
  }
}

export async function startBatchJob(
  options: BatchSummary["options"],
  parameters: BatchSummary["parameters"],
): Promise<PersistResult> {
  return postJson("/api/batch/jobs", { options, parameters });
}

export async function loadBatchJob(id: number): Promise<{ ok: boolean; message: string; job: BatchJob | null }> {
  try {
    const response = await fetch(`/api/batch/jobs/${encodeURIComponent(String(id))}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, message: payload.error ?? response.statusText, job: null };
    }
    return { ok: true, message: "Loaded", job: payload.job ?? null };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Load failed", job: null };
  }
}

export async function cancelBatchJob(id: number): Promise<PersistResult> {
  return postJson(`/api/batch/jobs/${encodeURIComponent(String(id))}/cancel`, {});
}

async function postJson(path: string, body: unknown): Promise<PersistResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { ok: false, message: payload.error ?? response.statusText };
    }
    const payload = await response.json().catch(() => ({}));
    return {
      ok: true,
      message: "Saved",
      experimentId: typeof payload.experimentId === "number" ? payload.experimentId : undefined,
      jobId: typeof payload.jobId === "number" ? payload.jobId : undefined,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Persistence failed" };
  }
}
