import type {
  HeadlessBatchRecordSink,
  HeadlessRecordBatch,
  HeadlessRecordSink,
  HeadlessSinkMethod,
} from "./types";

export type BufferedHeadlessRecordSink = {
  sink: HeadlessRecordSink;
  flush(): number;
  clear(): void;
  pendingCount(): number;
};

export function createBufferedHeadlessRecordSink(target: HeadlessBatchRecordSink): BufferedHeadlessRecordSink {
  let batch = createEmptyBatch();

  const sink: HeadlessRecordSink = {
    writeRunStart(record) {
      batch.runStarts.push(record);
    },
    writeRunCompletion(record) {
      batch.runCompletions.push(record);
    },
    writeRunCheckpoint: target.writeRunCheckpoint
      ? (record) => {
          batch.runCheckpoints.push(record);
        }
      : undefined,
    writeAgent(record) {
      batch.agents.push(record);
    },
    markAgentEligible(record) {
      batch.agentEligibilities.push(record);
    },
    markAgentDead(record) {
      batch.agentDeaths.push(record);
    },
    writeAgentEvent(record) {
      batch.agentEvents.push(record);
    },
    writeCoreTrade: target.writeCoreTrade
      ? (record) => {
          batch.coreTrades.push(record);
        }
      : undefined,
    writeTrade(record) {
      batch.trades.push(record);
    },
    writeSnapshot(record) {
      batch.snapshots.push(record);
    },
    writeMetrics(record) {
      batch.metrics.push(record);
    },
  };

  return {
    sink,
    flush() {
      const rowCount = batchRecordCount(batch);
      if (rowCount <= 0) return 0;
      const flushing = batch;
      if (target.writeBatch) {
        target.writeBatch(flushing);
      } else {
        writeBatchWithSink(target, flushing);
      }
      batch = createEmptyBatch();
      return rowCount;
    },
    clear() {
      batch = createEmptyBatch();
    },
    pendingCount() {
      return batchRecordCount(batch);
    },
  };
}

export function createEmptyBatch(): HeadlessRecordBatch {
  return {
    runStarts: [],
    runCompletions: [],
    runCheckpoints: [],
    agents: [],
    agentEligibilities: [],
    agentDeaths: [],
    agentEvents: [],
    coreTrades: [],
    trades: [],
    snapshots: [],
    metrics: [],
  };
}

export function batchRecordCount(batch: HeadlessRecordBatch) {
  return (
    batch.runStarts.length +
    batch.runCompletions.length +
    batch.runCheckpoints.length +
    batch.agents.length +
    batch.agentEligibilities.length +
    batch.agentDeaths.length +
    batch.agentEvents.length +
    batch.coreTrades.length +
    batch.trades.length +
    batch.snapshots.length +
    batch.metrics.length
  );
}

export function batchMethodCounts(batch: HeadlessRecordBatch): Partial<Record<HeadlessSinkMethod, number>> {
  return {
    writeRunStart: batch.runStarts.length,
    writeRunCompletion: batch.runCompletions.length,
    writeRunCheckpoint: batch.runCheckpoints.length,
    writeAgent: batch.agents.length,
    markAgentEligible: batch.agentEligibilities.length,
    markAgentDead: batch.agentDeaths.length,
    writeAgentEvent: batch.agentEvents.length,
    writeCoreTrade: batch.coreTrades.length,
    writeTrade: batch.trades.length,
    writeSnapshot: batch.snapshots.length,
    writeMetrics: batch.metrics.length,
  };
}

function writeBatchWithSink(target: HeadlessRecordSink, batch: HeadlessRecordBatch) {
  for (const record of batch.runStarts) target.writeRunStart(record);
  for (const record of batch.runCheckpoints) target.writeRunCheckpoint?.(record);
  for (const record of batch.agents) target.writeAgent(record);
  for (const record of batch.agentEligibilities) target.markAgentEligible(record);
  for (const record of batch.agentDeaths) target.markAgentDead(record);
  for (const record of batch.agentEvents) target.writeAgentEvent(record);
  for (const record of batch.coreTrades) target.writeCoreTrade?.(record);
  for (const record of batch.trades) target.writeTrade(record);
  for (const record of batch.snapshots) target.writeSnapshot(record);
  for (const record of batch.metrics) target.writeMetrics(record);
  for (const record of batch.runCompletions) target.writeRunCompletion(record);
}
