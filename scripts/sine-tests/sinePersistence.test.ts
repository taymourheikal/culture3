import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG, computeSpawnerUniqueness, type SpawnerAgent, type SpawnerUniquenessScore } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, getSineSessionAnalysis, getSineSpawnerInspection, listSineSessions, saveSinePersistenceBatch, updateSineSessionStatus, upsertSineSession } from "../../server/sineRepository.mjs";
import type { SineTest } from "./helpers";

function testSineRepositoryPersistsAndReconstructsSpawner() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = `test-sine-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

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
  const sessionId = `test-sine-legacy-genome-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

  saveSinePersistenceBatch(makePersistenceBatch(sessionId, simulation, legacySpawner, uniqueness));
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.ok(inspection);
  assert.equal(inspection?.genome.perception.deltaLagPairs.length, 5);
  assert(Number.isFinite(inspection?.genome.mutationProfile.weightMutationStdDev));
}

function testSineRepositoryReturnsNullForUnknownSpawner() {
  const sessionId = `test-sine-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  upsertSineSession({ id: sessionId, settings: INITIAL_SETTINGS, spawnerConfig: DEFAULT_SPAWNER_CONFIG });
  assert.equal(getSineSpawnerInspection(sessionId, 999999, 0), null);
}

function testSineRepositoryUpsertsRicherUniquenessDetail() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = `test-sine-upsert-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
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
  const sessionId = `test-sine-lifecycle-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

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
  const sessionId = `test-sine-market-config-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
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
];
