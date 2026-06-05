import type {
  HeadlessRecordSink,
  HeadlessSinkMethod,
  HeadlessTimingBucket,
  HeadlessTimingChunk,
  HeadlessTimingSnapshot,
} from "./types";

export type HeadlessTimingCollector = ReturnType<typeof createHeadlessTimingCollector>;

export function createHeadlessTimingCollector() {
  const startedAt = nowMs();
  const writeCounts = { trades: 0, snapshots: 0 };
  const sinkMethods: Partial<Record<HeadlessSinkMethod, HeadlessTimingBucket>> = {};
  let chunks = 0;
  let simulatedTicks = 0;
  let advanceTotalMs = 0;
  let recorderEventMs = 0;
  let recorderEventCount = 0;
  let recorderFounderMs = 0;
  let recorderFinalizeMs = 0;
  let checkpointMs = 0;
  let candleLoadMs = 0;
  let sinkWriteMs = 0;
  let sinkWrites = 0;
  let sinkEnqueueMs = 0;
  let sinkEnqueues = 0;
  let sinkFlushMs = 0;
  let sinkFlushes = 0;
  let sinkBufferedRows = 0;
  let latestChunk: HeadlessTimingChunk | null = null;

  const timing = {
    writeCounts,
    recorder: {
      recordFounders(ms: number) {
        recorderFounderMs += finiteTimingMs(ms);
      },
      recordEvent(ms: number) {
        recorderEventMs += finiteTimingMs(ms);
        recorderEventCount += 1;
      },
      finalize(ms: number) {
        recorderFinalizeMs += finiteTimingMs(ms);
      },
    },
    recorderEventMs() {
      return recorderEventMs;
    },
    sinkWriteMs() {
      return sinkWriteMs;
    },
    sinkFlushMs() {
      return sinkFlushMs;
    },
    sinkBufferedRows() {
      return sinkBufferedRows;
    },
    addCheckpointMs(ms: number) {
      checkpointMs += finiteTimingMs(ms);
    },
    addCandleLoadMs(ms: number) {
      candleLoadMs += finiteTimingMs(ms);
    },
    recordSink(method: HeadlessSinkMethod, ms: number) {
      const elapsed = finiteTimingMs(ms);
      const bucket = sinkMethods[method] ?? { calls: 0, ms: 0 };
      bucket.calls += 1;
      bucket.ms += elapsed;
      sinkMethods[method] = bucket;
      sinkEnqueueMs += elapsed;
      sinkEnqueues += 1;
      sinkWriteMs += elapsed;
      sinkWrites += 1;
    },
    recordFlush(ms: number, rows: number) {
      const elapsed = finiteTimingMs(ms);
      sinkFlushMs += elapsed;
      sinkFlushes += 1;
      sinkBufferedRows += Math.max(0, Math.floor(rows));
      sinkWriteMs += elapsed;
    },
    recordChunk(chunk: Omit<HeadlessTimingChunk, "simulationCoreEstimateMs" | "ticksPerSecond" | "sinkEnqueueMs">) {
      const normalized = normalizeChunk(chunk);
      chunks += 1;
      simulatedTicks += normalized.processedTicks;
      advanceTotalMs += normalized.advanceTotalMs;
      latestChunk = normalized;
    },
    snapshot(): HeadlessTimingSnapshot {
      return {
        runMs: finiteTimingMs(nowMs() - startedAt),
        chunks,
        simulatedTicks,
        advanceTotalMs,
        recorderEventMs,
        recorderEventCount,
        recorderFounderMs,
        recorderFinalizeMs,
        checkpointMs,
        candleLoadMs,
        sinkWriteMs,
        sinkWrites,
        sinkEnqueueMs,
        sinkEnqueues,
        sinkFlushMs,
        sinkFlushes,
        sinkBufferedRows,
        sinkMethods: cloneSinkMethods(sinkMethods),
        topSinkMethod: topSinkMethod(sinkMethods),
        latestChunk,
      };
    },
  };
  return timing;
}

export function instrumentHeadlessSink(sink: HeadlessRecordSink, timing: HeadlessTimingCollector): HeadlessRecordSink {
  return {
    writeRunStart(record) {
      timeSink(timing, "writeRunStart", () => sink.writeRunStart(record));
    },
    writeRunCompletion(record) {
      timeSink(timing, "writeRunCompletion", () => sink.writeRunCompletion(record));
    },
    writeRunCheckpoint: sink.writeRunCheckpoint
      ? (record) => timeSink(timing, "writeRunCheckpoint", () => sink.writeRunCheckpoint?.(record))
      : undefined,
    writeAgent(record) {
      timeSink(timing, "writeAgent", () => sink.writeAgent(record));
    },
    markAgentEligible(record) {
      timeSink(timing, "markAgentEligible", () => sink.markAgentEligible(record));
    },
    markAgentDead(record) {
      timeSink(timing, "markAgentDead", () => sink.markAgentDead(record));
    },
    writeAgentEvent(record) {
      timeSink(timing, "writeAgentEvent", () => sink.writeAgentEvent(record));
    },
    writeCoreTrade: sink.writeCoreTrade
      ? (record) => timeSink(timing, "writeCoreTrade", () => sink.writeCoreTrade?.(record))
      : undefined,
    writeTrade(record) {
      timing.writeCounts.trades += 1;
      timeSink(timing, "writeTrade", () => sink.writeTrade(record));
    },
    writeSnapshot(record) {
      timing.writeCounts.snapshots += 1;
      timeSink(timing, "writeSnapshot", () => sink.writeSnapshot(record));
    },
    writeMetrics(record) {
      timeSink(timing, "writeMetrics", () => sink.writeMetrics(record));
    },
  };
}

export function timeHeadlessFlush(timing: HeadlessTimingCollector, pendingRows: number, flush: () => number) {
  const started = nowMs();
  try {
    return flush();
  } finally {
    if (pendingRows > 0) timing.recordFlush(nowMs() - started, pendingRows);
  }
}

export function nowMs() {
  return performance.now();
}

function timeSink(timing: HeadlessTimingCollector, method: HeadlessSinkMethod, write: () => void) {
  const started = nowMs();
  try {
    write();
  } finally {
    timing.recordSink(method, nowMs() - started);
  }
}

function normalizeChunk(chunk: Omit<HeadlessTimingChunk, "simulationCoreEstimateMs" | "ticksPerSecond" | "sinkEnqueueMs">): HeadlessTimingChunk {
  const processedTicks = Math.max(0, Math.floor(chunk.processedTicks));
  const chunkMs = finiteTimingMs(chunk.chunkMs);
  const advanceTotalMs = finiteTimingMs(chunk.advanceTotalMs);
  const recorderEventMs = finiteTimingMs(chunk.recorderEventMs);
  const sinkFlushMs = finiteTimingMs(chunk.sinkFlushMs);
  const sinkWriteMs = finiteTimingMs(chunk.sinkWriteMs);
  return {
    startTick: chunk.startTick,
    endTick: chunk.endTick,
    processedTicks,
    population: Math.max(0, Math.floor(chunk.population)),
    chunkMs,
    advanceTotalMs,
    recorderEventMs,
    sinkWriteMs,
    sinkEnqueueMs: Math.max(0, sinkWriteMs - sinkFlushMs),
    sinkFlushMs,
    sinkBufferedRows: Math.max(0, Math.floor(chunk.sinkBufferedRows)),
    simulationCoreEstimateMs: Math.max(0, advanceTotalMs - recorderEventMs),
    ticksPerSecond: chunkMs > 0 ? (processedTicks / chunkMs) * 1000 : 0,
  };
}

function cloneSinkMethods(source: Partial<Record<HeadlessSinkMethod, HeadlessTimingBucket>>) {
  return Object.fromEntries(
    Object.entries(source).map(([method, bucket]) => [method, { calls: bucket.calls, ms: bucket.ms }]),
  ) as Partial<Record<HeadlessSinkMethod, HeadlessTimingBucket>>;
}

function topSinkMethod(source: Partial<Record<HeadlessSinkMethod, HeadlessTimingBucket>>) {
  let top: (HeadlessTimingBucket & { method: HeadlessSinkMethod }) | null = null;
  for (const [method, bucket] of Object.entries(source) as Array<[HeadlessSinkMethod, HeadlessTimingBucket]>) {
    if (!top || bucket.ms > top.ms) top = { method, calls: bucket.calls, ms: bucket.ms };
  }
  return top;
}

function finiteTimingMs(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
