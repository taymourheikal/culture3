import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { createSineHeadlessRepository } from "./sineHeadlessRepository.mjs";
import { maxConcurrentSineHeadlessJobs } from "./sineHeadlessConcurrency.mjs";
import { sanitizeHeadlessChunkTicks } from "../src/sine/headless/chunkPolicy.ts";
import { DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL } from "../src/sine/headless/types.ts";
import { sanitizeMarketRuntimeConfig } from "../src/sine/marketRuntimeConfig.ts";
import { sanitizeSpawnerConfig } from "../src/sine/spawnerSettingsStorage.ts";

const activeJobs = new Map();

export function hasActiveSineHeadlessJob() {
  return activeJobs.size > 0;
}

export function getActiveSineHeadlessJob() {
  const job = firstActiveJob();
  return job ? serializeJob(job) : null;
}

export function listActiveSineHeadlessJobs() {
  return [...activeJobs.values()].map(serializeJob);
}

export function getSineHeadlessJobCapacity() {
  const maxConcurrentRuns = maxConcurrentSineHeadlessJobs();
  return {
    activeCount: activeJobs.size,
    maxConcurrentRuns,
    capacityFull: activeJobs.size >= maxConcurrentRuns,
  };
}

export function getSineHeadlessJob(runId) {
  const activeJob = activeJobs.get(runId);
  if (activeJob) return { job: serializeJob(activeJob), active: true };
  const repository = createSineHeadlessRepository();
  try {
    const run = repository.getRun(runId);
    if (!run) return null;
    const analysisContext = repository.createRunAnalysisContext(runId);
    return {
      run,
      checkpoints: analysisContext.listRunCheckpoints(),
      counts: analysisContext.counts(),
      active: false,
    };
  } finally {
    repository.close();
  }
}

export function getLatestSineHeadlessRun() {
  const repository = createSineHeadlessRepository();
  try {
    const run = repository.getLatestRun();
    if (!run) return null;
    const analysisContext = repository.createRunAnalysisContext(run.id);
    return {
      run,
      checkpoints: analysisContext.listRunCheckpoints(),
      counts: analysisContext.counts(),
      active: false,
    };
  } finally {
    repository.close();
  }
}

export function startSineHeadlessJob(options) {
  const activeCapacity = maxConcurrentSineHeadlessJobs();
  if (activeJobs.size >= activeCapacity) {
    return { ok: false, status: 409, error: `Sine headless run capacity is full (${activeJobs.size}/${activeCapacity})` };
  }

  const chunkTicks = sanitizeHeadlessChunkTicks(options.chunkTicks, "interactive");
  const runId = options.runId || randomUUID();
  const createdAt = new Date().toISOString();
  const job = {
    runId,
    status: "running",
    targetTicks: options.ticks,
    tick: 0,
    checkpointIntervalTicks: options.checkpointIntervalTicks,
    chunkTicks,
    minimumResolvedTrades: options.minimumResolvedTrades,
    resolvedTradeSnapshotInterval: options.resolvedTradeSnapshotInterval,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cancelRequested: false,
    latestCheckpoint: null,
    population: null,
    error: null,
    terminationReason: null,
    timing: null,
    worker: null,
    settled: false,
    options: { ...options, runId, chunkTicks, createdAt, assumeInitializedDb: true },
  };
  activeJobs.set(runId, job);
  try {
    startIsolatedJob(job);
  } catch (error) {
    activeJobs.delete(runId);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { ok: true, job: serializeJob(job) };
}

export function cancelSineHeadlessJob(runId) {
  const job = activeJobs.get(runId);
  if (!job) return null;
  job.cancelRequested = true;
  job.status = "cancel_requested";
  job.updatedAt = new Date().toISOString();
  job.worker?.postMessage({ type: "cancel", runId });
  return serializeJob(job);
}

function startIsolatedJob(job) {
  const worker = new Worker(new URL("./sineHeadlessJobWorker.mjs", import.meta.url), {
    workerData: {
      options: job.options,
      diagnostics: {
        strictDigest: false,
      },
    },
  });
  job.worker = worker;
  worker.on("message", (message) => handleWorkerMessage(job, message));
  worker.on("error", (error) => failJobFromParent(job, error));
  worker.on("exit", (code) => {
    if (code !== 0 && !job.settled) failJobFromParent(job, new Error(`Headless worker exited with code ${code}`));
    if (job.settled) activeJobs.delete(job.runId);
  });
}

function handleWorkerMessage(job, message) {
  if (!message || message.runId !== job.runId) return;
  if (message.type === "checkpoint") {
    const checkpoint = message.checkpoint;
    job.tick = checkpoint.tick;
    job.population = checkpoint.population;
    job.latestCheckpoint = checkpoint;
    job.updatedAt = new Date().toISOString();
    return;
  }
  if (message.type === "progress") {
    const progress = message.progress;
    job.tick = progress.tick;
    job.population = progress.population;
    job.timing = progress.timing ?? null;
    job.updatedAt = progress.createdAt;
    return;
  }
  if (message.type === "result") {
    job.tick = message.tick;
    job.status = message.status;
    job.terminationReason = message.terminationReason;
    job.timing = message.timing ?? job.timing;
    job.strictDigest = message.strictDigest;
    completeJob(job);
    return;
  }
  if (message.type === "error") {
    job.tick = message.tick ?? job.tick;
    failJobFromParent(job, new Error(message.error ?? "Headless worker failed"));
  }
}

function completeJob(job) {
  job.settled = true;
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;
  activeJobs.delete(job.runId);
}

function failJobFromParent(job, error) {
  if (job.settled) return;
  writeFailedRunFallback(job, error);
  job.settled = true;
  job.status = "failed";
  job.error = error instanceof Error ? error.message : String(error);
  job.terminationReason = "error";
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;
  activeJobs.delete(job.runId);
}

function writeFailedRunFallback(job, error) {
  const repository = createSineHeadlessRepository();
  try {
    if (repository.getRun(job.runId)) {
      repository.sink.writeRunCompletion({
        id: job.runId,
        completedAt: new Date().toISOString(),
        status: "failed",
        tick: job.tick ?? 0,
        terminationReason: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const marketConfig = sanitizeMarketRuntimeConfig(job.options.marketConfig);
    const spawnerConfig = sanitizeSpawnerConfig(job.options.spawnerConfig);
    const now = new Date().toISOString();
    repository.sink.writeRunStart({
      id: job.runId,
      createdAt: job.createdAt ?? now,
      status: "running",
      seed: Number.isFinite(job.options.seed) ? Math.floor(Number(job.options.seed)) : 101,
      tick: job.tick ?? 0,
      targetTicks: job.options.ticks,
      checkpointIntervalTicks: job.options.checkpointIntervalTicks,
      marketSource: marketConfig.source,
      minimumResolvedTrades: Math.max(0, Math.floor(job.options.minimumResolvedTrades ?? 0)),
      marketConfig,
      spawnerConfig,
    });
    repository.sink.writeRunCompletion({
      id: job.runId,
      completedAt: now,
      status: "failed",
      tick: job.tick ?? 0,
      terminationReason: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    repository.close();
  }
}

function serializeJob(job) {
  return {
    runId: job.runId,
    status: job.status,
    targetTicks: job.targetTicks,
    tick: job.tick,
    checkpointIntervalTicks: job.checkpointIntervalTicks,
    chunkTicks: job.chunkTicks,
    minimumResolvedTrades: job.minimumResolvedTrades,
    resolvedTradeSnapshotInterval: job.resolvedTradeSnapshotInterval,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    cancelRequested: job.cancelRequested,
    latestCheckpoint: job.latestCheckpoint,
    population: job.population,
    error: job.error,
    terminationReason: job.terminationReason,
    timing: job.timing ?? undefined,
    active: activeJobs.has(job.runId),
  };
}

function firstActiveJob() {
  return [...activeJobs.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;
}

export function sanitizeSineHeadlessJobOptions(payload) {
  const record = isRecord(payload) ? payload : {};
  const runId = typeof record.runId === "string" && record.runId.trim() ? record.runId.trim() : randomUUID();
  return {
    runId,
    ticks: readInteger(record.ticks, 1000, 0),
    seed: readInteger(record.seed, 101, 0),
    marketConfig: sanitizeMarketRuntimeConfig(record.marketConfig),
    spawnerConfig: sanitizeSpawnerConfig(isRecord(record.spawnerConfig) ? record.spawnerConfig : {}),
    minimumResolvedTrades: readInteger(record.minimumResolvedTrades, 10, 0),
    resolvedTradeSnapshotInterval: readInteger(record.resolvedTradeSnapshotInterval, DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL, 0),
    checkpointIntervalTicks: readInteger(record.checkpointIntervalTicks, 10000, 1),
    chunkTicks: sanitizeHeadlessChunkTicks(record.chunkTicks, "interactive"),
  };
}

function readInteger(value, fallback, min) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
