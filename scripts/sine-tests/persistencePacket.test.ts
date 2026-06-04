import { strict as assert } from "node:assert";
import { buildSinePersistencePacket } from "../../src/sine/persistence/buildSinePersistencePacket";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { MARKET_TIME_MODEL } from "../../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG, computeSpawnerUniqueness, type SpawnerEvent, type SpawnerFood } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import type { SineTest } from "./helpers";

function testPersistencePacketBuilderMapsAllRowFamilies() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 2 });
  const parent = simulation.world.spawners[0];
  const second = simulation.world.spawners[1];
  assert.ok(parent);
  assert.ok(second);
  second.energy = DEFAULT_SPAWNER_CONFIG.deathEnergy - 1;
  second.health = DEFAULT_SPAWNER_CONFIG.deathHealth + 10;
  parent.learnedState.connectionDeltas["123"] = 0.5;
  parent.learnedState.recentLearningSignal = 0.25;
  parent.learnedState.learningUpdateCount = 2;
  parent.traceStore.traces["1"] = {
    id: 1,
    tick: 1,
    action: "long",
    strength: 0.5,
    activeConnectionIds: [123],
    connectionActivations: { "123": { source: 1, target: 0 } },
  };
  const child = structuredClone(parent);
  child.id = 99;
  child.parentSpawnerId = parent.id;
  child.generation = parent.generation + 1;
  const food: SpawnerFood = {
    id: 7,
    creatorSpawnerId: parent.id,
    creatorLineageId: parent.lineageId,
    spawnTick: 1,
    resolveTick: 3,
    direction: "long",
    strength: 0.7,
    horizonTicks: 2,
    entrySignal: 1,
    exitSignal: 1.5,
    entryPayoffScale: 0.75,
    payoffScaleWindowTicks: 21,
    payoffScaleSampleStepTicks: 2,
    payoff: 0.3,
    status: "win",
  };
  const events: SpawnerEvent[] = [
    { id: 1, kind: "spawn", tick: 1, spawnerId: parent.id, lineageId: parent.lineageId, foodId: food.id, foodEvent: food },
    {
      id: 2,
      kind: "resolve",
      tick: 3,
      spawnerId: parent.id,
      lineageId: parent.lineageId,
      foodId: food.id,
      status: "win",
      payoff: 0.3,
      foodEvent: food,
    },
    {
      id: 3,
      kind: "reproduction",
      tick: 4,
      spawnerId: parent.id,
      lineageId: parent.lineageId,
      childSpawnerId: child.id,
      spawnerSnapshot: parent,
      childSpawnerSnapshot: child,
    },
    { id: 4, kind: "death", tick: 5, spawnerId: second.id, lineageId: second.lineageId, spawnerSnapshot: second },
  ];
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick, { detailSpawnerId: parent.id });
  const parentUniqueness = uniqueness.get(parent.id);
  assert.ok(parentUniqueness);

  const packet = buildSinePersistencePacket({
    sessionId: 1,
    persistentSessionId: "test-session",
    simulation,
    settings: INITIAL_SETTINGS,
    marketConfig: {
      source: "btcusd_5m",
      timeModel: MARKET_TIME_MODEL,
      generated: INITIAL_SETTINGS,
      playback: { rocLengthBars: 50, startDateTime: "2021-01-01T00:00", barsPerSecond: 30, generatedTicksPerSecond: 5 },
    },
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    events,
    includeInitial: true,
    includeStateSnapshot: true,
    pendingUniquenessSnapshots: [{ spawnerId: parent.id, score: parentUniqueness }],
    uniquenessScores: uniqueness,
    includeFullUniquenessTick: simulation.world.tick,
  });

  assert.equal(packet.births.length, 3);
  assert.equal(packet.deaths.length, 1);
  assert.equal(packet.foodEvents.length, 2);
  assert.equal(packet.foodEvents[0]?.food.entryPayoffScale, 0.75);
  assert.equal(packet.foodEvents[0]?.food.payoffScaleWindowTicks, 21);
  assert.equal(packet.foodEvents[0]?.food.payoffScaleSampleStepTicks, 2);
  assert.equal(packet.genomeSnapshots.length, 3);
  assert.equal(packet.stateSnapshots.length, simulation.world.spawners.length);
  assert.equal(packet.events.length, events.length);
  assert.equal(packet.marketConfig?.source, "btcusd_5m");
  assert.equal(packet.marketConfig?.playback.rocLengthBars, 50);
  assert.equal(packet.uniquenessSnapshots.filter((snapshot) => snapshot.spawnerId === parent.id).length, 1);
  const parentUniquenessSnapshot = packet.uniquenessSnapshots.find((snapshot) => snapshot.spawnerId === parent.id);
  assert.ok(parentUniquenessSnapshot);
  const originalNearestNeighborIds = [...parentUniquenessSnapshot.nearestNeighborIds];
  parentUniqueness.nearestNeighborIds.push(999);
  if (parentUniqueness.mostSimilarFeatures[0]) parentUniqueness.mostSimilarFeatures[0].value += 100;
  assert.deepEqual(parentUniquenessSnapshot.nearestNeighborIds, originalNearestNeighborIds);
  assert.equal(packet.births.some((birth) => birth.spawner.id === child.id && birth.parentSpawnerId === parent.id), true);
  assert.deepEqual(packet.births.find((birth) => birth.spawner.id === parent.id)?.spawner.traceStore.traces, {});
  assert.deepEqual(packet.genomeSnapshots.find((snapshot) => snapshot.spawner.id === parent.id)?.spawner.traceStore.traces, {});
  assert.deepEqual(packet.deaths[0]?.spawner.traceStore.traces, {});
  assert.equal(packet.deaths[0]?.deathCause, "low_energy");
  assert.equal(packet.deaths[0]?.deathEnergyThreshold, DEFAULT_SPAWNER_CONFIG.deathEnergy);
  assert.equal(packet.deaths[0]?.deathHealthThreshold, DEFAULT_SPAWNER_CONFIG.deathHealth);
  const parentState = packet.stateSnapshots.find((snapshot) => snapshot.spawnerId === parent.id);
  assert.ok(parentState);
  assert.equal(parentState.learnedState.connectionDeltas["123"], 0.5);
  assert.equal(parentState.learnedDeltaNorm, 0.5);
  assert.equal(parentState.recentLearningSignal, 0.25);
  assert.equal(parentState.learningUpdateCount, 2);
  assert.equal(parentState.reproductionLearningCount, 0);
  assert.equal(parentState.plasticityLearningRateMean, 0.009000000000000001);
}

export const tests: SineTest[] = [
  { name: "Persistence Packet Builder Maps All Row Families", run: testPersistencePacketBuilderMapsAllRowFamilies },
];
