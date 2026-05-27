import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import {
  computeSpawnerUniqueness,
  connectionDeltaKey,
  advanceSpawnerWorldToTimeline,
  createSpawnerWorld,
  learnedStateNorm,
  materializeEffectiveGenomeForInheritance,
  mutateGenome,
  SeededRng,
  type SpawnerConfig,
} from "../../src/sine/spawnerSimulation";
import type { SineTest } from "./helpers";

type ScenarioSummary = {
  label: string;
  survivalTicks: number;
  finalPopulation: number;
  wins: number;
  losses: number;
  reproductionCount: number;
  learnedDeltaNorm: number;
  uniquenessRawDistance: number;
};

function summarizeScenario(label: string, config: Partial<SpawnerConfig>): ScenarioSummary {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(919, config);
  advanceMarketTimeline(timeline, 120, 1000);
  advanceSpawnerWorldToTimeline(world, timeline, 1000);
  const first = world.spawners[0];
  const uniqueness = computeSpawnerUniqueness(world.spawners, world.tick).get(first?.id ?? -1);
  return {
    label,
    survivalTicks: world.tick,
    finalPopulation: world.spawners.length,
    wins: world.totalResolved - world.totalLosses,
    losses: world.totalLosses,
    reproductionCount: Object.values(world.lineages).reduce((sum, lineage) => sum + lineage.totalBorn, 0) - Number(config.initialSpawners ?? 20),
    learnedDeltaNorm: learnedStateNorm(first?.learnedState, first?.genome.plasticityProfile.maxLearnedDelta),
    uniquenessRawDistance: uniqueness?.rawDistance ?? 0,
  };
}

function testPlasticityComparisonSummariesAreDeterministicAndLabeled() {
  const learningOff = summarizeScenario("learning off", {
    initialSpawners: 20,
    plasticityWeightLearningRate: 0,
    plasticityBiasLearningRate: 0,
    plasticityReproductionRewardStrength: 0,
    plasticityExperienceDecayRate: 0,
  });
  const learningOn = summarizeScenario("learning on", {
    initialSpawners: 20,
    plasticityWeightLearningRate: 0.05,
    plasticityBiasLearningRate: 0.02,
    plasticityReproductionRewardStrength: 0.35,
    plasticityExperienceDecayRate: 0.002,
  });
  const repeat = summarizeScenario("learning off", {
    initialSpawners: 20,
    plasticityWeightLearningRate: 0,
    plasticityBiasLearningRate: 0,
    plasticityReproductionRewardStrength: 0,
    plasticityExperienceDecayRate: 0,
  });

  assert.deepEqual(learningOff, repeat);
  for (const summary of [learningOff, learningOn]) {
    assert.ok(summary.label);
    assert.equal(Number.isFinite(summary.survivalTicks), true);
    assert.equal(Number.isFinite(summary.finalPopulation), true);
    assert.equal(Number.isFinite(summary.wins), true);
    assert.equal(Number.isFinite(summary.losses), true);
    assert.equal(Number.isFinite(summary.reproductionCount), true);
    assert.equal(Number.isFinite(summary.learnedDeltaNorm), true);
    assert.equal(Number.isFinite(summary.uniquenessRawDistance), true);
  }
}

function testModelAComparisonIsolatesInheritanceBehavior() {
  const world = createSpawnerWorld(929, {
    initialSpawners: 1,
    weightMutationRate: 0,
    biasMutationRate: 0,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
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
  const parent = world.spawners[0];
  assert(parent);
  const connection = parent.genome.connections[0];
  assert(connection);
  parent.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.4;

  const baseChild = mutateGenome(parent.genome, new SeededRng(7), world.config, world.innovations);
  const modelAChild = mutateGenome(materializeEffectiveGenomeForInheritance(parent.genome, parent.learnedState), new SeededRng(7), world.config, world.innovations);
  const baseConnection = baseChild.connections.find((candidate) => candidate.innovationId === connection.innovationId);
  const modelAConnection = modelAChild.connections.find((candidate) => candidate.innovationId === connection.innovationId);

  assert(baseConnection);
  assert(modelAConnection);
  assert.equal(baseConnection.weight, connection.weight);
  assert.equal(modelAConnection.weight, connection.weight + 0.4);
}

export const tests: SineTest[] = [
  { name: "Plasticity Comparison Summaries Are Deterministic And Labeled", run: testPlasticityComparisonSummariesAreDeterministicAndLabeled },
  { name: "Model A Comparison Isolates Inheritance Behavior", run: testModelAComparisonIsolatesInheritanceBehavior },
];
