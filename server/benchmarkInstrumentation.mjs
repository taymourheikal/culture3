import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const MAX_SAMPLES_PER_BUCKET = 500;
const enabled = process.env.SINE_BENCHMARK_INSTRUMENTATION === "1";
const startedAt = new Date().toISOString();
const requests = new Map();
const queries = new Map();
const eventLoopDelay = enabled ? monitorEventLoopDelay({ resolution: 20 }) : null;
if (eventLoopDelay) eventLoopDelay.enable();

export function isBenchmarkInstrumentationEnabled() {
  return enabled;
}

export function benchmarkNowMs() {
  return performance.now();
}

export function recordBenchmarkRequest(method, pathname, status, ms) {
  if (!enabled) return;
  recordBucket(requests, `${method} ${pathname} ${status}`, ms);
}

export function recordBenchmarkQuery(label, ms) {
  if (!enabled) return;
  recordBucket(queries, label, ms);
}

export function timeBenchmarkQuery(label, read) {
  if (!enabled) return read();
  const started = benchmarkNowMs();
  try {
    return read();
  } finally {
    recordBenchmarkQuery(label, benchmarkNowMs() - started);
  }
}

export function resetBenchmarkInstrumentation() {
  requests.clear();
  queries.clear();
  if (eventLoopDelay) eventLoopDelay.reset();
}

export function benchmarkInstrumentationSnapshot(extra = {}) {
  return {
    enabled,
    startedAt,
    ...extra,
    eventLoopDelay: eventLoopDelay ? histogramSnapshot(eventLoopDelay) : null,
    requests: mapSnapshot(requests),
    queries: mapSnapshot(queries),
    notes: {
      endpointLatency: "Client scripts report client-observed latency; this endpoint reports server-side request handler timing when enabled.",
      queryTiming: "Query buckets wrap repository route handlers and may include row parsing/materialization, but not JSON response serialization.",
    },
  };
}

function recordBucket(target, key, ms) {
  const elapsed = finiteMs(ms);
  const bucket = target.get(key) ?? { calls: 0, totalMs: 0, maxMs: 0, samples: [] };
  bucket.calls += 1;
  bucket.totalMs += elapsed;
  bucket.maxMs = Math.max(bucket.maxMs, elapsed);
  if (bucket.samples.length < MAX_SAMPLES_PER_BUCKET) bucket.samples.push(elapsed);
  else bucket.samples[bucket.calls % MAX_SAMPLES_PER_BUCKET] = elapsed;
  target.set(key, bucket);
}

function mapSnapshot(source) {
  return Object.fromEntries([...source.entries()].map(([key, bucket]) => [key, bucketSnapshot(bucket)]));
}

function bucketSnapshot(bucket) {
  const samples = [...bucket.samples].sort((left, right) => left - right);
  return {
    calls: bucket.calls,
    totalMs: round(bucket.totalMs),
    averageMs: round(bucket.calls > 0 ? bucket.totalMs / bucket.calls : 0),
    p50Ms: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
    maxMs: round(bucket.maxMs),
    sampleCount: samples.length,
  };
}

function histogramSnapshot(histogram) {
  return {
    minMs: round(nanosToMs(histogram.min)),
    meanMs: round(nanosToMs(histogram.mean)),
    maxMs: round(nanosToMs(histogram.max)),
    stddevMs: round(nanosToMs(histogram.stddev)),
    p50Ms: round(nanosToMs(histogram.percentile(50))),
    p95Ms: round(nanosToMs(histogram.percentile(95))),
    p99Ms: round(nanosToMs(histogram.percentile(99))),
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function nanosToMs(value) {
  return Number.isFinite(value) ? value / 1_000_000 : 0;
}

function finiteMs(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function round(value) {
  return Number(value.toFixed(3));
}
