import type { AgentNeuralParameters, BrainWeights, Genome } from "./types";

export const FIXED_INPUT_COUNT = 14;
export const FIXED_OUTPUT_COUNT = 6;

export function createBrainWeights(neural: AgentNeuralParameters, randomWeight: () => number): BrainWeights {
  const lastHiddenCount = neural.secondLayerEnabled ? neural.secondHiddenCount : neural.hiddenCount;
  return {
    inputHidden: Array.from({ length: FIXED_INPUT_COUNT * neural.hiddenCount }, randomWeight),
    hiddenBias: Array.from({ length: neural.hiddenCount }, randomWeight),
    hiddenHidden: neural.secondLayerEnabled ? Array.from({ length: neural.hiddenCount * neural.secondHiddenCount }, randomWeight) : undefined,
    secondHiddenBias: neural.secondLayerEnabled ? Array.from({ length: neural.secondHiddenCount }, randomWeight) : undefined,
    lastHiddenOutput: Array.from({ length: lastHiddenCount * FIXED_OUTPUT_COUNT }, randomWeight),
    outputBias: Array.from({ length: FIXED_OUTPUT_COUNT }, randomWeight),
  };
}

export function forwardBrain(genome: Genome, inputs: number[]) {
  const neural = genome.neural;
  const hidden = new Array<number>(neural.hiddenCount).fill(0);
  const secondHidden = neural.secondLayerEnabled ? new Array<number>(neural.secondHiddenCount).fill(0) : hidden;
  const lastHidden = neural.secondLayerEnabled ? secondHidden : hidden;
  const outputs = new Array<number>(FIXED_OUTPUT_COUNT).fill(0);
  const weights = genome.brainWeights;

  for (let h = 0; h < neural.hiddenCount; h += 1) {
    let sum = weights.hiddenBias[h] ?? 0;
    for (let i = 0; i < FIXED_INPUT_COUNT; i += 1) {
      sum += (inputs[i] ?? 0) * (weights.inputHidden[h * FIXED_INPUT_COUNT + i] ?? 0);
    }
    hidden[h] = activate(sum, neural.activation);
  }

  if (neural.secondLayerEnabled) {
    for (let h2 = 0; h2 < neural.secondHiddenCount; h2 += 1) {
      let sum = weights.secondHiddenBias?.[h2] ?? 0;
      for (let h1 = 0; h1 < neural.hiddenCount; h1 += 1) {
        sum += (hidden[h1] ?? 0) * (weights.hiddenHidden?.[h2 * neural.hiddenCount + h1] ?? 0);
      }
      secondHidden[h2] = activate(sum, neural.activation);
    }
  }

  for (let o = 0; o < FIXED_OUTPUT_COUNT; o += 1) {
    let sum = weights.outputBias[o] ?? 0;
    for (let h = 0; h < lastHidden.length; h += 1) {
      sum += (lastHidden[h] ?? 0) * (weights.lastHiddenOutput[o * lastHidden.length + h] ?? 0);
    }
    outputs[o] = activate(sum, neural.activation);
  }

  return outputs;
}

function activate(value: number, activation: AgentNeuralParameters["activation"]) {
  if (activation === "relu") return Math.max(0, value);
  if (activation === "sigmoid") return 1 / (1 + Math.exp(-value));
  return Math.tanh(value);
}
