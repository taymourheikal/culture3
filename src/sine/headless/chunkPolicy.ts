export type HeadlessExecutionMode = "interactive" | "throughput" | "benchmark";

export const HEADLESS_INTERACTIVE_CHUNK_TICKS = 25;
export const HEADLESS_INTERACTIVE_MAX_CHUNK_TICKS = 100;
export const HEADLESS_THROUGHPUT_CHUNK_TICKS = 1000;

export function defaultHeadlessChunkTicks(mode: HeadlessExecutionMode) {
  return mode === "interactive" ? HEADLESS_INTERACTIVE_CHUNK_TICKS : HEADLESS_THROUGHPUT_CHUNK_TICKS;
}

export function maxHeadlessChunkTicks(mode: HeadlessExecutionMode) {
  return mode === "interactive" ? HEADLESS_INTERACTIVE_MAX_CHUNK_TICKS : Number.POSITIVE_INFINITY;
}

export function sanitizeHeadlessChunkTicks(
  value: unknown,
  mode: HeadlessExecutionMode,
  fallback = defaultHeadlessChunkTicks(mode),
) {
  const parsed = Number(value ?? fallback);
  const ticks = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : Math.max(1, Math.floor(fallback));
  const maxTicks = maxHeadlessChunkTicks(mode);
  return Number.isFinite(maxTicks) ? Math.min(maxTicks, ticks) : ticks;
}
