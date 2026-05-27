import { createSpawnerInspectionPayload } from "../src/sine/spawnerInspectionPayload.ts";
import {
  normalizePersistenceLearnedState,
  plasticitySnapshotFromProfile,
  normalizePersistencePlasticityProfile,
} from "../src/sine/persistence/sinePersistenceDtos.ts";
import { summarizeSpawnerPerformance } from "../src/sine/spawner/performance.ts";
import { finiteOr, nonNegativeInteger } from "../src/sine/numeric.ts";
import { sineDb, sineStatements } from "./sineDb.mjs";

export function upsertSineSession({ id, settings, spawnerConfig, status = "running" }) {
  const now = new Date().toISOString();
  sineStatements.upsertSineSession.run(id, now, now, status, JSON.stringify(settings ?? {}), JSON.stringify(spawnerConfig ?? {}));
  return { id, updatedAt: now };
}

export function updateSineSessionStatus(id, status) {
  if (!["running", "paused", "stopped"].includes(status)) return { ok: false, error: "Invalid status" };
  const existing = sineStatements.getSineSession.get(id);
  if (!existing) return { ok: false, error: "Not found" };
  const now = new Date().toISOString();
  const result = sineStatements.updateSineSessionStatus.run(status, now, id);
  return { ok: result.changes > 0, id, status, updatedAt: now };
}

export function deleteSineSession(id) {
  const result = sineStatements.deleteSineSession.run(id);
  return { ok: result.changes > 0, changes: result.changes };
}

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
  upsertSineSession({
    id: sessionId,
    settings: batch.marketConfig ?? batch.settings,
    spawnerConfig: batch.spawnerConfig,
    status: readPersistenceStatus(sessionId, batch.status),
  });
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
      stringifyJson(spawner),
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

export function listSineSessions(limit = 30) {
  return sineStatements.listSineSessions.all(limit).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    settings: parseJson(row.settings_json, {}),
    spawnerConfig: parseJson(row.spawner_config_json, {}),
    births: row.births,
    deaths: row.deaths,
    stateSnapshots: row.state_snapshots,
    latestTick: row.latest_tick ?? 0,
  }));
}

export function getSineSessionAnalysis(sessionId) {
  const session = sineStatements.getSineSession.get(sessionId);
  if (!session) return null;

  const populationRows = sineStatements.listSinePopulationByTick.all(sessionId);
  const resolvedFoods = sineStatements.listSineResolvedFoods.all(sessionId).map((row) => ({
    tick: row.tick,
    food: parseJson(row.food_json, null),
  })).filter((row) => row.food);
  const spawnedCount = sineStatements.countSineSpawnedFoods.get(sessionId)?.count ?? 0;
  const latestStates = sineStatements.listSineLatestSpawnerStates.all(sessionId, sessionId).map((row) => ({
    row,
    state: parseJson(row.state_json, null),
  })).filter((entry) => entry.state);
  const deaths = sineStatements.listSineDeathsForSession.all(sessionId);
  const deathIds = new Set(deaths.map((death) => death.spawner_id));
  const birthsByLineage = new Map(sineStatements.listSineBirthLineages.all(sessionId).map((row) => [row.lineage_id, row.births]));
  const uniquenessRows = sineStatements.listSineLatestUniquenessBySpawner.all(sessionId, sessionId).map(parseUniquenessRow);

  const telemetry = mergeTelemetry(populationRows, resolvedFoods);
  const topSpawners = latestStates
    .map(({ state }) => summarizeSpawnerState(state, deathIds))
    .sort((a, b) => b.averagePayoff - a.averagePayoff || b.children - a.children || b.resolvedCount - a.resolvedCount)
    .slice(0, 12);
  const lineages = summarizeLineages(latestStates.map(({ state }) => state), deathIds, deaths, birthsByLineage);
  const outcome = summarizeOutcomes(resolvedFoods, spawnedCount);
  const uniqueness = {
    mostUnique: uniquenessRows.slice(0, 10),
    mostTypical: [...uniquenessRows].sort((a, b) => a.score - b.score).slice(0, 10),
  };

  return {
    session: {
      id: session.id,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      status: session.status,
      settings: parseJson(session.settings_json, {}),
      spawnerConfig: parseJson(session.spawner_config_json, {}),
    },
    telemetry,
    topSpawners,
    lineages,
    outcome,
    uniqueness,
  };
}

export function getSineSpawnerInspection(sessionId, spawnerId, requestedTick) {
  const session = sineStatements.getSineSession.get(sessionId);
  if (!session) return null;

  const birth = sineStatements.getSineBirth.get(sessionId, spawnerId);
  if (!birth) return null;

  const death = sineStatements.getSineDeath.get(sessionId, spawnerId);
  const tick = requestedTick === undefined || requestedTick === null ? undefined : Number(requestedTick);
  if (Number.isFinite(tick) && tick < birth.birth_tick) return null;

  const genomeRow = Number.isFinite(tick)
    ? sineStatements.getSineGenomeAtTick.get(sessionId, spawnerId, tick)
    : sineStatements.getSineLatestGenome.get(sessionId, spawnerId);
  const stateRow = Number.isFinite(tick)
    ? sineStatements.getSineStateAtTick.get(sessionId, spawnerId, tick)
    : sineStatements.getSineLatestState.get(sessionId, spawnerId);

  const reconstructed = reconstructHistoricalSpawner({ birth, death, genomeRow, stateRow, tick });
  if (!reconstructed) return null;
  const { spawner, deathApplies, effectiveStateRow } = reconstructed;

  const effectiveTick = Number.isFinite(tick) ? tick : stateRow?.tick ?? genomeRow?.tick ?? death?.death_tick ?? birth.birth_tick;
  const lower = Math.max(0, effectiveTick - 250);
  const upper = effectiveTick + 250;
  const recentFoods = sineStatements.listSineFoodAroundTick.all(sessionId, spawnerId, lower, upper).map((row) => parseJson(row.food_json, null)).filter(Boolean);
  const recentEvents = sineStatements.listSineEventsAroundTick.all(sessionId, spawnerId, lower, upper).map((row) => parseJson(row.event_json, null)).filter(Boolean);
  const uniquenessRow = Number.isFinite(tick)
    ? sineStatements.getSineUniquenessAtTick.get(sessionId, spawnerId, tick)
    : sineStatements.getSineLatestUniqueness.get(sessionId, spawnerId);

  return createSpawnerInspectionPayload({
    source: "historical",
    sessionId,
    spawner,
    tick: deathApplies ? death.death_tick : effectiveStateRow?.tick ?? genomeRow?.tick ?? birth.birth_tick,
    requestedTick: Number.isFinite(tick) ? tick : undefined,
    stateSnapshotTick: effectiveStateRow?.tick ?? null,
    genomeSnapshotTick: genomeRow?.tick ?? null,
    exact: Number.isFinite(tick) ? (deathApplies ? death.death_tick === tick : effectiveStateRow?.tick === tick) : true,
    status: deathApplies ? "dead" : "historical",
    uniqueness: uniquenessRow ? parseUniquenessRow(uniquenessRow) : null,
    recentFoods,
    recentEvents,
  });
}

function reconstructHistoricalSpawner({ birth, death, genomeRow, stateRow, tick }) {
  const deathApplies = death && (!Number.isFinite(tick) || death.death_tick <= tick);
  const baseSpawner = deathApplies ? parseJson(death.spawner_json, null) : parseJson(genomeRow?.spawner_json ?? birth.spawner_json, null);
  if (!baseSpawner) return null;

  const genome = deathApplies ? baseSpawner.genome : parseJson(genomeRow?.genome_json ?? baseSpawner.genome, baseSpawner.genome);
  const effectiveStateRow = deathApplies ? null : stateRow;
  const state = parseJson(effectiveStateRow?.state_json, null);
  return {
    deathApplies,
    effectiveStateRow,
    spawner: applyHistoricalStateSnapshot(
      {
        ...baseSpawner,
        genome,
      },
      state,
      stateRow,
    ),
  };
}

function applyHistoricalStateSnapshot(baseSpawner, state, stateRow) {
  if (!state) return baseSpawner;
  return {
    ...baseSpawner,
    energy: state.energy,
    health: state.health,
    ageTicks: state.ageTicks ?? state.age,
    cooldownTicks: state.cooldownTicks ?? state.cooldown,
    hiddenState: state.hiddenState,
    lastAction: state.lastAction,
    spawnedCount: state.spawnedCount,
    resolvedCount: state.resolvedCount,
    wins: state.wins,
    losses: state.losses,
    totalPayoff: state.totalPayoff,
    children: state.children,
    recentPayoffs: state.recentPayoffs,
    learnedState: state.learnedState ?? parseJson(stateRow?.learned_state_json, {}),
  };
}

function parseUniquenessRow(row) {
  return {
    spawnerId: row.spawner_id,
    version: row.version,
    vectorVersion: row.vector_version,
    score: row.score,
    rawDistance: row.raw_distance,
    comparisonTick: row.tick,
    comparisonPopulationSize: row.comparison_population_size,
    activeFeatureCount: row.active_feature_count,
    droppedFeatureCount: row.dropped_feature_count,
    nearestNeighborIds: parseJson(row.nearest_neighbor_ids_json, []),
    mostSimilarFeatures: parseJson(row.most_similar_features_json, []),
    mostDissimilarFeatures: parseJson(row.most_dissimilar_features_json, []),
  };
}

function normalizeLearnedState(value) {
  return normalizePersistenceLearnedState(value);
}

function plasticitySnapshot(profile) {
  return plasticitySnapshotFromProfile(profile);
}

function normalizePlasticityProfile(profile) {
  return normalizePersistencePlasticityProfile(profile);
}

function readPersistenceStatus(sessionId, status) {
  const normalized = ["running", "paused", "stopped"].includes(status) ? status : "running";
  const existing = sineStatements.getSineSession.get(sessionId);
  if (existing?.status === "stopped") return "stopped";
  return normalized;
}

function mergeTelemetry(populationRows, resolvedFoods) {
  const lossPoints = rollingLossPoints(resolvedFoods);
  let lossIndex = 0;
  let latestLoss = 0;
  return downsample(
    populationRows.map((row) => {
      while (lossIndex < lossPoints.length && lossPoints[lossIndex].tick <= row.tick) {
        latestLoss = lossPoints[lossIndex].rollingLoss;
        lossIndex += 1;
      }
      return {
        tick: row.tick,
        population: row.population,
        rollingLoss: latestLoss,
      };
    }),
    700,
  );
}

function rollingLossPoints(resolvedFoods, windowSize = 50) {
  const losses = [];
  const points = [];
  for (const { tick, food } of resolvedFoods) {
    const payoff = Number(food.payoff ?? 0);
    losses.push(Math.max(0, -payoff));
    if (losses.length > windowSize) losses.shift();
    const average = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : 0;
    points.push({ tick, rollingLoss: average });
  }
  return points;
}

function summarizeSpawnerState(state, deathIds) {
  const performance = summarizeSpawnerPerformance(state);
  return {
    spawnerId: state.spawnerId,
    lineageId: state.lineageId,
    generation: state.generation,
    tick: state.tick,
    status: deathIds.has(state.spawnerId) ? "dead" : "alive",
    energy: state.energy,
    health: state.health,
    children: performance.children,
    spawnedCount: performance.spawnedCount,
    resolvedCount: performance.resolvedCount,
    hitRate: performance.hitRate,
    wins: performance.wins,
    losses: performance.losses,
    totalPayoff: performance.totalPayoff,
    averagePayoff: performance.averagePayoff,
    learnedDeltaNorm: performance.learnedDeltaNorm,
    learningUpdateCount: performance.learningUpdateCount,
    reproductionLearningCount: performance.reproductionLearningCount,
    plasticityLearningRateMean: performance.plasticityLearningRateMean,
  };
}

function summarizeLineages(states, deathIds, deaths, birthsByLineage) {
  const byLineage = new Map();
  for (const state of states) {
    const lineage = byLineage.get(state.lineageId) ?? {
      lineageId: state.lineageId,
      latestPopulation: 0,
      livingPopulation: 0,
      births: birthsByLineage.get(state.lineageId) ?? 0,
      deaths: 0,
      totalPayoff: 0,
      resolvedCount: 0,
      maxGeneration: 0,
      children: 0,
    };
    lineage.latestPopulation += 1;
    if (!deathIds.has(state.spawnerId)) lineage.livingPopulation += 1;
    lineage.totalPayoff += Number(state.totalPayoff ?? 0);
    lineage.resolvedCount += Number(state.resolvedCount ?? 0);
    lineage.children += Number(state.children ?? 0);
    lineage.maxGeneration = Math.max(lineage.maxGeneration, Number(state.generation ?? 0));
    byLineage.set(state.lineageId, lineage);
  }
  for (const death of deaths) {
    const lineage = byLineage.get(death.lineage_id) ?? {
      lineageId: death.lineage_id,
      latestPopulation: 0,
      livingPopulation: 0,
      births: birthsByLineage.get(death.lineage_id) ?? 0,
      deaths: 0,
      totalPayoff: 0,
      resolvedCount: 0,
      maxGeneration: Number(death.generation ?? 0),
      children: 0,
    };
    lineage.deaths += 1;
    lineage.maxGeneration = Math.max(lineage.maxGeneration, Number(death.generation ?? 0));
    byLineage.set(death.lineage_id, lineage);
  }
  return [...byLineage.values()]
    .map((lineage) => ({
      ...lineage,
      averagePayoff: lineage.resolvedCount > 0 ? lineage.totalPayoff / lineage.resolvedCount : 0,
    }))
    .sort((a, b) => b.livingPopulation - a.livingPopulation || b.averagePayoff - a.averagePayoff);
}

function summarizeOutcomes(resolvedFoods, spawnedCount) {
  let wins = 0;
  let losses = 0;
  let totalPayoff = 0;
  for (const { food } of resolvedFoods) {
    const payoff = Number(food.payoff ?? 0);
    totalPayoff += payoff;
    if (food.status === "win" || payoff > 0) wins += 1;
    else losses += 1;
  }
  const resolved = resolvedFoods.length;
  return {
    spawned: spawnedCount,
    resolved,
    pending: Math.max(0, spawnedCount - resolved),
    wins,
    losses,
    hitRate: resolved > 0 ? wins / resolved : 0,
    averagePayoff: resolved > 0 ? totalPayoff / resolved : 0,
  };
}

function downsample(rows, limit) {
  if (rows.length <= limit) return rows;
  const result = [];
  const step = (rows.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    result.push(rows[Math.round(index * step)]);
  }
  return result;
}

function finiteNumber(value, fallback) {
  return finiteOr(value, fallback);
}

function integerNumber(value, fallback) {
  return nonNegativeInteger(value, fallback);
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function eventTick(row, batch) {
  return row.tick ?? batch.tick ?? 0;
}

function eventTime(row, batch) {
  return row.time ?? row.tick ?? batch.tick ?? 0;
}

function stringifyJson(value) {
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
