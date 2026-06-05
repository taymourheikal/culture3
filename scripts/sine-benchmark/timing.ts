import { round } from "./cli";

export type TimingBucket = {
  calls: number;
  totalMs: number;
  maxMs: number;
  count: number;
};

export type MetricBucket = {
  samples: number[];
  total: number;
  max: number;
};

export function recordTiming(target: Map<string, TimingBucket>, key: string, ms: number, count = 1) {
  const elapsed = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const bucket = target.get(key) ?? { calls: 0, totalMs: 0, maxMs: 0, count: 0 };
  bucket.calls += 1;
  bucket.totalMs += elapsed;
  bucket.maxMs = Math.max(bucket.maxMs, elapsed);
  bucket.count += Math.max(0, Math.floor(count));
  target.set(key, bucket);
}

export function recordMetric(target: Map<string, MetricBucket>, key: string, value: number) {
  if (!Number.isFinite(value)) return;
  const bucket = target.get(key) ?? { samples: [], total: 0, max: Number.NEGATIVE_INFINITY };
  bucket.samples.push(value);
  bucket.total += value;
  bucket.max = Math.max(bucket.max, value);
  target.set(key, bucket);
}

export function benchmarkTimingSummary(source: Map<string, TimingBucket>, ticks: number) {
  return Object.fromEntries(
    sortedTimingEntries(source).map(([key, bucket]) => [
      key,
      {
        calls: bucket.calls,
        count: bucket.count,
        totalMs: round(bucket.totalMs),
        msPerTick: round(bucket.totalMs / Math.max(1, ticks)),
        msPerCall: round(bucket.totalMs / Math.max(1, bucket.calls)),
        msPerCount: round(bucket.totalMs / Math.max(1, bucket.count)),
        maxMs: round(bucket.maxMs),
      },
    ]),
  );
}

export function basicTimingSummary(source: Map<string, TimingBucket>) {
  return Object.fromEntries(
    sortedTimingEntries(source).map(([key, bucket]) => [
      key,
      {
        calls: bucket.calls,
        count: bucket.count,
        totalMs: round(bucket.totalMs),
        averageMs: round(bucket.totalMs / Math.max(1, bucket.calls)),
        maxMs: round(bucket.maxMs),
      },
    ]),
  );
}

export function topTimingBuckets(source: Map<string, TimingBucket>, limit: number) {
  return sortedTimingEntries(source)
    .slice(0, limit)
    .map(([phase, bucket]) => ({ phase, totalMs: round(bucket.totalMs), calls: bucket.calls, count: bucket.count }));
}

export function metricSummary(source: Map<string, MetricBucket>) {
  return Object.fromEntries(
    [...source.entries()].map(([key, bucket]) => {
      const sorted = [...bucket.samples].sort((left, right) => left - right);
      return [
        key,
        {
          samples: bucket.samples.length,
          total: round(bucket.total),
          average: round(bucket.total / Math.max(1, bucket.samples.length)),
          p50: round(percentile(sorted, 0.5)),
          p95: round(percentile(sorted, 0.95)),
          max: round(bucket.max),
        },
      ];
    }),
  );
}

export function percentile(sorted: number[], fraction: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

export function samplePercentile(samples: number[], fraction: number) {
  return percentile([...samples].sort((left, right) => left - right), fraction);
}

export function summarizeSamples(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: sorted.length,
    totalMs: round(total),
    averageMs: round(total / Math.max(1, sorted.length)),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

function sortedTimingEntries(source: Map<string, TimingBucket>) {
  return [...source.entries()].sort(([, left], [, right]) => right.totalMs - left.totalMs);
}
