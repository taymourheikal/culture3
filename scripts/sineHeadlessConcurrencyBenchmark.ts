import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG } from "../src/sine/spawnerSimulation";
import { parseFlagArgs, readIntegerOption } from "./sine-benchmark/cli";
import { samplePercentile } from "./sine-benchmark/timing";

type Options = {
  baseUrl: string;
  concurrency: number;
  ticks: number;
  population: number;
  checkpointIntervalTicks: number;
  chunkTicks: number;
  seed: number;
  out: string | null;
  cancelAfterMs: number | null;
};

type LatencySample = {
  label: string;
  ms: number;
};

type ActiveJob = {
  runId: string;
  tick: number;
  timing?: {
    latestChunk?: {
      ticksPerSecond?: number;
      sinkWriteMs?: number;
      sinkFlushMs?: number;
      simulationCoreEstimateMs?: number;
    };
    topSinkMethod?: { method: string; ms: number; calls: number };
  };
};

const options = parseArgs(process.argv.slice(2));
const startedAt = new Date().toISOString();
const runIds = Array.from({ length: options.concurrency }, (_, index) => `m12-concurrency-${Date.now()}-${index + 1}`);
const latencies: LatencySample[] = [];
const runStartedMs = new Map<string, number>();
const runCompletedMs = new Map<string, number>();
const lastTimingByRun = new Map<string, ActiveJob["timing"]>();
let cancelRunId: string | null = null;
let cancelRequestedMs: number | null = null;
let cancelSettledMs: number | null = null;

for (const [index, runId] of runIds.entries()) {
  await postJson("/api/sine/headless/runs", {
    runId,
    ticks: options.ticks,
    seed: options.seed + index,
    marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
    spawnerConfig: {
      ...DEFAULT_SPAWNER_CONFIG,
      initialSpawners: options.population,
      maxSpawners: options.population,
    },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: options.checkpointIntervalTicks,
    chunkTicks: options.chunkTicks,
  });
  runStartedMs.set(runId, performance.now());
}

while (runCompletedMs.size < runIds.length) {
  const active = await getJson<{ jobs: ActiveJob[] }>("/api/sine/headless/runs/active-list", "active-list");
  const activeIds = new Set(active.jobs.map((job) => job.runId));
  for (const job of active.jobs) {
    if (job.timing) lastTimingByRun.set(job.runId, job.timing);
  }
  if (options.cancelAfterMs !== null && cancelRunId === null && performance.now() - Math.min(...runStartedMs.values()) >= options.cancelAfterMs) {
    cancelRunId = runIds[0] ?? null;
    if (cancelRunId) {
      cancelRequestedMs = performance.now();
      await postJson(`/api/sine/headless/runs/${encodeURIComponent(cancelRunId)}/cancel`, {});
    }
  }
  for (const runId of runIds) {
    if (!activeIds.has(runId) && !runCompletedMs.has(runId)) {
      runCompletedMs.set(runId, performance.now());
      if (runId === cancelRunId && cancelRequestedMs !== null) cancelSettledMs = performance.now();
    }
  }
  if (runCompletedMs.size < runIds.length) {
    await getJson("/api/health", "health");
    await sleep(100);
  }
}

const runs = [];
for (const runId of runIds) {
  const final = await getJson<{ run?: { id: string; status: string; tick: number }; counts?: { trades: number; checkpoints: number } }>(
    `/api/sine/headless/runs/${encodeURIComponent(runId)}`,
    "final-run",
  );
  const started = runStartedMs.get(runId) ?? 0;
  const completed = runCompletedMs.get(runId) ?? started;
  runs.push({
    runId,
    status: final.run?.status ?? "missing",
    tick: final.run?.tick ?? 0,
    wallMs: completed - started,
    ticksPerSecond: (final.run?.tick ?? 0) / Math.max(0.001, (completed - started) / 1000),
    counts: final.counts ?? null,
    lastTiming: lastTimingByRun.get(runId) ?? null,
  });
}

const totalTicks = runs.reduce((sum, run) => sum + run.tick, 0);
const totalWallMs = Math.max(...runCompletedMs.values()) - Math.min(...runStartedMs.values());
const report = {
  startedAt,
  completedAt: new Date().toISOString(),
  options,
  aggregate: {
    totalTicks,
    totalWallMs,
    aggregateTicksPerSecond: totalTicks / Math.max(0.001, totalWallMs / 1000),
    apiP95Ms: samplePercentile(latencies.map((sample) => sample.ms), 0.95),
    apiMaxMs: Math.max(0, ...latencies.map((sample) => sample.ms)),
    cancelLatencyMs: cancelRequestedMs !== null && cancelSettledMs !== null ? cancelSettledMs - cancelRequestedMs : null,
  },
  latencyByLabel: summarizeLatencies(latencies),
  runs,
};

const json = JSON.stringify(report, null, 2);
if (options.out) writeFileSync(options.out, `${json}\n`);
console.log(json);

async function getJson<T>(path: string, label = path): Promise<T> {
  return requestJson<T>(path, undefined, label);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    path,
  );
}

async function requestJson<T>(path: string, init: RequestInit | undefined, label: string): Promise<T> {
  const started = performance.now();
  const response = await fetch(new URL(path, options.baseUrl), init);
  latencies.push({ label, ms: performance.now() - started });
  if (!response.ok) throw new Error(`${path} failed ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

function parseArgs(args: string[]): Options {
  const raw = parseFlagArgs(args);
  return {
    baseUrl: raw.get("base-url") ?? "http://127.0.0.1:8787",
    concurrency: readIntegerOption(raw, "concurrency", 1, 1),
    ticks: readIntegerOption(raw, "ticks", 500, 0),
    population: readIntegerOption(raw, "population", 100, 1),
    checkpointIntervalTicks: readIntegerOption(raw, "checkpoint-interval", 100, 1),
    chunkTicks: readIntegerOption(raw, "chunk", 100, 1),
    seed: readIntegerOption(raw, "seed", 101, 0),
    out: raw.get("out") ?? null,
    cancelAfterMs: raw.has("cancel-after-ms") ? readIntegerOption(raw, "cancel-after-ms", 0, 0) : null,
  };
}

function summarizeLatencies(samples: LatencySample[]) {
  const groups = new Map<string, number[]>();
  for (const sample of samples) {
    const group = groups.get(sample.label) ?? [];
    group.push(sample.ms);
    groups.set(sample.label, group);
  }
  return [...groups.entries()].map(([label, values]) => ({
    label,
    count: values.length,
    p95Ms: samplePercentile(values, 0.95),
    maxMs: Math.max(0, ...values),
  }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
