import { FIXED_INPUT_COUNT, FIXED_OUTPUT_COUNT } from "./brain";
import { createRng, type Rng } from "./rng";
import type { Agent, AgentNeuralParameters, BrainWeights, SimulationParameters, WorldState } from "./types";
import { createWorld, stepWorld } from "./world";

export const BATCH_INPUT_NAMES = [
  "energy",
  "health",
  "age",
  "foodVectorX",
  "foodVectorY",
  "foodCloseness",
  "nearestAgentVectorX",
  "nearestAgentVectorY",
  "nearestAgentCloseness",
  "relativeEnergy",
  "crowding",
  "recentDamage",
  "children",
  "aggressionBias",
] as const;

export const BATCH_OUTPUT_NAMES = ["moveX", "moveY", "attack", "eat", "reproduce", "rest"] as const;

export type BatchOptions = {
  runs: number;
  stopTick: number;
  seed: number;
};

export type BatchSimulation = {
  runIndex: number;
  seed: number;
  stopTick: number;
  world: WorldState;
  rng: Rng;
};

export type AveragedNeuron = {
  index: number;
  neuron: number;
  bias: number;
  inputWeights: number[];
};

export type AveragedOutputNode = AveragedNeuron & {
  output: string;
};

export type NeuralWeightSummary = {
  architecture: AgentNeuralParameters & {
    inputCount: number;
    outputCount: number;
    lastHiddenCount: number;
  };
  layers: {
    hiddenLayer1: {
      neurons: AveragedNeuron[];
    };
    hiddenLayer2?: {
      neurons: AveragedNeuron[];
    };
    outputLayer: {
      outputs: AveragedOutputNode[];
    };
  };
  rawAverages: BrainWeights;
  flatWeightVector: number[];
  flatWeightL2Norm: number;
};

export type SurvivingLineageSummary = {
  lineageId: number;
  founderAgentId: number;
  foundingLineage: boolean;
  birthTick: number;
  population: number;
  maxPopulation: number;
  maxGeneration: number;
  totalBorn: number;
  totalKilled: number;
  totalFoodConsumed: number;
  averageTraits: {
    speed: number;
    attackPower: number;
    attackRange: number;
    metabolism: number;
    foodSensitivity: number;
    aggressionBias: number;
    reproductionThreshold: number;
    mutationRate: number;
  };
  neuralWeights: NeuralWeightSummary;
};

export type BatchRunSummary = {
  runIndex: number;
  seed: number;
  stopTick: number;
  finalTick: number;
  population: number;
  food: number;
  totalLineagesCreated: number;
  survivingLineageCount: number;
  totalBirths: number;
  totalDeaths: number;
  maxGeneration: number;
  survivingLineages: SurvivingLineageSummary[];
};

export type BatchAggregate = {
  runs: number;
  stopTick: number;
  averagePopulation: number;
  averageFood: number;
  averageSurvivingLineages: number;
  averageMaxGeneration: number;
  extinctionRate: number;
};

export type BatchSummary = {
  schemaVersion: 1;
  generatedAt: string;
  options: BatchOptions;
  inputNames: readonly string[];
  outputNames: readonly string[];
  parameters: SimulationParameters;
  aggregate: BatchAggregate;
  runs: BatchRunSummary[];
};

export function createBatchSimulation(
  runIndex: number,
  seed: number,
  stopTick: number,
  parameters: SimulationParameters,
): BatchSimulation {
  return {
    runIndex,
    seed,
    stopTick,
    world: createWorld(seed, parameters),
    rng: createRng(seed + parameters.runtime.rngOffset),
  };
}

export function advanceBatchSimulation(simulation: BatchSimulation, maxTicks: number) {
  let ticks = 0;
  while (simulation.world.tick < simulation.stopTick && ticks < maxTicks) {
    stepWorld(simulation.world, simulation.rng);
    ticks += 1;
  }
  return simulation.world.tick >= simulation.stopTick;
}

export function runBatchSimulations(options: BatchOptions, parameters: SimulationParameters) {
  const runs: BatchRunSummary[] = [];
  for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
    const simulation = createBatchSimulation(runIndex, options.seed + runIndex, options.stopTick, parameters);
    advanceBatchSimulation(simulation, options.stopTick);
    runs.push(summarizeBatchSimulation(simulation));
  }
  return buildBatchSummary(options, parameters, runs);
}

export function buildBatchSummary(
  options: BatchOptions,
  parameters: SimulationParameters,
  runs: BatchRunSummary[],
): BatchSummary {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    options,
    inputNames: BATCH_INPUT_NAMES,
    outputNames: BATCH_OUTPUT_NAMES,
    parameters,
    aggregate: summarizeBatchAggregate(runs, options.stopTick),
    runs,
  };
}

export function summarizeBatchSimulation(simulation: BatchSimulation): BatchRunSummary {
  const { runIndex, seed, stopTick, world } = simulation;
  const livingByLineage = new Map<number, Agent[]>();
  for (const agent of world.agents) {
    const agents = livingByLineage.get(agent.lineageId) ?? [];
    agents.push(agent);
    livingByLineage.set(agent.lineageId, agents);
  }

  const survivingLineages = Array.from(livingByLineage.entries())
    .sort(([left], [right]) => left - right)
    .map(([lineageId, agents]) => summarizeLineage(world, lineageId, agents));

  return {
    runIndex,
    seed,
    stopTick,
    finalTick: world.tick,
    population: world.agents.length,
    food: world.food.length,
    totalLineagesCreated: Object.keys(world.lineages).length,
    survivingLineageCount: survivingLineages.length,
    totalBirths: Object.values(world.lineages).reduce((sum, lineage) => sum + lineage.totalBorn, 0),
    totalDeaths: world.deathEvents.length,
    maxGeneration: Math.max(0, ...world.agents.map((agent) => agent.generation)),
    survivingLineages,
  };
}

export function summarizeBatchAggregate(runs: BatchRunSummary[], stopTick: number): BatchAggregate {
  return {
    runs: runs.length,
    stopTick,
    averagePopulation: average(runs.map((run) => run.population)),
    averageFood: average(runs.map((run) => run.food)),
    averageSurvivingLineages: average(runs.map((run) => run.survivingLineageCount)),
    averageMaxGeneration: average(runs.map((run) => run.maxGeneration)),
    extinctionRate: average(runs.map((run) => (run.population === 0 ? 1 : 0))),
  };
}

function summarizeLineage(world: WorldState, lineageId: number, agents: Agent[]): SurvivingLineageSummary {
  const lineage = world.lineages[lineageId];
  if (!lineage) throw new Error(`Missing lineage ${lineageId}`);

  return {
    lineageId,
    founderAgentId: lineage.founderAgentId,
    foundingLineage: lineage.birthTick === 0,
    birthTick: lineage.birthTick,
    population: agents.length,
    maxPopulation: lineage.maxPopulation,
    maxGeneration: lineage.maxGeneration,
    totalBorn: lineage.totalBorn,
    totalKilled: lineage.totalKilled,
    totalFoodConsumed: round(lineage.totalFoodConsumed),
    averageTraits: {
      speed: averageAgents(agents, (agent) => agent.genome.speed),
      attackPower: averageAgents(agents, (agent) => agent.genome.attackPower),
      attackRange: averageAgents(agents, (agent) => agent.genome.attackRange),
      metabolism: averageAgents(agents, (agent) => agent.genome.metabolism),
      foodSensitivity: averageAgents(agents, (agent) => agent.genome.foodSensitivity),
      aggressionBias: averageAgents(agents, (agent) => agent.genome.aggressionBias),
      reproductionThreshold: averageAgents(agents, (agent) => agent.genome.reproductionThreshold),
      mutationRate: averageAgents(agents, (agent) => agent.genome.mutationRate),
    },
    neuralWeights: summarizeNeuralWeights(agents),
  };
}

function summarizeNeuralWeights(agents: Agent[]): NeuralWeightSummary {
  const firstAgent = agents[0];
  if (!firstAgent) throw new Error("Cannot summarize an empty lineage");

  const neural = firstAgent.genome.neural;
  validateSharedArchitecture(agents, neural);

  const inputHidden = averageWeightGroup(agents, "inputHidden");
  const hiddenBias = averageWeightGroup(agents, "hiddenBias");
  const hiddenHidden = neural.secondLayerEnabled ? averageWeightGroup(agents, "hiddenHidden") : undefined;
  const secondHiddenBias = neural.secondLayerEnabled ? averageWeightGroup(agents, "secondHiddenBias") : undefined;
  const lastHiddenOutput = averageWeightGroup(agents, "lastHiddenOutput");
  const outputBias = averageWeightGroup(agents, "outputBias");
  const lastHiddenCount = neural.secondLayerEnabled ? neural.secondHiddenCount : neural.hiddenCount;
  const rawAverages: BrainWeights = {
    inputHidden,
    hiddenBias,
    hiddenHidden,
    secondHiddenBias,
    lastHiddenOutput,
    outputBias,
  };
  const flatWeightVector = flattenWeights(rawAverages);

  return {
    architecture: {
      ...neural,
      inputCount: FIXED_INPUT_COUNT,
      outputCount: FIXED_OUTPUT_COUNT,
      lastHiddenCount,
    },
    layers: {
      hiddenLayer1: {
        neurons: Array.from({ length: neural.hiddenCount }, (_, neuronIndex) => ({
          index: neuronIndex,
          neuron: neuronIndex + 1,
          bias: hiddenBias[neuronIndex] ?? 0,
          inputWeights: inputHidden.slice(neuronIndex * FIXED_INPUT_COUNT, (neuronIndex + 1) * FIXED_INPUT_COUNT),
        })),
      },
      hiddenLayer2: neural.secondLayerEnabled
        ? {
            neurons: Array.from({ length: neural.secondHiddenCount }, (_, neuronIndex) => ({
              index: neuronIndex,
              neuron: neuronIndex + 1,
              bias: secondHiddenBias?.[neuronIndex] ?? 0,
              inputWeights: hiddenHidden?.slice(neuronIndex * neural.hiddenCount, (neuronIndex + 1) * neural.hiddenCount) ?? [],
            })),
          }
        : undefined,
      outputLayer: {
        outputs: Array.from({ length: FIXED_OUTPUT_COUNT }, (_, outputIndex) => ({
          index: outputIndex,
          neuron: outputIndex + 1,
          output: BATCH_OUTPUT_NAMES[outputIndex] ?? `output${outputIndex}`,
          bias: outputBias[outputIndex] ?? 0,
          inputWeights: lastHiddenOutput.slice(outputIndex * lastHiddenCount, (outputIndex + 1) * lastHiddenCount),
        })),
      },
    },
    rawAverages,
    flatWeightVector,
    flatWeightL2Norm: round(Math.sqrt(flatWeightVector.reduce((sum, weight) => sum + weight * weight, 0))),
  };
}

function validateSharedArchitecture(agents: Agent[], neural: AgentNeuralParameters) {
  for (const agent of agents) {
    const candidate = agent.genome.neural;
    if (
      candidate.hiddenCount !== neural.hiddenCount ||
      candidate.secondLayerEnabled !== neural.secondLayerEnabled ||
      candidate.secondHiddenCount !== neural.secondHiddenCount ||
      candidate.activation !== neural.activation
    ) {
      throw new Error(`Lineage ${agent.lineageId} contains mixed neural architectures`);
    }
  }
}

function averageWeightGroup(agents: Agent[], group: keyof BrainWeights): number[] {
  const firstAgent = agents[0];
  if (!firstAgent) throw new Error("Cannot average weights for an empty lineage");
  const firstWeights = firstAgent.genome.brainWeights[group];
  if (!firstWeights) return [];

  const totals = new Array<number>(firstWeights.length).fill(0);
  for (const agent of agents) {
    const weights = agent.genome.brainWeights[group];
    if (!weights || weights.length !== firstWeights.length) {
      throw new Error(`Lineage ${agent.lineageId} has inconsistent ${group} weight lengths`);
    }
    for (let index = 0; index < weights.length; index += 1) {
      totals[index] = (totals[index] ?? 0) + (weights[index] ?? 0);
    }
  }

  return totals.map((total) => round(total / agents.length));
}

function flattenWeights(weights: BrainWeights): number[] {
  return [
    ...weights.inputHidden,
    ...weights.hiddenBias,
    ...(weights.hiddenHidden ?? []),
    ...(weights.secondHiddenBias ?? []),
    ...weights.lastHiddenOutput,
    ...weights.outputBias,
  ];
}

function averageAgents(agents: Agent[], getValue: (agent: Agent) => number) {
  return average(agents.map(getValue));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number) {
  return Number(value.toFixed(6));
}
