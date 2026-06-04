import { randomUUID } from "node:crypto";
import { getMarketCandles } from "./marketDataRepository.mjs";
import { createSineHeadlessRepository } from "./sineHeadlessRepository.mjs";
import { runHeadlessSineExperiment } from "../src/sine/headless/runner.ts";
import { sanitizeMarketRuntimeConfig, isBtcSource } from "../src/sine/marketRuntimeConfig.ts";
import { sanitizeSpawnerConfig } from "../src/sine/spawnerSettingsStorage.ts";

let activeJob = null;
const DEFAULT_JOB_CHUNK_TICKS = 25;
const MAX_JOB_CHUNK_TICKS = 100;

export function hasActiveSineHeadlessJob() {
  return activeJob !== null && !isTerminalStatus(activeJob.status);
}

export function getActiveSineHeadlessJob() {
  return activeJob ? serializeJob(activeJob) : null;
}

export function getSineHeadlessJob(runId) {
  if (activeJob?.runId === runId) return { job: serializeJob(activeJob), active: true };
  const repository = createSineHeadlessRepository();
  try {
    const run = repository.getRun(runId);
    if (!run) return null;
    return {
      run,
      checkpoints: repository.listRunCheckpoints(runId),
      counts: repository.counts(runId),
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
    return {
      run,
      checkpoints: repository.listRunCheckpoints(run.id),
      counts: repository.counts(run.id),
      active: false,
    };
  } finally {
    repository.close();
  }
}

export function startSineHeadlessJob(options) {
  if (hasActiveSineHeadlessJob()) {
    return { ok: false, status: 409, error: "Another Sine headless run is already active" };
  }

  const job = {
    runId: options.runId || randomUUID(),
    status: "running",
    targetTicks: options.ticks,
    tick: 0,
    checkpointIntervalTicks: options.checkpointIntervalTicks,
    minimumResolvedTrades: options.minimumResolvedTrades,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    cancelRequested: false,
    latestCheckpoint: null,
    population: null,
    error: null,
    terminationReason: null,
    timing: null,
  };
  activeJob = job;
  void runJob(job, options);
  return { ok: true, job: serializeJob(job) };
}

export function cancelSineHeadlessJob(runId) {
  if (!activeJob || activeJob.runId !== runId) return null;
  activeJob.cancelRequested = true;
  activeJob.status = "cancel_requested";
  activeJob.updatedAt = new Date().toISOString();
  return serializeJob(activeJob);
}

async function runJob(job, options) {
  const repository = createSineHeadlessRepository(options.dbPath);
  let marketConfig = null;
  let spawnerConfig = null;
  try {
    marketConfig = sanitizeMarketRuntimeConfig(options.marketConfig);
    spawnerConfig = sanitizeSpawnerConfig(options.spawnerConfig);
    const result = await runHeadlessSineExperiment({
      runId: job.runId,
      ticks: options.ticks,
      seed: options.seed,
      marketConfig,
      spawnerConfig,
      minimumResolvedTrades: options.minimumResolvedTrades,
      sink: repository.sink,
      candleLoader: isBtcSource(marketConfig.source) ? repositoryCandleLoader : undefined,
      checkpointIntervalTicks: options.checkpointIntervalTicks,
      chunkTicks: options.chunkTicks,
      shouldCancel: () => job.cancelRequested,
      onCheckpoint: (checkpoint) => {
        job.tick = checkpoint.tick;
        job.population = checkpoint.population;
        job.latestCheckpoint = checkpoint;
        job.updatedAt = new Date().toISOString();
      },
      onProgress: (progress) => {
        job.tick = progress.tick;
        job.population = progress.population;
        job.timing = progress.timing ?? null;
        job.updatedAt = progress.createdAt;
      },
    });
    job.tick = result.tick;
    job.status = result.status;
    job.terminationReason = result.terminationReason;
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
  } catch (error) {
    if (marketConfig && spawnerConfig && !repository.getRun(job.runId)) {
      const now = new Date().toISOString();
      repository.sink.writeRunStart({
        id: job.runId,
        createdAt: job.createdAt ?? now,
        status: "running",
        seed: Number.isFinite(options.seed) ? Math.floor(Number(options.seed)) : 101,
        tick: job.tick ?? 0,
        targetTicks: options.ticks,
        checkpointIntervalTicks: options.checkpointIntervalTicks,
        marketSource: marketConfig.source,
        minimumResolvedTrades: Math.max(0, Math.floor(options.minimumResolvedTrades ?? 0)),
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
    }
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.terminationReason = "error";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
  } finally {
    repository.close();
    if (activeJob === job) activeJob = null;
  }
}

function serializeJob(job) {
  return {
    runId: job.runId,
    status: job.status,
    targetTicks: job.targetTicks,
    tick: job.tick,
    checkpointIntervalTicks: job.checkpointIntervalTicks,
    minimumResolvedTrades: job.minimumResolvedTrades,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    cancelRequested: job.cancelRequested,
    latestCheckpoint: job.latestCheckpoint,
    population: job.population,
    error: job.error,
    terminationReason: job.terminationReason,
    timing: job.timing ?? undefined,
    active: activeJob === job,
  };
}

function isTerminalStatus(status) {
  return status === "completed" || status === "cancelled" || status === "failed";
}

function repositoryCandleLoader(config, start, limit) {
  const result = getMarketCandles({
    source: config.source,
    start,
    limit,
    rocLength: config.playback.rocLengthBars,
  });
  if (!result.ok) throw new Error(result.error ?? `Could not load candles for ${config.source}`);
  return {
    candles: result.candles,
    snappedStartTimestamp: result.snappedStartTimestamp,
    snappedStartDatetime: result.snappedStartDatetime,
  };
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
    checkpointIntervalTicks: readInteger(record.checkpointIntervalTicks, 10000, 1),
    chunkTicks: Math.min(MAX_JOB_CHUNK_TICKS, readInteger(record.chunkTicks, DEFAULT_JOB_CHUNK_TICKS, 1)),
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
