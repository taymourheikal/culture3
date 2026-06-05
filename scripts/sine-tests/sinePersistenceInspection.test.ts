import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { getSineSpawnerInspection, saveSinePersistenceBatch, upsertSineSession } from "../../server/sineRepository.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";
import { cloneSpawnerWith, persistenceBatchForSpawner, stateSnapshotFor, uniquenessForSpawner } from "./sinePersistenceFixtures";

function testSineRepositoryNormalizesLegacyGenomeWithoutPerceptionFields() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const legacySpawner = structuredClone(spawner) as any;
  delete legacySpawner.genome.perception;
  delete legacySpawner.genome.mutationProfile;
  const uniqueness = uniquenessForSpawner(simulation, spawner);
  const sessionId = uniqueTestSessionId("test-sine-legacy-genome");

  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, legacySpawner, uniqueness));
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
  const lightweight = uniquenessForSpawner(simulation, spawner);
  const detailed = uniquenessForSpawner(simulation, spawner, { detailed: true });
  assert.equal(lightweight.mostDissimilarFeatures.length, 0);
  assert.ok(detailed.mostDissimilarFeatures.length > 0);

  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, spawner, lightweight));
  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, spawner, detailed, false));
  const upgraded = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  assert.ok((upgraded?.uniqueness?.mostDissimilarFeatures.length ?? 0) > 0);

  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, spawner, lightweight, false));
  const stillDetailed = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  assert.ok((stillDetailed?.uniqueness?.mostDissimilarFeatures.length ?? 0) > 0);
}

function testSineRepositoryUsesDeathSnapshotAfterDeath() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = uniqueTestSessionId("test-sine-death-snapshot");
  const liveSpawner = cloneSpawnerWith(spawner, { energy: 50, health: 60, ageTicks: 1 });
  const deadSpawner = cloneSpawnerWith(spawner, { energy: -5, health: 0, ageTicks: 2 });

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

export const tests: SineTest[] = [
  { name: "Sine Repository Normalizes Legacy Genome Without Perception Fields", run: testSineRepositoryNormalizesLegacyGenomeWithoutPerceptionFields },
  { name: "Sine Repository Returns Null For Unknown Spawner", run: testSineRepositoryReturnsNullForUnknownSpawner },
  { name: "Sine Repository Upserts Richer Uniqueness Detail", run: testSineRepositoryUpsertsRicherUniquenessDetail },
  { name: "Sine Repository Uses Death Snapshot After Death", run: testSineRepositoryUsesDeathSnapshotAfterDeath },
];
