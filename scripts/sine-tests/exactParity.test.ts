import { strict as assert } from "node:assert";
import { runHeadlessSineExperiment } from "../../src/sine/headless/runner";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { resolveFoods } from "../../src/sine/spawner/reward";
import {
  activeConnections,
  advanceSpawnerWorldToTimeline,
  connectionDeltaKey,
  createSpawnerWorld,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
} from "../../src/sine/spawnerSimulation";
import { strictWorldDigest } from "../../src/sine/testing/strictWorldDigest";
import { createMemorySink } from "./headlessFixtures";
import type { SineTest } from "./helpers";

function testStrictDigestCoversRuntimeParityFields() {
  const digest = strictWorldDigest(createHighActionWorld());
  const baseline = structuredClone(digest);
  assert.deepEqual(digest, baseline);

  const hiddenDrift = structuredClone(digest);
  const hiddenKey = Object.keys(hiddenDrift.spawners[0]?.hiddenState ?? {})[0];
  assert.ok(hiddenKey);
  hiddenDrift.spawners[0].hiddenState[hiddenKey] += Number.EPSILON;
  assert.notDeepEqual(hiddenDrift, baseline);

  const learnedDrift = structuredClone(digest);
  const learnedKey = Object.keys(learnedDrift.spawners[0]?.learnedState.connectionDeltas ?? {})[0];
  assert.ok(learnedKey);
  delete learnedDrift.spawners[0].learnedState.connectionDeltas[learnedKey];
  assert.notDeepEqual(learnedDrift, baseline);

  const foodOrderDrift = structuredClone(digest);
  foodOrderDrift.foods.reverse();
  assert.notDeepEqual(foodOrderDrift, baseline);

  const eventOrderDrift = structuredClone(digest);
  eventOrderDrift.recentEvents.reverse();
  assert.notDeepEqual(eventOrderDrift, baseline);

  const traceDrift = strictWorldDigest(createTraceRetentionWorld());
  const traceBaseline = structuredClone(traceDrift);
  assert.ok(traceDrift.spawners[0]?.traces.length);
  traceDrift.spawners[0].traces[0].connectionActivations[traceDrift.spawners[0].traces[0].activeConnectionIds[0]].source += Number.EPSILON;
  assert.notDeepEqual(traceDrift, traceBaseline);
}

function testStrictDigestCoversNormalHighActionAndHighReproductionWorlds() {
  const normal = strictWorldDigest(createNormalWorld());
  const highAction = strictWorldDigest(createHighActionWorld());
  const highReproduction = strictWorldDigest(createHighReproductionWorld());

  assert.deepEqual(normal, strictWorldDigest(createNormalWorld()));
  assert.deepEqual(highAction, strictWorldDigest(createHighActionWorld()));
  assert.deepEqual(highReproduction, strictWorldDigest(createHighReproductionWorld()));
  assert.notDeepEqual(normal, highAction);
  assert.notDeepEqual(normal, highReproduction);
  assert.ok(highAction.spawners.some((spawner: any) => Object.keys(spawner.learnedState.connectionDeltas).length > 0));
  assert.ok(highReproduction.spawners.some((spawner: any) => spawner.generation > 0));
}

function testStrictDigestCoversMutatedPerceptionTraits() {
  const firstWorld = createMutatedPerceptionWorld();
  const secondWorld = createMutatedPerceptionWorld();
  const first = strictWorldDigest(firstWorld);
  const second = strictWorldDigest(secondWorld);

  assert.deepEqual(first, second);
  assert.ok(first.spawners.some((spawner: any) => spawner.generation > 0));
  assert.ok(firstWorld.spawners.some((spawner) => spawner.genome.perception.volumeScaleWindowTicks !== 53));
}

async function testHeadlessChunkSizesPreserveStrictDigest() {
  const digests = [];
  for (const chunkTicks of [10, 25, 100, 1000]) {
    const sink = createMemorySink();
    const result = await runHeadlessSineExperiment({
      runId: `strict-chunk-${chunkTicks}`,
      ticks: 90,
      seed: 101,
      spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 10_000,
      chunkTicks,
      sink: sink.sink,
    });
    assert.equal(result.status, "completed");
    assert.equal(result.tick, 90);
    digests.push(strictWorldDigest(result.simulation.world));
  }

  for (const digest of digests.slice(1)) {
    assert.deepEqual(digest, digests[0]);
  }
}

function testSameTickFoodResolutionOrderAndLearningAreCharacterized() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
    candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 0, isStart: true },
      { timestamp: 1300, datetime: "1970-01-01T00:21:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: -2 },
    ],
  });
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialEnergyMin: 1,
    initialEnergyMax: 1,
    deathEnergy: 0,
    rewardScale: 1,
    transactionCost: 0,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0,
    plasticityEligibilityTraceStrength: 1,
    plasticityMaxLearnedDelta: 10,
  });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const connection = activeConnections(spawner.genome)[0];
  assert.ok(connection);
  const innovationKey = connectionDeltaKey(connection.innovationId);
  spawner.traceStore.traces = {
    "1": {
      id: 1,
      tick: 0,
      action: "long",
      strength: 1,
      activeConnectionIds: [connection.innovationId],
      connectionActivations: { [innovationKey]: { source: 1, target: 0.5 } },
    },
    "2": {
      id: 2,
      tick: 0,
      action: "long",
      strength: 1,
      activeConnectionIds: [connection.innovationId],
      connectionActivations: { [innovationKey]: { source: 1, target: 0.25 } },
    },
  };
  world.tick = 1;
  world.foods = [
    sameTickFood({ id: 2, traceId: 1, spawner }),
    sameTickFood({ id: 1, traceId: 2, spawner }),
  ];
  world.nextFoodId = 3;

  advanceMarketTimeline(timeline, 1, 10);
  resolveFoods(world, timeline);

  assert.deepEqual(world.foods.map((food) => food.id), [2, 1]);
  assert.deepEqual(world.recentEvents.map((event) => [event.kind, event.foodId, event.tick, event.status]), [
    ["resolve", 2, 1, "loss"],
    ["resolve", 1, 1, "loss"],
  ]);
  assert.equal(world.totalResolved, 2);
  assert.equal(world.totalLosses, 2);
  assert.equal(spawner.resolvedCount, 1);
  assert.equal(spawner.losses, 1);
  assert.equal(spawner.energy, -1);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
  assert.equal(spawner.learnedState.recentLearningSignal, Math.tanh(-2));
  assert.equal(spawner.learnedState.connectionDeltas[innovationKey], Math.tanh(-2) * 0.5 * 1 * 0.5);
  assert.equal(spawner.traceStore.traces["1"], undefined);
  assert.ok(spawner.traceStore.traces["2"]);
}

function createNormalWorld() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { initialSpawners: 4, maxSpawners: 4 });
  advanceMarketTimeline(timeline, 32, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);
  return world;
}

function createHighActionWorld() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(202, {
    initialSpawners: 2,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
    minimumSpawnEnergySurplus: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
    reproductionEnergy: 10_000,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0.25,
    plasticityMaxLearnedDelta: 10,
  });
  for (const spawner of world.spawners) {
    spawner.cooldownTicks = 0;
    spawner.genome.thresholdBias = 1;
    spawner.genome.minHorizonTicks = 1;
    spawner.genome.maxHorizonTicks = 1;
    spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
      index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
    );
  }
  advanceMarketTimeline(timeline, 8, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);
  return world;
}

function createHighReproductionWorld() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(404, {
    initialSpawners: 4,
    maxSpawners: 16,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 10,
    minimumSpawnEnergySurplus: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
    reproductionEnergy: 1,
    reproductionCost: 0,
    plasticityReproductionRewardStrength: 0.5,
  });
  for (const spawner of world.spawners) {
    spawner.cooldownTicks = 0;
    spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
      index === OUTPUT_INDEX.reproduce ? 100 : index === OUTPUT_INDEX.long ? -100 : index === OUTPUT_INDEX.short ? -100 : 0,
    );
  }
  advanceMarketTimeline(timeline, 12, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);
  return world;
}

function createMutatedPerceptionWorld() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(515, {
    initialSpawners: 4,
    maxSpawners: 16,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 10,
    minimumSpawnEnergySurplus: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
    reproductionEnergy: 1,
    reproductionCost: 0,
    perceptionMutationRate: 1,
    perceptionLagMutationStdDev: 9,
    perceptionWindowMutationStdDev: 13,
    perceptionSensitivityMutationStdDev: 0.003,
    perceptionDensityScaleMutationStdDev: 11,
  });
  for (const spawner of world.spawners) {
    spawner.cooldownTicks = 0;
    spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
      index === OUTPUT_INDEX.reproduce ? 100 : index === OUTPUT_INDEX.long ? -100 : index === OUTPUT_INDEX.short ? -100 : 0,
    );
  }
  advanceMarketTimeline(timeline, 12, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);
  return world;
}

function createTraceRetentionWorld() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(303, {
    initialSpawners: 1,
    maxSpawners: 1,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
    minimumSpawnEnergySurplus: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
    reproductionEnergy: 10_000,
  });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.minHorizonTicks = 50;
  spawner.genome.maxHorizonTicks = 50;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
  );
  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);
  return world;
}

function sameTickFood({ id, traceId, spawner }: { id: number; traceId: number; spawner: any }) {
  return {
    id,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long" as const,
    strength: 1,
    horizonTicks: 1,
    entrySignal: 0,
    entryPayoffScale: 1,
    traceId,
    status: "pending" as const,
  };
}

export const tests: SineTest[] = [
  { name: "Strict Digest Covers Runtime Parity Fields", run: testStrictDigestCoversRuntimeParityFields },
  { name: "Strict Digest Covers Normal High Action And High Reproduction Worlds", run: testStrictDigestCoversNormalHighActionAndHighReproductionWorlds },
  { name: "Strict Digest Covers Mutated Perception Traits", run: testStrictDigestCoversMutatedPerceptionTraits },
  { name: "Headless Chunk Sizes Preserve Strict Digest", run: testHeadlessChunkSizesPreserveStrictDigest },
  { name: "Same Tick Food Resolution Order And Learning Are Characterized", run: testSameTickFoodResolutionOrderAndLearningAreCharacterized },
];
