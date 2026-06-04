import { INITIAL_MARKET_RUNTIME_CONFIG, isBtcSource, sanitizeMarketRuntimeConfig, type MarketRuntimeConfig } from "../marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig } from "../spawnerSimulation";
import { sanitizeSpawnerConfig } from "../spawnerSettingsStorage";
import { advanceSimulationToTarget, type MarketSimulationState } from "../simulationRuntime";
import { createBufferedHeadlessRecordSink } from "./bufferedSink";
import { createHeadlessCheckpointScheduler } from "./headlessCheckpointScheduler";
import {
  createHeadlessSimulation,
  maybeLoadMoreHeadlessCandles,
  type HeadlessCandleLoader,
  type HeadlessCandleLoadResult,
} from "./headlessCandleLoader";
import { createHeadlessTimingCollector, instrumentHeadlessSink, nowMs, timeHeadlessFlush } from "./headlessTimingCollector";
import { createHeadlessRecorder } from "./recorder";
import { sourcePointForTick } from "./sourcePoint";
import type {
  HeadlessBatchRecordSink,
  HeadlessRecordSink,
  HeadlessRunCheckpointRecord,
  HeadlessRunProgressRecord,
  HeadlessRunStatus,
  HeadlessRunTerminationReason,
  HeadlessTimingSnapshot,
} from "./types";

export type { HeadlessCandleLoader, HeadlessCandleLoadResult };

export type HeadlessRunOptions = {
  runId: string;
  ticks: number;
  seed?: number;
  marketConfig?: Partial<MarketRuntimeConfig>;
  spawnerConfig?: Partial<SpawnerConfig>;
  minimumResolvedTrades: number;
  sink: HeadlessRecordSink;
  candleLoader?: HeadlessCandleLoader;
  chunkTicks?: number;
  checkpointIntervalTicks?: number;
  onCheckpoint?: (checkpoint: HeadlessRunCheckpointRecord) => void;
  onProgress?: (progress: HeadlessRunProgressRecord) => void;
  shouldCancel?: () => boolean;
};

export type HeadlessRunResult = {
  runId: string;
  tick: number;
  ended: boolean;
  status: Exclude<HeadlessRunStatus, "running">;
  terminationReason: HeadlessRunTerminationReason;
  eligibleAgentIds: number[];
  simulation: MarketSimulationState;
  timing: HeadlessTimingSnapshot;
};

const DEFAULT_HEADLESS_SEED = 101;
const DEFAULT_CHUNK_TICKS = 1000;

export async function runHeadlessSineExperiment(options: HeadlessRunOptions): Promise<HeadlessRunResult> {
  const seed = Number.isFinite(options.seed) ? Math.floor(Number(options.seed)) : DEFAULT_HEADLESS_SEED;
  const targetTick = Math.max(0, Math.floor(options.ticks));
  const chunkTicks = Math.max(1, Math.floor(options.chunkTicks ?? DEFAULT_CHUNK_TICKS));
  const checkpointIntervalTicks = Math.max(0, Math.floor(options.checkpointIntervalTicks ?? 0));
  const marketConfig = sanitizeMarketRuntimeConfig({ ...INITIAL_MARKET_RUNTIME_CONFIG, ...options.marketConfig });
  const spawnerConfig = sanitizeSpawnerConfig({ ...DEFAULT_SPAWNER_CONFIG, ...options.spawnerConfig });
  const simulation = await createHeadlessSimulation({ marketConfig, spawnerConfig, seed, candleLoader: options.candleLoader });
  const now = new Date().toISOString();
  const timing = createHeadlessTimingCollector();
  const bufferedSink = createBufferedHeadlessRecordSink(options.sink as HeadlessBatchRecordSink);
  const sink = instrumentHeadlessSink(bufferedSink.sink, timing);
  const flushBufferedSink = () => timeHeadlessFlush(timing, bufferedSink.pendingCount(), () => bufferedSink.flush());
  const recorder = createHeadlessRecorder({
    runId: options.runId,
    simulation,
    minimumResolvedTrades: options.minimumResolvedTrades,
    sink,
    timing: timing.recorder,
  });

  try {
    sink.writeRunStart({
      id: options.runId,
      createdAt: now,
      status: "running",
      seed,
      tick: simulation.world.tick,
      targetTicks: targetTick,
      checkpointIntervalTicks,
      marketSource: simulation.marketConfig.source,
      minimumResolvedTrades: Math.max(0, Math.floor(options.minimumResolvedTrades)),
      marketConfig: simulation.marketConfig,
      spawnerConfig: simulation.world.config,
    });

    recorder.attach();
    recorder.recordFounders();
    const checkpointScheduler = createHeadlessCheckpointScheduler(simulation.world.tick, checkpointIntervalTicks);

    const emitCheckpoint = (force = false) => {
      if (!checkpointScheduler.shouldEmit(simulation.world.tick, force)) return;
      const started = nowMs();
      const checkpoint = createCheckpoint({
        runId: options.runId,
        simulation,
        summary: recorder.summary(),
        writeCounts: timing.writeCounts,
      });
      checkpointScheduler.recordEmitted(checkpoint.tick);
      sink.writeRunCheckpoint?.(checkpoint);
      options.onCheckpoint?.(checkpoint);
      timing.addCheckpointMs(nowMs() - started);
    };
    const emitProgress = () => {
      options.onProgress?.({
        runId: options.runId,
        tick: simulation.world.tick,
        population: simulation.world.spawners.length,
        createdAt: new Date().toISOString(),
        timing: timing.snapshot(),
      });
    };
    emitCheckpoint(true);
    flushBufferedSink();
    emitProgress();

    let ended = false;
    let status: Exclude<HeadlessRunStatus, "running"> = "completed";
    let terminationReason: HeadlessRunTerminationReason = "target";
    while (simulation.world.tick < targetTick && !ended) {
      if (options.shouldCancel?.()) {
        status = "cancelled";
        terminationReason = "cancelled";
        break;
      }
      if (simulation.world.spawners.length === 0) {
        ended = true;
        terminationReason = "population_extinct";
        break;
      }
      const chunkStartTick = simulation.world.tick;
      const chunkStarted = nowMs();
      const recorderEventStartMs = timing.recorderEventMs();
      const sinkWriteStartMs = timing.sinkWriteMs();
      const sinkFlushStartMs = timing.sinkFlushMs();
      const sinkBufferedRowStart = timing.sinkBufferedRows();
      if (isBtcSource(simulation.marketConfig.source)) {
        const candleStarted = nowMs();
        await maybeLoadMoreHeadlessCandles(simulation, simulation.marketConfig, options.candleLoader);
        timing.addCandleLoadMs(nowMs() - candleStarted);
      }
      const nextTarget = Math.min(targetTick, simulation.world.tick + chunkTicks, checkpointScheduler.nextTick());
      const advanceStarted = nowMs();
      const result = advanceHeadlessSimulationToTarget(simulation, nextTarget, chunkTicks);
      const advanceTotalMs = nowMs() - advanceStarted;
      if (simulation.world.spawners.length === 0) {
        ended = true;
        terminationReason = "population_extinct";
      } else if (result.ended) {
        ended = true;
        terminationReason = "market_end";
      } else {
        ended = result.processedTicks === 0;
      }
      emitCheckpoint(false);
      flushBufferedSink();
      timing.recordChunk({
        startTick: chunkStartTick,
        endTick: simulation.world.tick,
        processedTicks: result.processedTicks,
        population: simulation.world.spawners.length,
        chunkMs: nowMs() - chunkStarted,
        advanceTotalMs,
        recorderEventMs: timing.recorderEventMs() - recorderEventStartMs,
        sinkWriteMs: timing.sinkWriteMs() - sinkWriteStartMs,
        sinkFlushMs: timing.sinkFlushMs() - sinkFlushStartMs,
        sinkBufferedRows: timing.sinkBufferedRows() - sinkBufferedRowStart,
      });
      emitProgress();
      if (result.processedTicks === 0 && result.remainingTicks <= 0) break;
      await yieldToEventLoop();
    }
    emitCheckpoint(true);
    recorder.finalize();
    sink.writeRunCompletion({
      id: options.runId,
      completedAt: new Date().toISOString(),
      status,
      tick: simulation.world.tick,
      terminationReason,
    });
    flushBufferedSink();
    return {
      runId: options.runId,
      tick: simulation.world.tick,
      ended,
      status,
      terminationReason,
      eligibleAgentIds: recorder.eligibleAgentIds(),
      simulation,
      timing: timing.snapshot(),
    };
  } catch (error) {
    bufferedSink.clear();
    sink.writeRunCompletion({
      id: options.runId,
      completedAt: new Date().toISOString(),
      status: "failed",
      tick: simulation.world.tick,
      terminationReason: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    flushBufferedSink();
    throw error;
  }
}

function createCheckpoint({
  runId,
  simulation,
  summary,
  writeCounts,
}: {
  runId: string;
  simulation: MarketSimulationState;
  summary: {
    eligibleAgents: number;
    resolvedTrades: number;
    wins: number;
    losses: number;
    hitRate: number;
    cumulativePayoff: number;
    averagePayoff: number;
  };
  writeCounts: { trades: number; snapshots: number };
}): HeadlessRunCheckpointRecord {
  const point = sourcePointForTick(simulation.timeline, simulation.world.tick);
  return {
    runId,
    tick: simulation.world.tick,
    sourceTimestamp: point.sourceTimestamp,
    sourceDatetime: point.sourceDatetime,
    population: simulation.world.spawners.length,
    eligibleAgents: summary.eligibleAgents,
    resolvedTrades: summary.resolvedTrades,
    wins: summary.wins,
    losses: summary.losses,
    hitRate: summary.hitRate,
    cumulativePayoff: summary.cumulativePayoff,
    averagePayoff: summary.averagePayoff,
    tradesWritten: writeCounts.trades,
    snapshotsWritten: writeCounts.snapshots,
    createdAt: new Date().toISOString(),
  };
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function advanceHeadlessSimulationToTarget(
  simulation: MarketSimulationState,
  targetTick: number,
  maxTicks: number,
) {
  let processedTicks = 0;
  let ended = false;
  while (simulation.world.tick < targetTick && processedTicks < maxTicks) {
    const result = advanceSimulationToTarget(simulation, simulation.world.tick + 1, 1);
    processedTicks += result.processedTicks;
    ended = !!result.ended;
    if (ended || result.processedTicks === 0 || simulation.world.spawners.length === 0) {
      return {
        processedTicks,
        remainingTicks: result.remainingTicks,
        ended,
      };
    }
  }
  return {
    processedTicks,
    remainingTicks: targetTick - simulation.world.tick,
    ended,
  };
}
