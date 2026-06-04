// Browser perf currently shows object and compact worker pools slower through
// 1000 fixed-pop agents; automatic selection stays on sync until worker
// transport/materialization costs are clearly beaten.
export const MIN_PARALLEL_BRAIN_EVAL_JOBS = Number.POSITIVE_INFINITY;
export const MAX_BRAIN_EVAL_WORKERS = 4;
export const BRAIN_EVAL_TIMEOUT_MS = 2_000;
export const BRAIN_EVAL_FAILURE_DISABLE_THRESHOLD = 2;
export const BRAIN_EVAL_DISABLE_COOLDOWN_MS = 5_000;
export const BRAIN_EVAL_CACHE_LIMIT = 2_000;

export function defaultBrainEvalWorkerCount() {
  const concurrency = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(MAX_BRAIN_EVAL_WORKERS, concurrency - 1));
}
