import { randomUUID } from "node:crypto";

type CliOptions = {
  baseUrl: string;
  ticks: number;
  seed: number;
  initialSpawners: number;
  maxSpawners: number;
  chunkTicks: number;
  checkpointIntervalTicks: number;
  minimumResolvedTrades: number;
  pollIntervalMs: number;
  statusIntervalMs: number;
};

type LatencyBucket = {
  samples: number[];
};

type RunMode = "minimalStatusPolling" | "activeEndpointPolling";

const options = parseArgs(process.argv.slice(2));
const baseUrl = options.baseUrl.replace(/\/$/, "");

await assertServerReady();
const initialBenchmark = await readBenchmarkTiming();
await resetBenchmarkTiming();
const active = await getActiveJob();
if (active?.job) throw new Error(`A headless job is already active: ${active.job.runId}`);

const idleLatency = await measureIdleLatency();
const minimal = await runBenchmarkPass("minimalStatusPolling");
const polled = await runBenchmarkPass("activeEndpointPolling", minimal.runId);
const finalBenchmark = await readBenchmarkTiming();

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      dbIsolation: {
        benchmarkInstrumentationEnabled: !!initialBenchmark?.enabled,
        headlessDbPath: initialBenchmark?.headlessDbPath ?? finalBenchmark?.headlessDbPath ?? null,
        productionDbWarning: initialBenchmark?.enabled
          ? null
          : "Server benchmark instrumentation is disabled; if this server uses the default DB, benchmark runs were written to the production headless DB.",
      },
      settings: {
        ticks: options.ticks,
        seed: options.seed,
        initialSpawners: options.initialSpawners,
        maxSpawners: options.maxSpawners,
        chunkTicks: options.chunkTicks,
        checkpointIntervalTicks: options.checkpointIntervalTicks,
        minimumResolvedTrades: options.minimumResolvedTrades,
        pollIntervalMs: options.pollIntervalMs,
        statusIntervalMs: options.statusIntervalMs,
      },
      idleLatency,
      runs: [minimal, polled],
      comparison: {
        ticksPerSecondDelta: round(polled.ticksPerSecond - minimal.ticksPerSecond),
        activePollingSlowdownRatio: minimal.ticksPerSecond > 0 ? round(polled.ticksPerSecond / minimal.ticksPerSecond) : null,
      },
      serverBenchmarkTiming: finalBenchmark,
    },
    null,
    2,
  ),
);

async function measureIdleLatency() {
  const latencies = new Map<string, LatencyBucket>();
  await fetchJson("/api/health", undefined, latencies, "IDLE GET /api/health");
  await fetchJson("/api/sine/headless/runs/active", undefined, latencies, "IDLE GET /api/sine/headless/runs/active");
  await fetchJson("/api/sine/headless/runs/latest", undefined, latencies, "IDLE GET /api/sine/headless/runs/latest");
  return summarizeLatencies(latencies);
}

async function runBenchmarkPass(mode: RunMode, comparisonRunId?: string) {
  const runId = `benchmark-api-${mode}-${randomUUID()}`;
  const latencies = new Map<string, LatencyBucket>();
  const started = performance.now();
  await fetchJson("/api/sine/headless/runs", {
    method: "POST",
    body: JSON.stringify({
      runId,
      ticks: options.ticks,
      seed: options.seed,
      spawnerConfig: {
        initialSpawners: options.initialSpawners,
        maxSpawners: options.maxSpawners,
      },
      minimumResolvedTrades: options.minimumResolvedTrades,
      chunkTicks: options.chunkTicks,
      checkpointIntervalTicks: options.checkpointIntervalTicks,
    }),
    headers: { "Content-Type": "application/json" },
  }, latencies, "POST /api/sine/headless/runs");

  let lastTick = 0;
  let population = 0;
  while (true) {
    if (mode === "activeEndpointPolling") {
      await fetchJson("/api/health", undefined, latencies, "GET /api/health");
      const active = await fetchJson("/api/sine/headless/runs/active", undefined, latencies, "GET /api/sine/headless/runs/active");
      await fetchJson("/api/sine/headless/runs/latest", undefined, latencies, "GET /api/sine/headless/runs/latest");
      if (comparisonRunId) await fetchAnalysisEndpoints(comparisonRunId, latencies, "active");
      await fetchJson("/api/benchmark/timing").catch(() => null);
      lastTick = Number(active?.job?.tick ?? lastTick);
      population = Number(active?.job?.population ?? population);
      if (!active?.job) break;
      await sleep(options.pollIntervalMs);
    } else {
      await sleep(options.statusIntervalMs);
      const active = await fetchJson("/api/sine/headless/runs/active", undefined, latencies, "GET /api/sine/headless/runs/active");
      lastTick = Number(active?.job?.tick ?? lastTick);
      population = Number(active?.job?.population ?? population);
      if (!active?.job) break;
    }
  }

  const elapsedMs = performance.now() - started;
  const final = await fetchJson(`/api/sine/headless/runs/${encodeURIComponent(runId)}`, undefined, latencies, "GET /api/sine/headless/runs/:id");
  await fetchAnalysisEndpoints(runId, latencies, "idle");
  const finalTick = Number(final?.run?.tick ?? lastTick);
  const serverRunMs = runDurationMs(final?.run);
  return {
    mode,
    runId,
    clientElapsedMs: round(elapsedMs),
    serverRunMs: serverRunMs === null ? null : round(serverRunMs),
    finalTick,
    population: Number(final?.run?.population ?? population),
    status: final?.run?.status ?? null,
    terminationReason: final?.run?.terminationReason ?? null,
    ticksPerSecond: serverRunMs && serverRunMs > 0 ? round((finalTick / serverRunMs) * 1000) : elapsedMs > 0 ? round((finalTick / elapsedMs) * 1000) : 0,
    clientTicksPerSecond: elapsedMs > 0 ? round((finalTick / elapsedMs) * 1000) : 0,
    clientLatency: summarizeLatencies(latencies),
  };
}

function runDurationMs(run: Record<string, unknown> | null | undefined) {
  const created = readDateMs(run?.createdAt ?? run?.created_at);
  const completed = readDateMs(run?.completedAt ?? run?.completed_at);
  if (created === null || completed === null || completed < created) return null;
  return completed - created;
}

function readDateMs(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

async function fetchAnalysisEndpoints(runId: string, latencies: Map<string, LatencyBucket>, mode: "active" | "idle") {
  const prefix = mode === "active" ? "ACTIVE " : "IDLE ";
  const agents = await fetchJson(
    `/api/sine/headless/runs/${encodeURIComponent(runId)}/analysis/agents?limit=10`,
    undefined,
    latencies,
    `${prefix}GET /api/sine/headless/runs/:id/analysis/agents`,
  );
  await fetchJson(
    `/api/sine/headless/runs/${encodeURIComponent(runId)}/analysis/lineages?limit=10`,
    undefined,
    latencies,
    `${prefix}GET /api/sine/headless/runs/:id/analysis/lineages`,
  );
  const spawnerId = Number(agents?.rows?.[0]?.spawnerId ?? 0);
  if (spawnerId > 0) {
    await fetchJson(
      `/api/sine/headless/runs/${encodeURIComponent(runId)}/analysis/agents/${spawnerId}?tradeLimit=25`,
      undefined,
      latencies,
      `${prefix}GET /api/sine/headless/runs/:id/analysis/agents/:spawnerId`,
    );
  }
  await fetchJson(
    `/api/sine/headless/runs/${encodeURIComponent(runId)}/analysis/trades`,
    undefined,
    latencies,
    `${prefix}GET /api/sine/headless/runs/:id/analysis/trades`,
  );
  await fetchJson(
    `/api/sine/headless/runs/${encodeURIComponent(runId)}/analysis/events?interval=10`,
    undefined,
    latencies,
    `${prefix}GET /api/sine/headless/runs/:id/analysis/events`,
  );
}

async function assertServerReady() {
  await fetchJson("/api/health");
}

async function getActiveJob() {
  return fetchJson("/api/sine/headless/runs/active");
}

async function readBenchmarkTiming() {
  const result = await fetchJson("/api/benchmark/timing").catch(() => null);
  return result?.benchmark ?? null;
}

async function resetBenchmarkTiming() {
  await fetchJson("/api/benchmark/timing/reset", { method: "POST" }).catch(() => null);
}

async function fetchJson(path: string, init?: RequestInit, latencies?: Map<string, LatencyBucket>, label = `${init?.method ?? "GET"} ${path}`) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const elapsedMs = performance.now() - started;
  if (latencies) recordLatency(latencies, label, elapsedMs);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${label} failed with ${response.status}: ${text}`);
  return payload;
}

function summarizeLatencies(latencies: Map<string, LatencyBucket>) {
  return Object.fromEntries([...latencies.entries()].map(([key, bucket]) => [key, summarizeSamples(bucket.samples)]));
}

function summarizeSamples(samples: number[]) {
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

function recordLatency(latencies: Map<string, LatencyBucket>, label: string, ms: number) {
  const bucket = latencies.get(label) ?? { samples: [] };
  bucket.samples.push(ms);
  latencies.set(label, bucket);
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values.set(key, next);
    index += 1;
  }
  const initialSpawners = readInteger(values.get("initial-spawners") ?? "100", "--initial-spawners", 1);
  return {
    baseUrl: values.get("base-url") ?? "http://127.0.0.1:8787",
    ticks: readInteger(values.get("ticks") ?? "500", "--ticks", 1),
    seed: readInteger(values.get("seed") ?? "101", "--seed", 0),
    initialSpawners,
    maxSpawners: readInteger(values.get("max-spawners") ?? String(initialSpawners), "--max-spawners", 1),
    chunkTicks: readInteger(values.get("chunk-ticks") ?? "25", "--chunk-ticks", 1),
    checkpointIntervalTicks: readInteger(values.get("checkpoint-interval-ticks") ?? "100", "--checkpoint-interval-ticks", 1),
    minimumResolvedTrades: readInteger(values.get("minimum-resolved-trades") ?? "1", "--minimum-resolved-trades", 0),
    pollIntervalMs: readInteger(values.get("poll-interval-ms") ?? "250", "--poll-interval-ms", 1),
    statusIntervalMs: readInteger(values.get("status-interval-ms") ?? "1000", "--status-interval-ms", 1),
  };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function readInteger(value: string, label: string, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
