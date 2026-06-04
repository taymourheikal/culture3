import { createSpawnerInspectionPayload } from "../src/sine/spawnerInspectionPayload.ts";
import { sineStatements } from "./sineDb.mjs";
import { parseJson } from "./sineRepositoryUtils.mjs";

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
