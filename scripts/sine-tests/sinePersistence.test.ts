import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import {
  DEFAULT_SPAWNER_CONFIG,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
  computeSpawnerUniqueness,
  type SpawnerAgent,
  type SpawnerEvent,
  type SpawnerUniquenessScore,
} from "../../src/sine/spawnerSimulation";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import { buildSinePersistencePacket } from "../../src/sine/persistence/buildSinePersistencePacket";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, getSineSessionAnalysis, getSineSpawnerInspection, listSineSessions, saveSinePersistenceBatch, updateSineSessionStatus, upsertSineSession } from "../../server/sineRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../../server/sineDb.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";

function testSineRepositoryPersistsAndReconstructsSpawner() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine");

  upsertSineSession({ id: sessionId, settings: INITIAL_SETTINGS, spawnerConfig: DEFAULT_SPAWNER_CONFIG });
  const result = saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: simulation.world.tick,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [{ tick: spawner.birthTick, spawner }],
    deaths: [],
    genomeSnapshots: [{ tick: spawner.birthTick, reason: "initial", spawner }],
    stateSnapshots: [
      {
        spawnerId: spawner.id,
        lineageId: spawner.lineageId,
        generation: spawner.generation,
        tick: simulation.world.tick,
        energy: spawner.energy,
        health: spawner.health,
        age: spawner.ageTicks,
        cooldown: spawner.cooldownTicks,
        hiddenState: spawner.hiddenState,
        lastAction: spawner.lastAction,
        spawnedCount: spawner.spawnedCount,
        resolvedCount: spawner.resolvedCount,
        wins: spawner.wins,
        losses: spawner.losses,
        totalPayoff: spawner.totalPayoff,
        children: spawner.children,
        recentPayoffs: spawner.recentPayoffs,
      },
    ],
    uniquenessSnapshots: [{ spawnerId: spawner.id, ...uniqueness }],
    foodEvents: [],
    events: [],
  });
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.equal(result.ok, true);
  assert.ok(inspection);
  assert.equal(inspection?.source, "historical");
  assert.equal(inspection?.sessionId, sessionId);
  assert.equal(inspection?.spawnerId, spawner.id);
  assert.equal(inspection?.exact, true);
  assert.equal(inspection?.genome.units.length, spawner.genome.units.length);
  assert.deepEqual(inspection?.genome.perception, spawner.genome.perception);
  assert.deepEqual(inspection?.genome.mutationProfile, spawner.genome.mutationProfile);
  assert.deepEqual(inspection?.spawner.learnedState.connectionDeltas, {});
  assert.equal(inspection?.spawner.learnedState.learningUpdateCount, 0);
  assert.equal(inspection?.stateSnapshotTick, simulation.world.tick);
  assert.equal(inspection?.uniqueness?.version, uniqueness.version);
  assert.equal(inspection?.uniqueness?.vectorVersion, uniqueness.vectorVersion);
  assert.equal(inspection?.uniqueness?.score, uniqueness.score);
  assert.equal(inspection?.uniqueness?.comparisonPopulationSize, uniqueness.comparisonPopulationSize);
  assert.ok(Array.isArray(inspection?.uniqueness?.mostDissimilarFeatures));
}

function testSineRepositoryNormalizesLegacyGenomeWithoutPerceptionFields() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const legacySpawner = structuredClone(spawner) as any;
  delete legacySpawner.genome.perception;
  delete legacySpawner.genome.mutationProfile;
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-legacy-genome");

  saveSinePersistenceBatch(makePersistenceBatch(sessionId, simulation, legacySpawner, uniqueness));
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.ok(inspection);
  assert.equal(inspection?.genome.perception.deltaLagPairs.length, 5);
  assert(Number.isFinite(inspection?.genome.mutationProfile.weightMutationStdDev));
}

function testSineRepositoryReturnsNullForUnknownSpawner() {
  const sessionId = uniqueTestSessionId("test-sine");
  upsertSineSession({ id: sessionId, settings: INITIAL_SETTINGS, spawnerConfig: DEFAULT_SPAWNER_CONFIG });
  assert.equal(getSineSpawnerInspection(sessionId, 999999, 0), null);
}

function testSineRepositoryUpsertsRicherUniquenessDetail() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = uniqueTestSessionId("test-sine-upsert");
  const lightweight = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  const detailed = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick, { detailSpawnerId: spawner.id }).get(spawner.id);
  assert.ok(lightweight);
  assert.ok(detailed);
  assert.equal(lightweight.mostDissimilarFeatures.length, 0);
  assert.ok(detailed.mostDissimilarFeatures.length > 0);

  saveSinePersistenceBatch(makePersistenceBatch(sessionId, simulation, spawner, lightweight));
  saveSinePersistenceBatch(makePersistenceBatch(sessionId, simulation, spawner, detailed, false));
  const upgraded = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  assert.ok((upgraded?.uniqueness?.mostDissimilarFeatures.length ?? 0) > 0);

  saveSinePersistenceBatch(makePersistenceBatch(sessionId, simulation, spawner, lightweight, false));
  const stillDetailed = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  assert.ok((stillDetailed?.uniqueness?.mostDissimilarFeatures.length ?? 0) > 0);
}

function testSineRepositoryPreservesStoppedStatusAndAnalyzesRuns() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-lifecycle");

  saveSinePersistenceBatch({ ...makePersistenceBatch(sessionId, simulation, spawner, uniqueness), status: "stopped" });
  saveSinePersistenceBatch({ ...makePersistenceBatch(sessionId, simulation, spawner, uniqueness, false), status: "running" });

  const saved = listSineSessions(200).find((session: any) => session.id === sessionId);
  assert.equal(saved?.status, "stopped");
  assert.equal(saved?.latestTick, simulation.world.tick);

  const analysis = getSineSessionAnalysis(sessionId);
  assert.ok(analysis);
  assert.equal(analysis.session.status, "stopped");
  assert.ok(analysis.telemetry.length > 0);
  assert.ok(analysis.topSpawners.some((entry: any) => entry.spawnerId === spawner.id));
  assert.deepEqual(analysis.outcome, {
    spawned: 0,
    resolved: 0,
    pending: 0,
    wins: 0,
    losses: 0,
    hitRate: 0,
    averagePayoff: 0,
  });
  assert.deepEqual(
    analysis.topSpawners.find((entry: any) => entry.spawnerId === spawner.id),
    {
      spawnerId: spawner.id,
      lineageId: spawner.lineageId,
      generation: spawner.generation,
      tick: simulation.world.tick,
      status: "alive",
      energy: spawner.energy,
      health: spawner.health,
      children: 0,
      spawnedCount: 0,
      resolvedCount: 0,
      hitRate: 0,
      wins: 0,
      losses: 0,
      totalPayoff: 0,
      averagePayoff: 0,
      learnedDeltaNorm: 0,
      learningUpdateCount: 0,
      reproductionLearningCount: 0,
      plasticityLearningRateMean: 0,
    },
  );

  const paused = updateSineSessionStatus(sessionId, "paused");
  assert.equal(paused.ok, true);
  assert.equal(listSineSessions(200).find((session: any) => session.id === sessionId)?.status, "paused");

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
  assert.equal(getSineSessionAnalysis(sessionId), null);
}

function testSineRepositoryStoresMarketRuntimeConfigForHistoricalRuns() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-market-config");
  const marketConfig = {
    source: "btcusd_5m",
    generated: INITIAL_SETTINGS,
    playback: { rocLengthBars: 50, startDateTime: "2021-01-01T00:00", barsPerSecond: 30 },
  };

  saveSinePersistenceBatch({ ...makePersistenceBatch(sessionId, simulation, spawner, uniqueness), marketConfig });
  const saved = listSineSessions(200).find((session: any) => session.id === sessionId);
  const analysis = getSineSessionAnalysis(sessionId);

  assert.equal(saved?.settings.source, "btcusd_5m");
  assert.equal(saved?.settings.playback.rocLengthBars, 50);
  assert.equal(analysis?.session.settings.source, "btcusd_5m");
}

function testSineRepositoryStoresIndexedPlasticityAndLearnedState() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  spawner.learnedState.connectionDeltas["7"] = 0.3;
  spawner.learnedState.recentLearningSignal = -0.2;
  spawner.learnedState.learningUpdateCount = 3;
  spawner.learnedState.reproductionLearningCount = 1;
  spawner.genome.plasticityProfile = {
    ...spawner.genome.plasticityProfile,
    weightLearningRate: 0.04,
    biasLearningRate: 0.02,
    experienceDecayRate: 0.1,
    maxLearnedDelta: 6,
  };
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-learning-columns");

  const batch = makePersistenceBatch(sessionId, simulation, spawner, uniqueness) as any;
  batch.stateSnapshots[0].age = 17;
  batch.stateSnapshots[0].cooldown = 3;
  batch.stateSnapshots[0].learnedState = spawner.learnedState;
  batch.stateSnapshots[0].learnedDeltaNorm = 0.3;
  batch.stateSnapshots[0].recentLearningSignal = -0.2;
  batch.stateSnapshots[0].learningUpdateCount = 3;
  batch.stateSnapshots[0].reproductionLearningCount = 1;
  batch.stateSnapshots[0].plasticityProfile = spawner.genome.plasticityProfile;
  batch.stateSnapshots[0].plasticityLearningRateMean = 0.03;
  batch.stateSnapshots[0].plasticityDecayRate = 0.1;
  batch.stateSnapshots[0].plasticityMaxLearnedDelta = 6;

  saveSinePersistenceBatch(batch);
  const stateRow = sineDb
    .prepare("SELECT learned_delta_norm, recent_learning_signal, learning_update_count, reproduction_learning_count, plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta, learned_state_json, plasticity_profile_json FROM sine_spawner_state_snapshots WHERE session_id = ? AND spawner_id = ?")
    .get(sessionId, spawner.id) as any;
  const birthRow = sineDb
    .prepare("SELECT plasticity_profile_json, plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta FROM sine_spawner_births WHERE session_id = ? AND spawner_id = ?")
    .get(sessionId, spawner.id) as any;
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.equal(stateRow.learned_delta_norm, 0.3);
  assert.equal(stateRow.recent_learning_signal, -0.2);
  assert.equal(stateRow.learning_update_count, 3);
  assert.equal(stateRow.reproduction_learning_count, 1);
  assert.equal(stateRow.plasticity_learning_rate_mean, 0.03);
  assert.equal(stateRow.plasticity_decay_rate, 0.1);
  assert.equal(stateRow.plasticity_max_learned_delta, 6);
  assert.equal(JSON.parse(stateRow.learned_state_json).connectionDeltas["7"], 0.3);
  assert.equal(JSON.parse(stateRow.plasticity_profile_json).weightLearningRate, 0.04);
  assert.equal(JSON.parse(birthRow.plasticity_profile_json).biasLearningRate, 0.02);
  assert.equal(birthRow.plasticity_learning_rate_mean, 0.03);
  assert.equal(birthRow.plasticity_decay_rate, 0.1);
  assert.equal(birthRow.plasticity_max_learned_delta, 6);
  assert.equal(inspection?.spawner.ageTicks, 17);
  assert.equal(inspection?.spawner.cooldownTicks, 3);
  assert.equal(inspection?.spawner.learnedState.connectionDeltas["7"], 0.3);
}

function testSineRepositoryPersistsLearningProducedByRun() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 1,
    maxSpawners: 1,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
    minimumSpawnEnergySurplus: 0,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0.25,
    plasticityMaxLearnedDelta: 10,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const events: SpawnerEvent[] = [];
  simulation.world.eventSink = (event) => events.push(structuredClone(event));
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.minHorizonTicks = 1;
  spawner.genome.maxHorizonTicks = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
  );

  advanceSimulationToTarget(simulation, 1, 10);
  advanceSimulationToTarget(simulation, 2, 10);

  assert.equal(simulation.world.totalResolved, 1);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
  const learnedKeys = Object.keys(spawner.learnedState.connectionDeltas).length + Object.keys(spawner.learnedState.outputBiasDeltas).length;
  assert(learnedKeys > 0);

  const sessionId = uniqueTestSessionId("test-sine-learning-run");
  const packet = buildSinePersistencePacket({
    sessionId: 1,
    persistentSessionId: sessionId,
    simulation,
    settings: INITIAL_SETTINGS,
    marketConfig: simulation.marketConfig,
    spawnerConfig: simulation.world.config,
    events,
    includeInitial: true,
    includeStateSnapshot: true,
    pendingUniquenessSnapshots: [],
    uniquenessScores: new Map(),
    includeFullUniquenessTick: null,
  });

  saveSinePersistenceBatch(packet);
  const stateRow = sineDb
    .prepare("SELECT learned_delta_norm, learning_update_count, learned_state_json FROM sine_spawner_state_snapshots WHERE session_id = ? AND spawner_id = ?")
    .get(sessionId, spawner.id) as any;
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  const analysis = getSineSessionAnalysis(sessionId);

  assert(stateRow.learned_delta_norm > 0);
  assert.equal(stateRow.learning_update_count, 1);
  assert(Object.keys(JSON.parse(stateRow.learned_state_json).connectionDeltas).length > 0);
  assert.equal(inspection?.spawner.learnedState.learningUpdateCount, 1);
  const analyzed = analysis?.topSpawners.find((entry: any) => entry.spawnerId === spawner.id);
  assert((analyzed?.learnedDeltaNorm ?? 0) > 0);
  assert.equal(analyzed?.learningUpdateCount, 1);
}

function testSineRepositoryUsesDeathSnapshotAfterDeath() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = uniqueTestSessionId("test-sine-death-snapshot");
  const liveSpawner = structuredClone(spawner);
  liveSpawner.energy = 50;
  liveSpawner.health = 60;
  liveSpawner.ageTicks = 1;
  const deadSpawner = structuredClone(spawner);
  deadSpawner.energy = -5;
  deadSpawner.health = 0;
  deadSpawner.ageTicks = 2;

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 3,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [{ tick: spawner.birthTick, spawner }],
    deaths: [{ tick: 2, spawner: deadSpawner }],
    genomeSnapshots: [{ tick: spawner.birthTick, reason: "initial", spawner }],
    stateSnapshots: [
      stateSnapshotFor(liveSpawner, 1),
      { ...stateSnapshotFor(liveSpawner, 3), energy: 99, health: 99, age: 3 },
    ],
    uniquenessSnapshots: [],
    foodEvents: [],
    events: [],
  });

  const beforeDeath = getSineSpawnerInspection(sessionId, spawner.id, 1);
  const afterDeath = getSineSpawnerInspection(sessionId, spawner.id, 3);
  const latest = getSineSpawnerInspection(sessionId, spawner.id, null);
  const beforeBirth = getSineSpawnerInspection(sessionId, spawner.id, -1);

  assert.equal(beforeBirth, null);
  assert.equal(beforeDeath?.status, "historical");
  assert.equal(beforeDeath?.spawner.energy, 50);
  assert.equal(beforeDeath?.requestedTick, 1);
  assert.equal(beforeDeath?.exact, true);
  assert.equal(beforeDeath?.stateSnapshotTick, 1);
  assert.equal(beforeDeath?.genomeSnapshotTick, 0);
  assert.equal(afterDeath?.status, "dead");
  assert.equal(afterDeath?.spawner.energy, -5);
  assert.equal(afterDeath?.spawner.health, 0);
  assert.equal(afterDeath?.requestedTick, 3);
  assert.equal(afterDeath?.tick, 2);
  assert.equal(afterDeath?.exact, false);
  assert.equal(afterDeath?.stateSnapshotTick ?? null, null);
  assert.equal(latest?.status, "dead");
  assert.equal(latest?.spawner.energy, -5);
}

function stateSnapshotFor(spawner: SpawnerAgent, tick: number) {
  return {
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    generation: spawner.generation,
    tick,
    energy: spawner.energy,
    health: spawner.health,
    age: spawner.ageTicks,
    cooldown: spawner.cooldownTicks,
    hiddenState: spawner.hiddenState,
    lastAction: spawner.lastAction,
    spawnedCount: spawner.spawnedCount,
    resolvedCount: spawner.resolvedCount,
    wins: spawner.wins,
    losses: spawner.losses,
    totalPayoff: spawner.totalPayoff,
    children: spawner.children,
    recentPayoffs: spawner.recentPayoffs,
  };
}

function makePersistenceBatch(
  sessionId: string,
  simulation: ReturnType<typeof createSimulationState>,
  spawner: SpawnerAgent,
  uniqueness: SpawnerUniquenessScore,
  includeSpawnerRows = true,
) {
  return {
    persistentSessionId: sessionId,
    tick: simulation.world.tick,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: includeSpawnerRows ? [{ tick: spawner.birthTick, spawner }] : [],
    deaths: [],
    genomeSnapshots: includeSpawnerRows ? [{ tick: spawner.birthTick, reason: "initial", spawner }] : [],
    stateSnapshots: includeSpawnerRows
      ? [
          {
            spawnerId: spawner.id,
            lineageId: spawner.lineageId,
            generation: spawner.generation,
            tick: simulation.world.tick,
            energy: spawner.energy,
            health: spawner.health,
            age: spawner.ageTicks,
            cooldown: spawner.cooldownTicks,
            hiddenState: spawner.hiddenState,
            lastAction: spawner.lastAction,
            spawnedCount: spawner.spawnedCount,
            resolvedCount: spawner.resolvedCount,
            wins: spawner.wins,
            losses: spawner.losses,
            totalPayoff: spawner.totalPayoff,
            children: spawner.children,
            recentPayoffs: spawner.recentPayoffs,
          },
        ]
      : [],
    uniquenessSnapshots: [{ spawnerId: spawner.id, ...uniqueness }],
    foodEvents: [],
    events: [],
  };
}

export const tests: SineTest[] = [
  { name: "Sine Repository Persists And Reconstructs Spawner", run: testSineRepositoryPersistsAndReconstructsSpawner },
  { name: "Sine Repository Normalizes Legacy Genome Without Perception Fields", run: testSineRepositoryNormalizesLegacyGenomeWithoutPerceptionFields },
  { name: "Sine Repository Returns Null For Unknown Spawner", run: testSineRepositoryReturnsNullForUnknownSpawner },
  { name: "Sine Repository Upserts Richer Uniqueness Detail", run: testSineRepositoryUpsertsRicherUniquenessDetail },
  { name: "Sine Repository Preserves Stopped Status And Analyzes Runs", run: testSineRepositoryPreservesStoppedStatusAndAnalyzesRuns },
  { name: "Sine Repository Stores Market Runtime Config For Historical Runs", run: testSineRepositoryStoresMarketRuntimeConfigForHistoricalRuns },
  { name: "Sine Repository Stores Indexed Plasticity And Learned State", run: testSineRepositoryStoresIndexedPlasticityAndLearnedState },
  { name: "Sine Repository Persists Learning Produced By Run", run: testSineRepositoryPersistsLearningProducedByRun },
  { name: "Sine Repository Uses Death Snapshot After Death", run: testSineRepositoryUsesDeathSnapshotAfterDeath },
];
