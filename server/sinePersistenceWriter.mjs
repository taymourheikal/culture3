import {
  normalizePersistenceLearnedState,
  plasticitySnapshotFromProfile,
} from "../src/sine/persistence/sinePersistenceDtos.ts";
import { sineDb, sineStatements } from "./sineDb.mjs";
import {
  eventTick,
  eventTime,
  finiteNumber,
  finiteNumberOrNull,
  integerNumber,
  normalizeDeathCause,
  rows,
  stringifyJson,
} from "./sineRepositoryUtils.mjs";

export function saveSinePersistenceBatch(batch) {
  const sessionId = String(batch.persistentSessionId ?? batch.sessionId ?? "");
  if (!sessionId) throw new Error("Missing persistentSessionId");

  sineDb.exec("BEGIN");
  try {
    writeSineSession(sessionId, batch);
    writeSineBirths(sessionId, batch);
    writeSineDeaths(sessionId, batch);
    writeSineGenomeSnapshots(sessionId, batch);
    writeSineStateSnapshots(sessionId, batch);
    writeSineFoodEvents(sessionId, batch);
    writeSineEvents(sessionId, batch);
    writeSineUniquenessSnapshots(sessionId, batch);

    sineDb.exec("COMMIT");
  } catch (error) {
    sineDb.exec("ROLLBACK");
    throw error;
  }

  return {
    ok: true,
    sessionId,
    births: batch.births?.length ?? 0,
    deaths: batch.deaths?.length ?? 0,
    genomeSnapshots: batch.genomeSnapshots?.length ?? 0,
    stateSnapshots: batch.stateSnapshots?.length ?? 0,
    foodEvents: batch.foodEvents?.length ?? 0,
    uniquenessSnapshots: batch.uniquenessSnapshots?.length ?? 0,
  };
}

function writeSineSession(sessionId, batch) {
  const now = new Date().toISOString();
  sineStatements.upsertSineSession.run(
    sessionId,
    now,
    now,
    readPersistenceStatus(sessionId, batch.status),
    JSON.stringify(batch.marketConfig ?? batch.settings ?? {}),
    JSON.stringify(batch.spawnerConfig ?? {}),
  );
}

function writeSineBirths(sessionId, batch) {
  for (const birth of rows(batch.births)) {
    const spawner = birth.spawner;
    if (!spawner) continue;
    const plasticity = plasticitySnapshot(spawner.genome?.plasticityProfile);
    sineStatements.insertSineBirth.run(
      sessionId,
      spawner.id,
        birth.parentSpawnerId ?? spawner.parentSpawnerId ?? null,
        spawner.lineageId,
        spawner.generation,
        birth.tick ?? spawner.birthTick,
        birth.time ?? birth.tick ?? spawner.birthTick ?? 0,
        finiteNumberOrNull(birth.sourceTimestamp),
        birth.sourceDatetime ?? null,
        stringifyJson(spawner),
      stringifyJson(plasticity.profile),
      plasticity.learningRateMean,
      plasticity.decayRate,
      plasticity.maxLearnedDelta,
    );
  }
}

function writeSineDeaths(sessionId, batch) {
  for (const death of rows(batch.deaths)) {
    const spawner = death.spawner;
    if (!spawner) continue;
    sineStatements.insertSineDeath.run(
        sessionId,
        spawner.id,
        spawner.lineageId,
        spawner.generation,
        eventTick(death, batch),
        eventTime(death, batch),
        finiteNumberOrNull(death.sourceTimestamp),
        death.sourceDatetime ?? null,
        stringifyJson(spawner),
      normalizeDeathCause(death.deathCause),
      finiteNumberOrNull(death.deathEnergyThreshold),
      finiteNumberOrNull(death.deathHealthThreshold),
    );
  }
}

function writeSineGenomeSnapshots(sessionId, batch) {
  for (const snapshot of rows(batch.genomeSnapshots)) {
    const spawner = snapshot.spawner;
    if (!spawner?.genome) continue;
    const plasticity = plasticitySnapshot(spawner.genome.plasticityProfile);
    sineStatements.insertSineGenomeSnapshot.run(
      sessionId,
      spawner.id,
      eventTick(snapshot, batch),
      eventTime(snapshot, batch),
      snapshot.reason ?? "manual",
      stringifyJson(spawner.genome),
      stringifyJson(spawner),
      stringifyJson(plasticity.profile),
      plasticity.learningRateMean,
      plasticity.decayRate,
      plasticity.maxLearnedDelta,
    );
  }
}

function writeSineStateSnapshots(sessionId, batch) {
  for (const snapshot of rows(batch.stateSnapshots)) {
    const plasticity = plasticitySnapshot(snapshot.plasticityProfile);
    const learnedState = normalizeLearnedState(snapshot.learnedState);
    sineStatements.insertSineStateSnapshot.run(
      sessionId,
      snapshot.spawnerId,
      snapshot.lineageId,
      snapshot.generation,
      snapshot.tick,
      snapshot.time ?? snapshot.tick,
      stringifyJson(snapshot),
      finiteNumber(snapshot.learnedDeltaNorm, 0),
      finiteNumber(snapshot.recentLearningSignal, 0),
      integerNumber(snapshot.learningUpdateCount, 0),
      integerNumber(snapshot.reproductionLearningCount, 0),
      finiteNumber(snapshot.plasticityLearningRateMean, plasticity.learningRateMean),
      finiteNumber(snapshot.plasticityDecayRate, plasticity.decayRate),
      finiteNumber(snapshot.plasticityMaxLearnedDelta, plasticity.maxLearnedDelta),
      stringifyJson(learnedState),
      stringifyJson(plasticity.profile),
    );
  }
}

function writeSineFoodEvents(sessionId, batch) {
  for (const event of rows(batch.foodEvents)) {
    const food = event.food;
    if (!food) continue;
    sineStatements.insertSineFoodEvent.run(
      sessionId,
      food.id,
      event.kind,
      food.creatorSpawnerId,
      food.creatorLineageId,
      event.tick ?? food.spawnTick,
      event.time ?? event.tick ?? food.spawnTick,
      stringifyJson(food),
    );
  }
}

function writeSineEvents(sessionId, batch) {
  for (const event of rows(batch.events)) {
    sineStatements.insertSineEvent.run(
      sessionId,
      event.id,
      event.kind,
      event.spawnerId,
      event.lineageId,
      event.tick,
      event.time ?? event.tick,
      stringifyJson(event),
    );
  }
}

function writeSineUniquenessSnapshots(sessionId, batch) {
  const uniquenessCreatedAt = new Date().toISOString();
  for (const snapshot of rows(batch.uniquenessSnapshots)) {
    if (!Number.isFinite(Number(snapshot.spawnerId))) continue;
    sineStatements.insertSineUniquenessSnapshot.run(
      sessionId,
      snapshot.spawnerId,
      snapshot.comparisonTick ?? batch.tick ?? 0,
      snapshot.score ?? 0,
      snapshot.rawDistance ?? 0,
      snapshot.version ?? "unknown",
      snapshot.vectorVersion ?? "unknown",
      snapshot.comparisonPopulationSize ?? 0,
      snapshot.activeFeatureCount ?? 0,
      snapshot.droppedFeatureCount ?? 0,
      stringifyJson(snapshot.nearestNeighborIds ?? []),
      stringifyJson(snapshot.mostSimilarFeatures ?? []),
      stringifyJson(snapshot.mostDissimilarFeatures ?? []),
      uniquenessCreatedAt,
    );
  }
}

function normalizeLearnedState(value) {
  return normalizePersistenceLearnedState(value);
}

function plasticitySnapshot(profile) {
  return plasticitySnapshotFromProfile(profile);
}

function readPersistenceStatus(sessionId, status) {
  const normalized = ["running", "paused", "stopped"].includes(status) ? status : "running";
  const existing = sineStatements.getSineSession.get(sessionId);
  if (existing?.status === "stopped") return "stopped";
  return normalized;
}
