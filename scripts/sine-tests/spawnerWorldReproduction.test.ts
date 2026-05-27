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
  currentReproductionCost,
  createSpawnerWorld,
  energyRatioInput,
  ensureCompiledBrainPlan,
  gateBiasDeltaKey,
  learnedStateNorm,
  outputBiasDeltaKey,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
  populationRoomRatio,
  reproductionCostMultiplier,
  type SpawnerAgent,
  tryReproduceSpawner,
} from "../../src/sine/spawnerSimulation";
import { round, runTo, summarize, type SineTest } from "./helpers";

function testEligibleFoundersDoNotImmediatelyFillToPopulationCap() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 250,
    maxSpawners: 400,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 1,
    reproductionCost: 0,
    defaultSpawnThreshold: 1.5,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });

  assert.equal(world.spawners.length, 250);
  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert(world.spawners.length < 300);
}

function testHighReproductionOutputCreatesChildWhenEligible() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 7,
    reproductionCostMinMultiplier: 1,
    reproductionCostMaxMultiplier: 1,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    perceptionLagMutationStdDev: 0,
    perceptionWindowMutationStdDev: 0,
    perceptionSensitivityMutationStdDev: 0,
    perceptionDensityScaleMutationStdDev: 0,
    payoffScaleMutationRate: 0,
    payoffScaleWindowMutationStdDev: 0,
    payoffScaleSampleStepMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? 100 : -100));

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 2);
  assert.equal(world.spawners[0]?.children, 1);
  assert.equal(world.spawners[0]?.energy, 100 - world.config.energyDrainPerTick * 1 - world.config.reproductionCost);
}

function testReproductionPressureScalesCostFromLivingPopulationRoom() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 2,
    maxSpawners: 4,
    reproductionEnergy: 1,
    reproductionCost: 10,
    reproductionCostMinMultiplier: 2,
    reproductionCostMaxMultiplier: 4,
    reproductionCostPressureCurve: 0,
  });

  assert.equal(populationRoomRatio(world.spawners.length, world.config.maxSpawners), 0.5);
  assert.equal(reproductionCostMultiplier(world.config, world.spawners.length), 3);
  assert.equal(currentReproductionCost(world.config, world.spawners.length), 30);
}

function testDynamicReproductionCostIsPaidBySuccessfulParent() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 2,
    maxSpawners: 4,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 1,
    reproductionCost: 10,
    reproductionCostMinMultiplier: 2,
    reproductionCostMaxMultiplier: 4,
    reproductionCostPressureCurve: 0,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    payoffScaleMutationRate: 0,
    payoffScaleWindowMutationStdDev: 0,
    payoffScaleSampleStepMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
  });
  const [firstParent, secondParent] = world.spawners;
  assert(firstParent);
  assert(secondParent);
  world.rng.next = () => 0;
  const newborns: SpawnerAgent[] = [];

  tryReproduceSpawner(world, firstParent, { reproductionProbability: 1 }, newborns);
  tryReproduceSpawner(world, secondParent, { reproductionProbability: 1 }, newborns);

  assert.equal(newborns.length, 2);
  assert.equal(firstParent.energy, 70);
  assert.equal(secondParent.energy, 65);
  assert(secondParent.energy < firstParent.energy);
}

function testDynamicReproductionCostCanGateEligibilityAboveFixedEnergyGate() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 50,
    reproductionCostMinMultiplier: 3,
    reproductionCostMaxMultiplier: 3,
    reproductionCostPressureCurve: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  world.rng.next = () => 0;
  const newborns: SpawnerAgent[] = [];

  const child = tryReproduceSpawner(world, parent, { reproductionProbability: 1 }, newborns);

  assert.equal(child, null);
  assert.equal(newborns.length, 0);
  assert.equal(parent.energy, 100);
}

function testReproductionInheritsEffectiveNeuralValuesButNotLearnedState() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 0,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    perceptionLagMutationStdDev: 0,
    perceptionWindowMutationStdDev: 0,
    perceptionSensitivityMutationStdDev: 0,
    perceptionDensityScaleMutationStdDev: 0,
    payoffScaleMutationRate: 0,
    payoffScaleWindowMutationStdDev: 0,
    payoffScaleSampleStepMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
    plasticityExperienceDecayRate: 0,
    plasticityWeightLearningRate: 0,
    plasticityBiasLearningRate: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  const connection = parent.genome.connections[0];
  const unit = parent.genome.units[0];
  assert(connection);
  assert(unit);
  parent.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? 100 : -100));
  parent.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.5;
  parent.learnedState.outputBiasDeltas[outputBiasDeltaKey(OUTPUT_INDEX.long)] = 0.25;
  parent.learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")] = -0.125;
  const parentGenomeBefore = structuredClone(parent.genome);

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  const child = world.spawners.find((spawner) => spawner.parentSpawnerId === parent.id);
  assert(child);
  const childConnection = child.genome.connections.find((candidate) => candidate.innovationId === connection.innovationId);
  const childUnit = child.genome.units.find((candidate) => candidate.unitId === unit.unitId);
  assert(childConnection);
  assert(childUnit);
  assert.deepEqual(parent.genome, parentGenomeBefore);
  assert.equal(childConnection.weight, connection.weight + 0.5);
  assert.equal(child.genome.outputBias[OUTPUT_INDEX.long], (parentGenomeBefore.outputBias[OUTPUT_INDEX.long] ?? 0) + 0.25);
  assert.equal(childUnit.updateBias, unit.updateBias - 0.125);
  assert.deepEqual(child.learnedState.connectionDeltas, {});
  assert.deepEqual(child.learnedState.outputBiasDeltas, {});
  assert.deepEqual(child.learnedState.gateBiasDeltas, {});
}

function testReproductionLearningIsInheritedByNewbornEffectiveGenome() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 0,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    perceptionLagMutationStdDev: 0,
    perceptionWindowMutationStdDev: 0,
    perceptionSensitivityMutationStdDev: 0,
    perceptionDensityScaleMutationStdDev: 0,
    payoffScaleMutationRate: 0,
    payoffScaleWindowMutationStdDev: 0,
    payoffScaleSampleStepMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
    plasticityWeightLearningRate: 0,
    plasticityBiasLearningRate: 1,
    plasticityReproductionRewardStrength: 1,
    plasticityMaxLearnedDelta: 10,
    plasticityEligibilityTraceStrength: 1,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? 100 : -100));
  const parentBaseGenome = structuredClone(parent.genome);

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  const child = world.spawners.find((spawner) => spawner.parentSpawnerId === parent.id);
  const reproductionEvent = world.recentEvents.find((event) => event.kind === "reproduction" && event.childSpawnerId === child?.id);
  assert(child);
  assert(reproductionEvent?.spawnerSnapshot);
  assert.equal(parent.learnedState.learningUpdateCount, 1);
  assert.equal(parent.learnedState.reproductionLearningCount, 1);
  const learnedReproductionBias = parent.learnedState.outputBiasDeltas[outputBiasDeltaKey(OUTPUT_INDEX.reproduce)] ?? 0;
  assert(learnedReproductionBias > 0);
  assert.deepEqual(parent.genome, parentBaseGenome);
  assert.equal(child.genome.outputBias[OUTPUT_INDEX.reproduce], (parentBaseGenome.outputBias[OUTPUT_INDEX.reproduce] ?? 0) + learnedReproductionBias);
  assert.deepEqual(child.learnedState.outputBiasDeltas, {});
  assert.equal(reproductionEvent.spawnerSnapshot.learnedState.outputBiasDeltas[outputBiasDeltaKey(OUTPUT_INDEX.reproduce)], learnedReproductionBias);
}

function testLowReproductionOutputSuppressesChildWhenEligible() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 7,
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? -100 : -100));

  advanceMarketTimeline(timeline, 1 * 20, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);

  assert.equal(world.spawners.length, 1);
  assert.equal(world.spawners[0]?.children, 0);
}

function testLargeForcedReproductionKeepsUniqueIdsAndGenerations() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 250,
    maxSpawners: 400,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 1,
    reproductionCost: 0,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 1.5,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  for (const spawner of world.spawners) {
    spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? 100 : -100));
  }

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  const ids = world.spawners.map((spawner) => spawner.id);
  const children = world.spawners.filter((spawner) => spawner.parentSpawnerId !== undefined);
  assert.equal(world.spawners.length, 400);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(children.length, 150);
  assert(children.every((child) => child.generation === 1));
  assert(children.every((child) => child.parentSpawnerId !== child.id));
}

export const tests: SineTest[] = [
  { name: "Eligible Founders Do Not Immediately Fill To Population Cap", run: testEligibleFoundersDoNotImmediatelyFillToPopulationCap },
  { name: "High Reproduction Output Creates Child When Eligible", run: testHighReproductionOutputCreatesChildWhenEligible },
  { name: "Reproduction Pressure Scales Cost From Living Population Room", run: testReproductionPressureScalesCostFromLivingPopulationRoom },
  { name: "Dynamic Reproduction Cost Is Paid By Successful Parent", run: testDynamicReproductionCostIsPaidBySuccessfulParent },
  { name: "Dynamic Reproduction Cost Can Gate Eligibility Above Fixed Energy Gate", run: testDynamicReproductionCostCanGateEligibilityAboveFixedEnergyGate },
  { name: "Reproduction Inherits Effective Neural Values But Not Learned State", run: testReproductionInheritsEffectiveNeuralValuesButNotLearnedState },
  { name: "Reproduction Learning Is Inherited By Newborn Effective Genome", run: testReproductionLearningIsInheritedByNewbornEffectiveGenome },
  { name: "Low Reproduction Output Suppresses Child When Eligible", run: testLowReproductionOutputSuppressesChildWhenEligible },
  { name: "Large Forced Reproduction Keeps Unique Ids And Generations", run: testLargeForcedReproductionKeepsUniqueIdsAndGenerations },
];
