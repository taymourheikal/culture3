const DEFAULT_MAX_CONCURRENT_HEADLESS_RUNS = 4;
const MIN_MAX_CONCURRENT_HEADLESS_RUNS = 1;

export function maxConcurrentSineHeadlessJobs(env = process.env) {
  const parsed = Number(env.SINE_HEADLESS_MAX_CONCURRENT_RUNS ?? DEFAULT_MAX_CONCURRENT_HEADLESS_RUNS);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_CONCURRENT_HEADLESS_RUNS;
  return Math.max(MIN_MAX_CONCURRENT_HEADLESS_RUNS, Math.floor(parsed));
}
