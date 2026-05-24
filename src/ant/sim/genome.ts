import { createBrainWeights } from "./brain";
import { clamp } from "./math";
import type { AgentNeuralParameters, Genome, SimulationParameters } from "./types";
import type { Rng } from "./rng";

export function createGenome(rng: Rng, parameters: SimulationParameters, neural: AgentNeuralParameters): Genome {
  const initial = parameters.initialGenome;
  return {
    speed: rng.range(initial.speed.min, initial.speed.max),
    attackPower: rng.range(initial.attackPower.min, initial.attackPower.max),
    attackRange: rng.range(initial.attackRange.min, initial.attackRange.max),
    metabolism: rng.range(initial.metabolism.min, initial.metabolism.max),
    foodSensitivity: rng.range(initial.foodSensitivity.min, initial.foodSensitivity.max),
    aggressionBias: rng.range(initial.aggressionBias.min, initial.aggressionBias.max),
    reproductionThreshold: rng.range(initial.reproductionThreshold.min, initial.reproductionThreshold.max),
    mutationRate: rng.range(initial.mutationRate.min, initial.mutationRate.max),
    brainWeights: createBrainWeights(neural, () => rng.gaussian(neural.initialWeightMean, neural.initialWeightStdDev)),
    neural: structuredClone(neural),
  };
}

export function mutateGenome(parent: Genome, rng: Rng, parameters: SimulationParameters) {
  const mutation = parameters.mutation;
  const mutationRate = clamp(
    parent.mutationRate + rng.gaussian(0, mutation.mutationRateStdDev),
    mutation.mutationRateClamp.min,
    mutation.mutationRateClamp.max,
  );
  const child: Genome = {
    speed: clamp(parent.speed + rng.gaussian(0, mutation.speedStdDev), mutation.speedClamp.min, mutation.speedClamp.max),
    attackPower: clamp(
      parent.attackPower + rng.gaussian(0, mutation.attackPowerStdDev),
      mutation.attackPowerClamp.min,
      mutation.attackPowerClamp.max,
    ),
    attackRange: clamp(
      parent.attackRange + rng.gaussian(0, mutation.attackRangeStdDev),
      mutation.attackRangeClamp.min,
      mutation.attackRangeClamp.max,
    ),
    metabolism: clamp(
      parent.metabolism + rng.gaussian(0, mutation.metabolismStdDev),
      mutation.metabolismClamp.min,
      mutation.metabolismClamp.max,
    ),
    foodSensitivity: clamp(
      parent.foodSensitivity + rng.gaussian(0, mutation.foodSensitivityStdDev),
      mutation.foodSensitivityClamp.min,
      mutation.foodSensitivityClamp.max,
    ),
    aggressionBias: clamp(
      parent.aggressionBias + rng.gaussian(0, mutation.aggressionBiasStdDev),
      mutation.aggressionBiasClamp.min,
      mutation.aggressionBiasClamp.max,
    ),
    reproductionThreshold: clamp(
      parent.reproductionThreshold + rng.gaussian(0, mutation.reproductionThresholdStdDev),
      mutation.reproductionThresholdClamp.min,
      mutation.reproductionThresholdClamp.max,
    ),
    mutationRate,
    brainWeights: {
      inputHidden: mutateWeights(parent.brainWeights.inputHidden, mutationRate, rng, parameters),
      hiddenBias: mutateWeights(parent.brainWeights.hiddenBias, mutationRate, rng, parameters),
      hiddenHidden: parent.brainWeights.hiddenHidden
        ? mutateWeights(parent.brainWeights.hiddenHidden, mutationRate, rng, parameters)
        : undefined,
      secondHiddenBias: parent.brainWeights.secondHiddenBias
        ? mutateWeights(parent.brainWeights.secondHiddenBias, mutationRate, rng, parameters)
        : undefined,
      lastHiddenOutput: mutateWeights(parent.brainWeights.lastHiddenOutput, mutationRate, rng, parameters),
      outputBias: mutateWeights(parent.brainWeights.outputBias, mutationRate, rng, parameters),
    },
    neural: structuredClone(parent.neural),
  };

  return {
    genome: child,
    summary: summarizeMutation(parent, child, parameters),
  };
}

function mutateWeights(weights: number[], mutationRate: number, rng: Rng, parameters: SimulationParameters) {
  const mutation = parameters.mutation;
  return weights.map((weight) => {
    if (!rng.chance(mutation.weightMutationChance)) return weight;
    return clamp(weight + rng.gaussian(0, mutationRate), mutation.weightClamp.min, mutation.weightClamp.max);
  });
}

function summarizeMutation(parent: Genome, child: Genome, parameters: SimulationParameters) {
  const mutation = parameters.mutation;
  const changes = [
    describe("faster", "slower", child.speed - parent.speed, mutation.summarySpeedThreshold),
    describe("stronger attack", "weaker attack", child.attackPower - parent.attackPower, mutation.summaryAttackPowerThreshold),
    describe("longer reach", "shorter reach", child.attackRange - parent.attackRange, mutation.summaryAttackRangeThreshold),
    describe("higher appetite", "lower metabolism", child.metabolism - parent.metabolism, mutation.summaryMetabolismThreshold),
    describe("more food focus", "less food focus", child.foodSensitivity - parent.foodSensitivity, mutation.summaryFoodSensitivityThreshold),
    describe("higher aggression", "lower aggression", child.aggressionBias - parent.aggressionBias, mutation.summaryAggressionThreshold),
  ].filter(Boolean);

  return changes.slice(0, mutation.summaryMaxLabels).join(", ") || "minor neural drift";
}

function describe(up: string, down: string, delta: number, threshold: number) {
  if (delta > threshold) return up;
  if (delta < -threshold) return down;
  return "";
}
