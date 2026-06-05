import { parentPort, workerData } from "node:worker_threads";
import { getMarketCandles } from "./marketDataRepository.mjs";
import { createSineHeadlessRepository } from "./sineHeadlessRepository.mjs";
import { runHeadlessSineExperiment } from "../src/sine/headless/runner.ts";
import { sanitizeMarketRuntimeConfig, isBtcSource } from "../src/sine/marketRuntimeConfig.ts";
import { sanitizeSpawnerConfig } from "../src/sine/spawnerSettingsStorage.ts";
import { strictWorldDigest } from "../src/sine/testing/strictWorldDigest.ts";

const options = workerData?.options ?? {};
const runId = String(options.runId ?? "");
const diagnostics = workerData?.diagnostics ?? {};
let cancelRequested = false;

parentPort?.on("message", (message) => {
  if (message?.type !== "cancel") return;
  if (String(message.runId ?? "") !== runId) return;
  cancelRequested = true;
});

void runIsolatedJob();

async function runIsolatedJob() {
  const repository = createSineHeadlessRepository();
  let marketConfig = null;
  let spawnerConfig = null;
  try {
    marketConfig = sanitizeMarketRuntimeConfig(options.marketConfig);
    spawnerConfig = sanitizeSpawnerConfig(options.spawnerConfig);
    const result = await runHeadlessSineExperiment({
      runId,
      ticks: options.ticks,
      seed: options.seed,
      marketConfig,
      spawnerConfig,
      minimumResolvedTrades: options.minimumResolvedTrades,
      resolvedTradeSnapshotInterval: options.resolvedTradeSnapshotInterval,
      sink: repository.sink,
      candleLoader: isBtcSource(marketConfig.source) ? repositoryCandleLoader : undefined,
      checkpointIntervalTicks: options.checkpointIntervalTicks,
      chunkTicks: options.chunkTicks,
      shouldCancel: () => cancelRequested,
      onCheckpoint: (checkpoint) => {
        post({
          type: "checkpoint",
          runId,
          checkpoint,
        });
      },
      onProgress: (progress) => {
        post({
          type: "progress",
          runId,
          progress,
        });
      },
    });
    post({
      type: "result",
      runId,
      tick: result.tick,
      status: result.status,
      terminationReason: result.terminationReason,
      timing: result.timing,
      strictDigest: diagnostics.strictDigest ? strictWorldDigest(result.simulation.world) : undefined,
    });
  } catch (error) {
    writeFailedRunFallback(repository, marketConfig, spawnerConfig, error);
    post({
      type: "error",
      runId,
      tick: Number.isFinite(options.tick) ? Math.floor(Number(options.tick)) : 0,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    repository.close();
    parentPort?.close();
  }
}

function post(message) {
  parentPort?.postMessage(message);
}

function writeFailedRunFallback(repository, marketConfig, spawnerConfig, error) {
  if (!marketConfig || !spawnerConfig || repository.getRun(runId)) return;
  const now = new Date().toISOString();
  repository.sink.writeRunStart({
    id: runId,
    createdAt: typeof options.createdAt === "string" ? options.createdAt : now,
    status: "running",
    seed: Number.isFinite(options.seed) ? Math.floor(Number(options.seed)) : 101,
    tick: 0,
    targetTicks: options.ticks,
    checkpointIntervalTicks: options.checkpointIntervalTicks,
    marketSource: marketConfig.source,
    minimumResolvedTrades: Math.max(0, Math.floor(options.minimumResolvedTrades ?? 0)),
    marketConfig,
    spawnerConfig,
  });
  repository.sink.writeRunCompletion({
    id: runId,
    completedAt: now,
    status: "failed",
    tick: 0,
    terminationReason: "error",
    error: error instanceof Error ? error.message : String(error),
  });
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
