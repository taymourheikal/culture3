import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { recordSpawnerEvent } from "../../src/sine/spawner/events";
import { calculateFoodPayoff, resolveFoods } from "../../src/sine/spawner/reward";
import {
  activeConnections,
  activeUnits,
  architectureMetrics,
  advanceSpawnerWorldToTimeline,
  applySpawnerUpkeep,
  connectionDeltaKey,
  createSpawnerWorld,
  energyRatioInput,
  ensureCompiledBrainPlan,
  gateBiasDeltaKey,
  learnedStateNorm,
  outputBiasDeltaKey,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
} from "../../src/sine/spawnerSimulation";
import { round, runTo, summarize, type SineTest } from "./helpers";

function testDeadSpawnerCannotActAfterResolvedLoss() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { initialSpawners: 1, deathHealth: 90 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.health = 80;
  spawner.energy = 100;
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : 0));
  world.foods.push({
    id: world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long",
    strength: 1,
    horizonTicks: 1,
    entrySignal: 100,
    status: "pending",
  });
  world.nextFoodId += 1;

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 0);
  assert.equal(world.foods.length, 1);
  assert.equal(world.foods[0]?.status, "loss");
}

function testSpawnerKilledByUpkeepCannotActOrTrace() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialEnergyMin: 1,
    initialEnergyMax: 1,
    deathEnergy: 0,
    energyDrainPerTick: 2,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
    minimumSpawnEnergySurplus: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.thresholdBias = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
  );

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 0);
  assert.equal(world.foods.length, 0);
  assert.equal(Object.keys(spawner.traceStore.traces).length, 0);
  assert.equal(world.recentEvents.some((event) => event.kind === "spawn" || event.kind === "reproduction"), false);
  assert.equal(world.recentEvents.filter((event) => event.kind === "death" && event.spawnerId === spawner.id).length, 1);
}

function testSpawnerKilledBySpawnCostCannotReproduceSameTick() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 20,
    initialEnergyMax: 20,
    deathEnergy: 0,
    spawnCost: 13,
    minimumSpawnEnergySurplus: 0,
    reproductionEnergy: 1,
    reproductionCost: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.thresholdBias = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => {
    if (index === OUTPUT_INDEX.long || index === OUTPUT_INDEX.strength || index === OUTPUT_INDEX.reproduce) return 100;
    return -100;
  });

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 0);
  assert.equal(world.foods.length, 1);
  assert.equal(world.foods[0]?.creatorSpawnerId, spawner.id);
  assert.equal(world.recentEvents.some((event) => event.kind === "reproduction"), false);
}

function testCooldownSpawnerReportsWait() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.lastAction = "long";
  spawner.cooldownTicks = 10;

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners[0]?.lastAction, "wait");
}

export const tests: SineTest[] = [
  { name: "Dead Spawner Cannot Act After Resolved Loss", run: testDeadSpawnerCannotActAfterResolvedLoss },
  { name: "Spawner Killed By Upkeep Cannot Act Or Trace", run: testSpawnerKilledByUpkeepCannotActOrTrace },
  { name: "Spawner Killed By Spawn Cost Cannot Reproduce Same Tick", run: testSpawnerKilledBySpawnCostCannotReproduceSameTick },
  { name: "Cooldown Spawner Reports Wait", run: testCooldownSpawnerReportsWait },
];
