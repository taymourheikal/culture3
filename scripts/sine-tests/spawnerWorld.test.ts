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

function testSpawnerConfigAffectsNewWorlds() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 3,
    maxSpawners: 7,
    initialHiddenUnitsMin: 4,
    initialHiddenUnitsMax: 4,
    initialEnergyMin: 42,
    initialEnergyMax: 42,
    initialHealth: 77,
    initialCooldownMaxTicks: 0,
    plasticityWeightLearningRate: 0.123,
    plasticityBiasLearningRate: 0.045,
    plasticityMaxLearnedDelta: 7,
  });

  assert.equal(world.spawners.length, 3);
  assert.equal(world.config.maxSpawners, 7);
  for (const spawner of world.spawners) {
    assert.equal(spawner.energy, 42);
    assert.equal(spawner.health, 77);
    assert.equal(spawner.cooldownTicks, 0);
    assert.equal(spawner.genome.plasticityProfile.weightLearningRate, 0.123);
    assert.equal(spawner.genome.plasticityProfile.biasLearningRate, 0.045);
    assert.equal(spawner.genome.plasticityProfile.maxLearnedDelta, 7);
    assert.equal(activeUnits(spawner.genome).length, 4);
    assert.equal(Object.keys(spawner.hiddenState).length, 4);
    assert.equal(spawner.genome.mutationStd, 0);
  }
}

function testInitialSpawnersRespectPopulationCap() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 20,
    maxSpawners: 7,
  });

  assert.equal(world.spawners.length, 7);
}

function testEnergyRatioInputHandlesZeroThreshold() {
  assert.equal(energyRatioInput(10, 0), 2);
  assert.equal(energyRatioInput(0, 0), 0);
  assert.equal(energyRatioInput(-5, 0), -1);
  assert.equal(energyRatioInput(10, -1), 2);
  assert.equal(energyRatioInput(5, 10), 0.5);
  assert.equal(energyRatioInput(100, 10), 2);
  assert.equal(energyRatioInput(-100, 10), -1);
}

function testSpawnerUpkeepPlanMatchesDefaultPath() {
  const config = {
    initialSpawners: 1,
    brainEnergyCostPerActiveUnit: 0.01,
    brainEnergyCostPerActiveConnection: 0.001,
    brainEnergyCostPerActiveLayer: 0.02,
  };
  const defaultWorld = createSpawnerWorld(808, config);
  const plannedWorld = createSpawnerWorld(808, config);
  const defaultSpawner = defaultWorld.spawners[0];
  const plannedSpawner = plannedWorld.spawners[0];
  assert(defaultSpawner);
  assert(plannedSpawner);

  applySpawnerUpkeep(defaultWorld, defaultSpawner);
  applySpawnerUpkeep(plannedWorld, plannedSpawner, ensureCompiledBrainPlan(plannedSpawner.genome));

  assert.equal(round(defaultSpawner.energy), round(plannedSpawner.energy));
  assert.equal(defaultSpawner.cooldownTicks, plannedSpawner.cooldownTicks);
  assert.equal(defaultSpawner.ageTicks, plannedSpawner.ageTicks);
  assert.equal(defaultSpawner.lastAction, plannedSpawner.lastAction);
}

function testDeterministicSeedOutcome() {
  assert.deepEqual(summarize(180, 101), summarize(180, 101));
  assert.notDeepEqual(summarize(180, 101), summarize(180, 202));
}

export const tests: SineTest[] = [
  { name: "Spawner Config Affects New Worlds", run: testSpawnerConfigAffectsNewWorlds },
  { name: "Initial Spawners Respect Population Cap", run: testInitialSpawnersRespectPopulationCap },
  { name: "Energy Ratio Input Handles Zero Threshold", run: testEnergyRatioInputHandlesZeroThreshold },
  { name: "Spawner Upkeep Plan Matches Default Path", run: testSpawnerUpkeepPlanMatchesDefaultPath },
  { name: "Deterministic Seed Outcome", run: testDeterministicSeedOutcome },
];
