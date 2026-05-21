import { FIXED_INPUT_COUNT, FIXED_OUTPUT_COUNT } from "./brain";
import type { Agent, AgentNeuralParameters, BrainWeights } from "./types";
import type { NeuralWeightSummary } from "./batch";

export function summarizeNeuralWeights(agents: Agent[], outputNames: readonly string[]): NeuralWeightSummary {
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
          output: outputNames[outputIndex] ?? `output${outputIndex}`,
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

function round(value: number) {
  return Number(value.toFixed(6));
}
