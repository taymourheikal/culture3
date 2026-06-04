import { INITIAL_MARKET_RUNTIME_CONFIG } from "../../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerFood } from "../../src/sine/spawnerSimulation";
import type {
  HeadlessAgentEventRecord,
  HeadlessAgentMetricsRecord,
  HeadlessAgentRecord,
  HeadlessAgentSnapshotRecord,
  HeadlessBatchRecordSink,
  HeadlessRecordBatch,
  HeadlessRunCheckpointRecord,
  HeadlessRunCompletionRecord,
  HeadlessRunRecord,
  HeadlessSinkMethod,
  HeadlessTradeRecord,
} from "../../src/sine/headless/types";

export type MemorySink = ReturnType<typeof createMemorySink>;

export function createMemorySink() {
  const state = {
    runs: [] as HeadlessRunRecord[],
    completions: [] as HeadlessRunCompletionRecord[],
    agents: new Map<number, HeadlessAgentRecord>(),
    events: [] as HeadlessAgentEventRecord[],
    trades: [] as HeadlessTradeRecord[],
    snapshots: [] as HeadlessAgentSnapshotRecord[],
    metrics: [] as HeadlessAgentMetricsRecord[],
    checkpoints: [] as HeadlessRunCheckpointRecord[],
    methodCalls: {} as Partial<Record<HeadlessSinkMethod, number>>,
  };
  const countMethod = (method: HeadlessSinkMethod) => {
    state.methodCalls[method] = (state.methodCalls[method] ?? 0) + 1;
  };
  return {
    ...state,
    sink: {
      writeRunStart: (record: HeadlessRunRecord) => {
        countMethod("writeRunStart");
        state.runs.push(record);
      },
      writeRunCompletion: (record: HeadlessRunCompletionRecord) => {
        countMethod("writeRunCompletion");
        state.completions.push(record);
      },
      writeRunCheckpoint: (record: HeadlessRunCheckpointRecord) => {
        countMethod("writeRunCheckpoint");
        state.checkpoints.push(record);
      },
      writeAgent: (record: HeadlessAgentRecord) => {
        countMethod("writeAgent");
        state.agents.set(record.spawnerId, record);
      },
      markAgentEligible: ({ spawnerId, eligible }: { spawnerId: number; eligible: boolean }) => {
        countMethod("markAgentEligible");
        const current = state.agents.get(spawnerId);
        if (current) state.agents.set(spawnerId, { ...current, eligible });
      },
      markAgentDead: () => {
        countMethod("markAgentDead");
      },
      writeAgentEvent: (record: HeadlessAgentEventRecord) => {
        countMethod("writeAgentEvent");
        state.events.push(record);
      },
      writeTrade: (record: HeadlessTradeRecord) => {
        countMethod("writeTrade");
        const index = state.trades.findIndex((trade) => trade.runId === record.runId && trade.foodId === record.foodId);
        if (index >= 0) state.trades[index] = record;
        else state.trades.push(record);
      },
      writeSnapshot: (record: HeadlessAgentSnapshotRecord) => {
        countMethod("writeSnapshot");
        const index = state.snapshots.findIndex(
          (snapshot) =>
            snapshot.runId === record.runId &&
            snapshot.spawnerId === record.spawnerId &&
            snapshot.tick === record.tick &&
            snapshot.reason === record.reason,
        );
        if (index >= 0) state.snapshots[index] = record;
        else state.snapshots.push(record);
      },
      writeMetrics: (record: HeadlessAgentMetricsRecord) => {
        countMethod("writeMetrics");
        const index = state.metrics.findIndex((metric) => metric.runId === record.runId && metric.spawnerId === record.spawnerId);
        if (index >= 0) state.metrics[index] = record;
        else state.metrics.push(record);
      },
    },
  };
}

export function createFailingBatchMemorySink(shouldFail: (batch: HeadlessRecordBatch, flushIndex: number) => boolean) {
  const memory = createMemorySink();
  let flushIndex = 0;
  const sink: HeadlessBatchRecordSink = {
    ...memory.sink,
    writeBatch(batch) {
      flushIndex += 1;
      if (shouldFail(batch, flushIndex)) throw new Error(`Injected batch failure ${flushIndex}`);
      writeBatchToMemorySink(memory.sink, batch);
    },
  };
  return { ...memory, sink };
}

function writeBatchToMemorySink(sink: MemorySink["sink"], batch: HeadlessRecordBatch) {
  for (const record of batch.runStarts) sink.writeRunStart(record);
  for (const record of batch.runCheckpoints) sink.writeRunCheckpoint?.(record);
  for (const record of batch.agents) sink.writeAgent(record);
  for (const record of batch.agentEligibilities) sink.markAgentEligible(record);
  for (const _record of batch.agentDeaths) sink.markAgentDead();
  for (const record of batch.agentEvents) sink.writeAgentEvent(record);
  for (const record of batch.trades) sink.writeTrade(record);
  for (const record of batch.snapshots) sink.writeSnapshot(record);
  for (const record of batch.metrics) sink.writeMetrics(record);
  for (const record of batch.runCompletions) sink.writeRunCompletion(record);
}

export function emptyBatch(): HeadlessRecordBatch {
  return {
    runStarts: [],
    runCompletions: [],
    runCheckpoints: [],
    agents: [],
    agentEligibilities: [],
    agentDeaths: [],
    agentEvents: [],
    trades: [],
    snapshots: [],
    metrics: [],
  };
}

export function runStartFixture(id: string): HeadlessRunRecord {
  return {
    id,
    createdAt: new Date().toISOString(),
    status: "running",
    seed: 101,
    tick: 0,
    targetTicks: 10,
    checkpointIntervalTicks: 10,
    marketSource: "generated",
    minimumResolvedTrades: 1,
    marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
  };
}

export function pendingSpawnerFood(spawnerId: number, lineageId: number): SpawnerFood {
  return {
    id: 1,
    creatorSpawnerId: spawnerId,
    creatorLineageId: lineageId,
    spawnTick: 1,
    resolveTick: 5,
    direction: "long",
    strength: 1,
    horizonTicks: 4,
    entrySignal: 1,
    entryPayoffScale: 1,
    status: "pending",
  };
}

export function candle(timestamp: number, close: number, isStart: boolean) {
  return {
    timestamp,
    datetime: new Date(timestamp * 1000).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    roc: isStart ? 0 : 1,
    isStart,
  };
}
