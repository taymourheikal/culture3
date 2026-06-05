import { normalizePersistenceLearnedState, plasticitySnapshotFromProfile } from "../src/sine/persistence/sinePersistenceDtos.ts";
import { sineDb, sineStatements } from "./sineDb.mjs";
import { finiteNumber, finiteNumberOrNull, integerNumber, normalizeDeathCause, stringifyJson } from "./sineRepositoryUtils.mjs";

export function createSineHeadlessUnifiedWriteSink() {
  return {
    writeRunStart(record) {
      withSqliteRetry(() => transaction(() => writeRunStart(record)));
    },
    writeRunCompletion(record) {
      withSqliteRetry(() => transaction(() => writeRunCompletion(record)));
    },
    writeRunCheckpoint(record) {
      withSqliteRetry(() => transaction(() => writeRunCheckpoint(record)));
    },
    writeAgent(record) {
      withSqliteRetry(() => transaction(() => writeAgent(record)));
    },
    markAgentEligible(record) {
      withSqliteRetry(() => transaction(() => markAgentEligible(record)));
    },
    markAgentDead() {
      // Core death rows are written from the death lifecycle event because it carries the death snapshot.
    },
    writeAgentEvent(record) {
      withSqliteRetry(() => transaction(() => writeAgentEvent(record)));
    },
    writeCoreTrade(record) {
      withSqliteRetry(() => transaction(() => writeFoodEvent(record)));
    },
    writeTrade(record) {
      withSqliteRetry(() => transaction(() => writeFoodEvent(record)));
    },
    writeSnapshot(record) {
      withSqliteRetry(() => transaction(() => writeReconstructionSnapshot(record)));
    },
    writeMetrics() {
      // Derived headless metrics are intentionally not materialized in the unified DB.
    },
    writeBatch(batch) {
      withSqliteRetry(() => transaction(() => writeUnifiedHeadlessRecordBatch(batch)));
    },
  };
}

function writeUnifiedHeadlessRecordBatch(batch) {
  for (const record of batch.runStarts) writeRunStart(record);
  for (const record of batch.runCheckpoints) writeRunCheckpoint(record);
  for (const record of batch.agents) writeAgent(record);
  for (const record of batch.agentEligibilities) markAgentEligible(record);
  for (const record of batch.agentEvents) writeAgentEvent(record);
  for (const record of batch.coreTrades) writeFoodEvent(record);
  for (const record of batch.snapshots) writeReconstructionSnapshot(record);
  for (const record of batch.runCompletions) writeRunCompletion(record);
}

function writeRunStart(record) {
  sineStatements.upsertHeadlessSineSessionStart.run(
    record.id,
    record.createdAt,
    record.createdAt,
    record.status,
    stringifyJson(record.marketConfig ?? {}),
    stringifyJson(record.spawnerConfig ?? {}),
    integerNumber(record.seed, 0),
    integerOrNull(record.targetTicks),
    integerOrNull(record.checkpointIntervalTicks),
    integerNumber(record.minimumResolvedTrades, 0),
  );
}

function writeRunCompletion(record) {
  sineStatements.completeHeadlessSineSession.run(
    record.completedAt,
    record.status,
    record.completedAt,
    record.terminationReason,
    record.error ?? null,
    record.id,
  );
}

function writeRunCheckpoint(record) {
  sineStatements.upsertHeadlessSineCheckpoint.run(
    record.runId,
    record.tick,
    finiteNumberOrNull(record.sourceTimestamp),
    record.sourceDatetime ?? null,
    integerNumber(record.population, 0),
    integerNumber(record.eligibleAgents, 0),
    integerNumber(record.tradesWritten, 0),
    integerNumber(record.snapshotsWritten, 0),
    record.createdAt,
  );
}

function writeAgent(record) {
  const spawner = record.spawner;
  if (!spawner) throw new Error("Missing headless spawner birth snapshot");
  const plasticity = plasticitySnapshotFromProfile(spawner.genome?.plasticityProfile);
  sineStatements.insertSineBirth.run(
    record.runId,
    record.spawnerId,
    record.parentSpawnerId ?? spawner.parentSpawnerId ?? null,
    record.lineageId,
    record.generation,
    record.birthTick,
    record.birthTick,
    finiteNumberOrNull(record.birthSourceTimestamp),
    record.birthSourceDatetime ?? null,
    stringifyJson(spawner),
    stringifyJson(plasticity.profile),
    plasticity.learningRateMean,
    plasticity.decayRate,
    plasticity.maxLearnedDelta,
  );
}

function markAgentEligible(record) {
  if (!record.eligible) return;
  sineStatements.upsertHeadlessSineEligibility.run(
    record.runId,
    record.spawnerId,
    integerNumber(record.eligibleTick, 0),
    integerNumber(record.resolvedTrades, 0),
    new Date().toISOString(),
  );
}

function writeAgentEvent(record) {
  if (record.kind === "death") writeDeathFromEvent(record);
  if (record.eventId === null || record.eventId === undefined) return;
  sineStatements.insertSineEvent.run(
    record.runId,
    record.eventId,
    record.kind,
    record.spawnerId,
    record.lineageId,
    record.tick,
    record.tick,
    stringifyJson(compactLifecycleEvent(record)),
  );
}

function writeDeathFromEvent(record) {
  const event = record.event ?? {};
  const spawner = event.spawnerSnapshot;
  if (!spawner) return;
  sineStatements.insertSineDeath.run(
    record.runId,
    record.spawnerId,
    record.lineageId,
    spawner.generation ?? 0,
    record.tick,
    record.tick,
    finiteNumberOrNull(record.sourceTimestamp),
    record.sourceDatetime ?? null,
    stringifyJson(spawner),
    normalizeDeathCause(event.deathCause),
    finiteNumberOrNull(event.deathEnergyThreshold),
    finiteNumberOrNull(event.deathHealthThreshold),
  );
}

function writeFoodEvent(record) {
  if (!record.food) throw new Error("Missing headless food snapshot");
  const eventKind = record.status === "pending" ? "spawn" : "resolve";
  const tick = eventKind === "spawn" ? record.spawnTick : record.resolveTick;
  sineStatements.insertSineFoodEvent.run(
    record.runId,
    record.foodId,
    eventKind,
    record.spawnerId,
    record.lineageId,
    tick,
    tick,
    stringifyJson(record.food),
  );
}

function writeReconstructionSnapshot(record) {
  const snapshot = record.snapshot;
  if (!snapshot) throw new Error("Missing headless reconstruction snapshot");
  sineStatements.upsertHeadlessSineReconstructionSnapshot.run(
    record.runId,
    record.spawnerId,
    record.lineageId,
    record.generation,
    snapshot.parentSpawnerId ?? null,
    record.tick,
    finiteNumberOrNull(record.sourceTimestamp),
    record.sourceDatetime ?? null,
    record.reason,
    integerNumber(record.schemaVersion, 1),
    stringifyJson(snapshot.genome),
    stringifyJson(snapshot.hiddenState ?? {}),
    stringifyJson(normalizePersistenceLearnedState(snapshot.learnedState)),
    new Date().toISOString(),
  );
}

function compactLifecycleEvent(record) {
  const event = record.event ?? {};
  return {
    id: record.eventId,
    kind: record.kind,
    tick: record.tick,
    spawnerId: record.spawnerId,
    lineageId: record.lineageId,
    childSpawnerId: record.childSpawnerId ?? event.childSpawnerId ?? null,
    parentSpawnerId: record.parentSpawnerId ?? event.parentSpawnerId ?? null,
    sourceTimestamp: finiteNumberOrNull(record.sourceTimestamp),
    sourceDatetime: record.sourceDatetime ?? null,
    deathCause: normalizeDeathCause(event.deathCause),
    deathEnergyThreshold: finiteNumberOrNull(event.deathEnergyThreshold),
    deathHealthThreshold: finiteNumberOrNull(event.deathHealthThreshold),
  };
}

function transaction(callback) {
  let began = false;
  try {
    sineDb.exec("BEGIN IMMEDIATE");
    began = true;
    const result = callback();
    sineDb.exec("COMMIT");
    return result;
  } catch (error) {
    if (began) {
      try {
        sineDb.exec("ROLLBACK");
      } catch {
        // Preserve the original error.
      }
    }
    throw error;
  }
}

function withSqliteRetry(operation) {
  let attempt = 0;
  let delayMs = 10;
  while (true) {
    try {
      return operation();
    } catch (error) {
      if (!isRetryableSqliteLock(error) || attempt >= 40) throw error;
      sleepSync(delayMs);
      attempt += 1;
      delayMs = Math.min(125, Math.ceil(delayMs * 1.35));
    }
  }
}

function isRetryableSqliteLock(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("database is locked") || message.includes("database is busy");
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
