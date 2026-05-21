import { BATCH_OUTPUT_NAMES, type NeuralWeightSummary } from "../sim/batch";
import type { AgentNeuralParameters } from "../sim/types";
import type { WeightSample } from "./batchAnalysisTypes";

export const BEHAVIOR_SCENARIOS = [
  {
    name: "Hungry near food",
    inputs: [0.18, 0.88, 0.22, 1, 0.1, 0.92, 0, 0, 0, 0, 0.08, 0, 0, -0.05],
  },
  {
    name: "Full near food",
    inputs: [0.86, 0.95, 0.28, 0.8, -0.15, 0.75, 0, 0, 0, 0, 0.08, 0, 0, -0.05],
  },
  {
    name: "Weak neighbor close",
    inputs: [0.72, 0.9, 0.35, 0, 0, 0.1, 0.8, 0.1, 0.88, -0.35, 0.2, 0, 1, 0.25],
  },
  {
    name: "Stronger neighbor close",
    inputs: [0.42, 0.8, 0.4, 0.15, 0.25, 0.2, -0.75, 0.2, 0.86, 0.45, 0.25, 0.05, 1, 0.25],
  },
  {
    name: "Crowded and damaged",
    inputs: [0.35, 0.55, 0.5, -0.3, 0.7, 0.45, 0.55, -0.25, 0.55, 0.1, 0.95, 0.75, 0.25, 0.1],
  },
  {
    name: "Old with children",
    inputs: [0.78, 0.82, 0.9, 0.2, -0.6, 0.35, -0.2, 0.4, 0.35, 0, 0.35, 0.1, 0.9, -0.05],
  },
] as const;

export function behaviorVector(sample: WeightSample): number[] {
  const outputs: number[] = [];
  for (const scenario of BEHAVIOR_SCENARIOS) {
    outputs.push(...forwardAveragedBrain(sample.neuralWeights, scenario.inputs));
  }
  return outputs;
}

function forwardAveragedBrain(neuralWeights: NeuralWeightSummary, inputs: readonly number[]) {
  const neural = neuralWeights.architecture;
  const weights = neuralWeights.rawAverages;
  const hidden = new Array<number>(neural.hiddenCount).fill(0);
  const secondHidden = neural.secondLayerEnabled ? new Array<number>(neural.secondHiddenCount).fill(0) : hidden;
  const lastHidden = neural.secondLayerEnabled ? secondHidden : hidden;
  const outputs = new Array<number>(BATCH_OUTPUT_NAMES.length).fill(0);

  for (let hiddenIndex = 0; hiddenIndex < neural.hiddenCount; hiddenIndex += 1) {
    let sum = weights.hiddenBias[hiddenIndex] ?? 0;
    for (let inputIndex = 0; inputIndex < neural.inputCount; inputIndex += 1) {
      sum += (inputs[inputIndex] ?? 0) * (weights.inputHidden[hiddenIndex * neural.inputCount + inputIndex] ?? 0);
    }
    hidden[hiddenIndex] = activate(sum, neural.activation);
  }

  if (neural.secondLayerEnabled) {
    for (let secondIndex = 0; secondIndex < neural.secondHiddenCount; secondIndex += 1) {
      let sum = weights.secondHiddenBias?.[secondIndex] ?? 0;
      for (let hiddenIndex = 0; hiddenIndex < neural.hiddenCount; hiddenIndex += 1) {
        sum += (hidden[hiddenIndex] ?? 0) * (weights.hiddenHidden?.[secondIndex * neural.hiddenCount + hiddenIndex] ?? 0);
      }
      secondHidden[secondIndex] = activate(sum, neural.activation);
    }
  }

  for (let outputIndex = 0; outputIndex < BATCH_OUTPUT_NAMES.length; outputIndex += 1) {
    let sum = weights.outputBias[outputIndex] ?? 0;
    for (let hiddenIndex = 0; hiddenIndex < lastHidden.length; hiddenIndex += 1) {
      sum += (lastHidden[hiddenIndex] ?? 0) * (weights.lastHiddenOutput[outputIndex * lastHidden.length + hiddenIndex] ?? 0);
    }
    outputs[outputIndex] = activate(sum, neural.activation);
  }

  return outputs;
}

function activate(value: number, activation: AgentNeuralParameters["activation"]) {
  if (activation === "relu") return Math.max(0, value);
  if (activation === "sigmoid") return 1 / (1 + Math.exp(-value));
  return Math.tanh(value);
}
