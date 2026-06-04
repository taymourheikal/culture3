import { stringifyJson } from "./sineHeadlessRepositoryUtils.mjs";

export function createSineHeadlessWriteSink(db, statements) {
  return {
    writeRunStart(record) {
      writeRunStart(statements, record);
    },
    writeRunCompletion(record) {
      writeRunCompletion(statements, record);
    },
    writeRunCheckpoint(record) {
      writeRunCheckpoint(statements, record);
    },
    writeAgent(record) {
      writeAgent(statements, record);
    },
    markAgentEligible(record) {
      markAgentEligible(statements, record);
    },
    markAgentDead(record) {
      markAgentDead(statements, record);
    },
    writeAgentEvent(record) {
      writeAgentEvent(statements, record);
    },
    writeTrade(record) {
      writeTrade(statements, record);
    },
    writeSnapshot(record) {
      writeSnapshot(statements, record);
    },
    writeMetrics(record) {
      writeMetrics(statements, record);
    },
    writeBatch(batch) {
      transaction(db, () => writeHeadlessRecordBatch(statements, batch));
    },
  };
}

function writeHeadlessRecordBatch(statements, batch) {
  for (const record of batch.runStarts) writeRunStart(statements, record);
  for (const record of batch.runCheckpoints) writeRunCheckpoint(statements, record);
  for (const record of batch.agents) writeAgent(statements, record);
  for (const record of batch.agentEligibilities) markAgentEligible(statements, record);
  for (const record of batch.agentDeaths) markAgentDead(statements, record);
  for (const record of batch.agentEvents) writeAgentEvent(statements, record);
  for (const record of batch.trades) writeTrade(statements, record);
  for (const record of batch.snapshots) writeSnapshot(statements, record);
  for (const record of batch.metrics) writeMetrics(statements, record);
  for (const record of batch.runCompletions) writeRunCompletion(statements, record);
}

function writeRunStart(statements, record) {
  statements.upsertRun.run(
    record.id,
    record.createdAt,
    null,
    record.status,
    record.seed,
    record.tick,
    record.targetTicks ?? null,
    record.checkpointIntervalTicks ?? null,
    record.marketSource,
    record.minimumResolvedTrades,
    stringifyJson(record.marketConfig),
    stringifyJson(record.spawnerConfig),
    null,
    null,
  );
}

function writeRunCompletion(statements, record) {
  statements.completeRun.run(record.completedAt, record.status, record.tick, record.terminationReason, record.error ?? null, record.id);
}

function writeRunCheckpoint(statements, record) {
  statements.upsertCheckpoint.run(
    record.runId,
    record.tick,
    record.sourceTimestamp,
    record.sourceDatetime,
    record.population,
    record.eligibleAgents,
    record.resolvedTrades,
    record.wins,
    record.losses,
    record.hitRate,
    record.cumulativePayoff,
    record.averagePayoff,
    record.tradesWritten,
    record.snapshotsWritten,
    record.createdAt,
  );
  statements.updateRunTick.run(record.tick, record.runId);
}

function writeAgent(statements, record) {
  statements.upsertAgent.run(
    record.runId,
    record.spawnerId,
    record.lineageId,
    record.generation,
    record.parentSpawnerId,
    record.birthTick,
    record.birthSourceTimestamp,
    record.birthSourceDatetime,
    record.eligible ? 1 : 0,
  );
}

function markAgentEligible(statements, record) {
  statements.markAgentEligible.run(record.eligible ? 1 : 0, record.eligibleTick, record.runId, record.spawnerId);
}

function markAgentDead(statements, record) {
  statements.markAgentDead.run(record.deathTick, record.deathSourceTimestamp, record.deathSourceDatetime, record.runId, record.spawnerId);
}

function writeAgentEvent(statements, record) {
  statements.insertEvent.run(
    record.runId,
    record.eventId ?? null,
    record.kind,
    record.spawnerId,
    record.lineageId,
    record.tick,
    record.sourceTimestamp,
    record.sourceDatetime,
    record.childSpawnerId ?? null,
    record.parentSpawnerId ?? null,
    stringifyJson(record.event),
  );
}

function writeTrade(statements, record) {
  statements.upsertTrade.run(
    record.runId,
    record.spawnerId,
    record.lineageId,
    record.foodId,
    record.spawnTick,
    record.resolveTick,
    record.direction,
    record.strength,
    record.horizonTicks,
    record.entrySignal,
    record.exitSignal,
    record.entryPayoffScale,
    record.entryPrice,
    record.exitPrice,
    record.sourceTimestamp,
    record.sourceDatetime,
    record.exitSourceTimestamp,
    record.exitSourceDatetime,
    record.status,
    record.payoff,
    stringifyJson(record.food),
  );
}

function writeSnapshot(statements, record) {
  statements.upsertSnapshot.run(
    record.runId,
    record.spawnerId,
    record.lineageId,
    record.generation,
    record.tick,
    record.sourceTimestamp,
    record.sourceDatetime,
    record.reason,
    record.schemaVersion,
    stringifyJson(record.snapshot),
    stringifyJson(record.snapshot.genome),
    stringifyJson(record.snapshot.hiddenState),
    stringifyJson(record.snapshot.learnedState),
  );
}

function writeMetrics(statements, record) {
  statements.upsertMetrics.run(
    record.runId,
    record.spawnerId,
    record.lineageId,
    record.generation,
    record.parentSpawnerId,
    record.birthTick,
    record.birthSourceTimestamp,
    record.birthSourceDatetime,
    record.deathTick,
    record.deathSourceTimestamp,
    record.deathSourceDatetime,
    record.lifespanTicks,
    record.children,
    record.resolvedTrades,
    record.wins,
    record.losses,
    record.hitRate,
    record.cumulativePayoff,
    record.averagePayoff,
    record.averageWin,
    record.averageLoss,
    record.payoffStdDev,
    record.longTrades,
    record.shortTrades,
    record.longAveragePayoff,
    record.shortAveragePayoff,
    record.averageHorizonTicks,
    record.averageStrength,
    record.lastResolvedTick,
  );
}

function transaction(db, callback) {
  try {
    db.exec("BEGIN");
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
