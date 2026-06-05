import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { recordSpawnerEvent } from "../../src/sine/spawner/events";
import { calculateFoodPayoff, resolveFoods } from "../../src/sine/spawner/reward";
import { advanceSimulationToTargetAsync, createSimulationState } from "../../src/sine/simulationRuntime";
import {
  activeConnections,
  activeUnits,
  architectureMetrics,
  advanceSpawnerWorldToTimeline,
  advanceSpawnerWorldToTimelineAsync,
  applySpawnerUpkeep,
  connectionDeltaKey,
  createSpawnerWorld,
  energyRatioInput,
  evaluateBrainJob,
  ensureCompiledBrainPlan,
  DEFAULT_SPAWNER_CONFIG,
  gateBiasDeltaKey,
  learnedStateNorm,
  outputBiasDeltaKey,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
  type SpawnerEvent,
} from "../../src/sine/spawnerSimulation";
import { strictWorldDigest } from "../../src/sine/testing/strictWorldDigest";
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

async function testSpawnerKilledByUpkeepIsAbsentFromBrainJobs() {
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

  const jobCounts: number[] = [];
  advanceMarketTimeline(timeline, 1, 10);
  await advanceSpawnerWorldToTimelineAsync(world, timeline, 10, {
    brainEvaluationRunner: {
      evaluateBatch(jobs) {
        jobCounts.push(jobs.length);
        if (jobs.length > 0) throw new Error("upkeep-dead spawner reached brain evaluation");
        return [];
      },
    },
  });

  assert.deepEqual(jobCounts, [0]);
  assert.equal(world.spawners.length, 0);
  assert.equal(Object.keys(spawner.traceStore.traces).length, 0);
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

async function testAsyncSimulationRollbackDiscardsPartialTickAndEvents() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 1,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const spawner = simulation.world.spawners[0];
  assert(spawner);
  simulation.world.foods.push({
    id: simulation.world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long",
    strength: 1,
    horizonTicks: 1,
    entrySignal: 0,
    status: "pending",
  });
  simulation.world.nextFoodId += 1;

  const beforeWorld = strictWorldDigest(simulation.world);
  const beforeTimeline = structuredClone(simulation.timeline);
  const events: SpawnerEvent[] = [];
  simulation.world.eventSink = (event) => events.push(event);

  await assert.rejects(
    () =>
      advanceSimulationToTargetAsync(simulation, 1, 1, {
        brainEvaluationRunner: {
          mode: "parallel",
          evaluateBatch() {
            return Promise.reject(new Error("forced stale async batch"));
          },
        },
      }),
    /forced stale async batch/,
  );

  assert.deepEqual(strictWorldDigest(simulation.world), beforeWorld);
  assert.deepEqual(structuredClone(simulation.timeline), beforeTimeline);
  assert.deepEqual(events, []);
}

async function testAsyncSimulationTransactionFlushesEventsOnSuccess() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 1,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const spawner = simulation.world.spawners[0];
  assert(spawner);
  simulation.world.foods.push({
    id: simulation.world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long",
    strength: 1,
    horizonTicks: 1,
    entrySignal: 0,
    status: "pending",
  });
  simulation.world.nextFoodId += 1;

  const events: SpawnerEvent[] = [];
  simulation.world.eventSink = (event) => events.push(event);
  await advanceSimulationToTargetAsync(simulation, 1, 1, {
    brainEvaluationRunner: {
      mode: "parallel",
      evaluateBatch(jobs) {
        return Promise.resolve(jobs.map((job) => evaluateBrainJob(job)));
      },
    },
  });

  assert.equal(simulation.world.tick, 1);
  assert.equal(simulation.timeline.tick, 1);
  assert.equal(simulation.world.totalResolved, 1);
  assert.equal(events.some((event) => event.kind === "resolve"), true);
}

export const tests: SineTest[] = [
  { name: "Dead Spawner Cannot Act After Resolved Loss", run: testDeadSpawnerCannotActAfterResolvedLoss },
  { name: "Spawner Killed By Upkeep Cannot Act Or Trace", run: testSpawnerKilledByUpkeepCannotActOrTrace },
  { name: "Spawner Killed By Upkeep Is Absent From Brain Jobs", run: testSpawnerKilledByUpkeepIsAbsentFromBrainJobs },
  { name: "Spawner Killed By Spawn Cost Cannot Reproduce Same Tick", run: testSpawnerKilledBySpawnCostCannotReproduceSameTick },
  { name: "Cooldown Spawner Reports Wait", run: testCooldownSpawnerReportsWait },
  { name: "Async Simulation Rollback Discards Partial Tick And Events", run: testAsyncSimulationRollbackDiscardsPartialTickAndEvents },
  { name: "Async Simulation Transaction Flushes Events On Success", run: testAsyncSimulationTransactionFlushesEventsOnSuccess },
];
