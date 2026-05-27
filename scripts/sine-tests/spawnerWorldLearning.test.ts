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

function testWaitTicksDoNotCreateDecisionTraces() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 1,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 1.5,
    reproductionEnergy: 10_000,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);

  advanceMarketTimeline(timeline, 20, 50);
  advanceSpawnerWorldToTimeline(world, timeline, 50);

  assert.equal(world.spawners.length, 1);
  assert.equal(Object.keys(spawner.traceStore.traces).length, 0);
}

function testTraceCountRemainsBoundedInLongHighPopulationRun() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 250,
    maxSpawners: 250,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 1.5,
    reproductionEnergy: 10_000,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });

  advanceMarketTimeline(timeline, 500, 600);
  advanceSpawnerWorldToTimeline(world, timeline, 600);

  const traceCount = world.spawners.reduce((sum, spawner) => sum + Object.keys(spawner.traceStore.traces).length, 0);
  assert.equal(world.spawners.length, 250);
  assert.equal(traceCount, 0);
}

function testResolvedFoodAppliesLearningAndClearsTrace() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
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
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.minHorizonTicks = 1;
  spawner.genome.maxHorizonTicks = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
  );

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);
  const pending = world.foods.find((food) => food.status === "pending");
  assert(pending?.traceId);
  assert.ok(spawner.traceStore.traces[String(pending.traceId)]);

  advanceMarketTimeline(timeline, 2, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.totalResolved, 1);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
  assert(learnedStateNorm(spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta) > 0);
  assert.equal(spawner.traceStore.traces[String(pending.traceId)], undefined);
}

function testExtremePlasticityRunAvoidsInvalidNumbers() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(1212, {
    initialSpawners: 40,
    maxSpawners: 80,
    plasticityWeightLearningRate: 1,
    plasticityBiasLearningRate: 1,
    plasticityPositiveRewardMultiplier: 10,
    plasticityNegativeRewardMultiplier: 10,
    plasticityReproductionRewardStrength: 1,
    plasticityExperienceDecayRate: 0.25,
    plasticityMaxLearnedDelta: 0.25,
    plasticityEligibilityTraceStrength: 1,
  });

  advanceMarketTimeline(timeline, 120, 500);
  advanceSpawnerWorldToTimeline(world, timeline, 500);

  assert.equal(world.tick, 120);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
    for (const value of [
      ...Object.values(spawner.learnedState.connectionDeltas),
      ...Object.values(spawner.learnedState.outputBiasDeltas),
      ...Object.values(spawner.learnedState.gateBiasDeltas),
    ]) {
      assert(Math.abs(value) <= spawner.genome.plasticityProfile.maxLearnedDelta);
    }
  }
}

export const tests: SineTest[] = [
  { name: "Wait Ticks Do Not Create Decision Traces", run: testWaitTicksDoNotCreateDecisionTraces },
  { name: "Trace Count Remains Bounded In Long High Population Run", run: testTraceCountRemainsBoundedInLongHighPopulationRun },
  { name: "Resolved Food Applies Learning And Clears Trace", run: testResolvedFoodAppliesLearningAndClearsTrace },
  { name: "Extreme Plasticity Run Avoids Invalid Numbers", run: testExtremePlasticityRunAvoidsInvalidNumbers },
];
