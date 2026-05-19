import { BATCH_OUTPUT_NAMES, type BatchRunSummary, type NeuralWeightSummary, type SurvivingLineageSummary } from "../sim/batch";
import type { AgentNeuralParameters } from "../sim/types";
import type { FrequencyItem, HistogramBin, LineageScope } from "./charts";

export const TRAITS = [
  { key: "speed", label: "Speed", precision: 2 },
  { key: "attackPower", label: "Attack power", precision: 0 },
  { key: "attackRange", label: "Attack range", precision: 0 },
  { key: "metabolism", label: "Metabolism", precision: 3 },
  { key: "foodSensitivity", label: "Food focus", precision: 2 },
  { key: "aggressionBias", label: "Aggression", precision: 2 },
  { key: "reproductionThreshold", label: "Repro threshold", precision: 0 },
  { key: "mutationRate", label: "Mutation rate", precision: 3 },
] as const;

export type TraitKey = (typeof TRAITS)[number]["key"];

export type WeightSample = {
  key: string;
  label: string;
  runIndex: number;
  lineageId: number;
  foundingLineage: boolean;
  architectureKey: string;
  architectureLabel: string;
  neuralWeights: NeuralWeightSummary;
  vector: number[];
};

export type SummaryStats = {
  sampleCount: number;
  pairCount: number;
  min: number;
  q10: number;
  median: number;
  mean: number;
  q90: number;
  max: number;
  standardDeviation: number;
  coefficientOfVariation: number;
};

export type DistancePair = {
  leftKey: string;
  rightKey: string;
  distance: number;
};

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

export function flattenLineages(runs: BatchRunSummary[]) {
  return runs.flatMap((run) => run.survivingLineages);
}

export function filterLineages(lineages: SurvivingLineageSummary[], scope: LineageScope) {
  if (scope === "founders") return lineages.filter((lineage) => lineage.foundingLineage);
  if (scope === "rescue") return lineages.filter((lineage) => !lineage.foundingLineage);
  return lineages;
}

export function filterWeightSamples(samples: WeightSample[], scope: LineageScope) {
  if (scope === "founders") return samples.filter((sample) => sample.foundingLineage);
  if (scope === "rescue") return samples.filter((sample) => !sample.foundingLineage);
  return samples;
}

export function architectureDistribution(lineages: SurvivingLineageSummary[]): FrequencyItem[] {
  const counts = new Map<string, number>();
  for (const lineage of lineages) {
    const label = architectureLabel(lineage);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function architectureCounts(samples: WeightSample[]) {
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const sample of samples) {
    const current = counts.get(sample.architectureKey);
    if (current) {
      current.count += 1;
    } else {
      counts.set(sample.architectureKey, {
        key: sample.architectureKey,
        label: sample.architectureLabel,
        count: 1,
      });
    }
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildWeightSamples(runs: BatchRunSummary[]): WeightSample[] {
  return runs.flatMap((run) =>
    run.survivingLineages.map((lineage) => ({
      key: `${run.runIndex}:${lineage.lineageId}`,
      label: `R${run.runIndex + 1} L${lineage.lineageId}`,
      runIndex: run.runIndex,
      lineageId: lineage.lineageId,
      foundingLineage: lineage.foundingLineage,
      architectureKey: architectureKey(lineage),
      architectureLabel: architectureLabel(lineage),
      neuralWeights: lineage.neuralWeights,
      vector: lineage.neuralWeights.flatWeightVector,
    })),
  );
}

export function collectWeights(samples: WeightSample[]) {
  const weights: number[] = [];
  for (const sample of samples) {
    for (const weight of sample.vector) {
      weights.push(weight);
    }
  }
  return weights;
}

export function exactCountDistribution(values: number[]): HistogramBin[] {
  if (values.length === 0) return [];
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ label: String(value), title: String(value), count }));
}

export function integerHistogram(values: number[], targetBins: number): HistogramBin[] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [];
  const bounds = finiteBounds(finite);
  const min = Math.floor(bounds.min);
  const max = Math.ceil(bounds.max);
  if (min === max) {
    return [{ label: String(min), title: String(min), count: finite.length }];
  }

  const valueCount = max - min + 1;
  const binWidth = Math.max(1, Math.ceil(valueCount / targetBins));
  const binCount = Math.ceil(valueCount / binWidth);
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * binWidth;
    const end = Math.min(max, start + binWidth - 1);
    const label = start === end ? String(start) : `${start}-${end}`;
    return { label, title: label, count: 0 };
  });

  for (const value of finite) {
    const index = Math.min(binCount - 1, Math.floor((Math.round(value) - min) / binWidth));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }

  return bins;
}

export function histogram(values: number[], targetBins: number, precision: number): HistogramBin[] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [];
  const { min, max } = finiteBounds(finite);
  if (min === max) {
    const label = formatValue(min, precision);
    return [{ label, title: label, count: finite.length }];
  }

  const binCount = Math.min(targetBins, Math.max(1, finite.length));
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width;
    const end = index === binCount - 1 ? max : start + width;
    const label = `${formatValue(start, precision)}-${formatValue(end, precision)}`;
    return { label, title: label, count: 0 };
  });

  for (const value of finite) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }

  return bins;
}

export function pairwiseDistances(samples: WeightSample[], getVector: (sample: WeightSample) => number[] = (sample) => sample.vector): DistancePair[] {
  const pairs: DistancePair[] = [];
  for (let leftIndex = 0; leftIndex < samples.length; leftIndex += 1) {
    const left = samples[leftIndex];
    if (!left) continue;
    const leftVector = getVector(left);
    for (let rightIndex = leftIndex + 1; rightIndex < samples.length; rightIndex += 1) {
      const right = samples[rightIndex];
      if (!right) continue;
      const rightVector = getVector(right);
      if (leftVector.length !== rightVector.length || leftVector.length === 0) continue;
      pairs.push({
        leftKey: left.key,
        rightKey: right.key,
        distance: euclideanDistance(leftVector, rightVector),
      });
    }
  }
  return pairs;
}

export function summarizeDistances(samples: WeightSample[], pairs: DistancePair[]): SummaryStats {
  const distances = pairs.map((pair) => pair.distance);
  if (distances.length === 0) {
    return {
      sampleCount: samples.length,
      pairCount: 0,
      min: 0,
      q10: 0,
      median: 0,
      mean: 0,
      q90: 0,
      max: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
    };
  }
  const meanValue = mean(distances);
  const standardDeviation = deviation(distances, meanValue);
  return {
    sampleCount: samples.length,
    pairCount: distances.length,
    min: round(Math.min(...distances)),
    q10: round(quantile(distances, 0.1)),
    median: round(quantile(distances, 0.5)),
    mean: round(meanValue),
    q90: round(quantile(distances, 0.9)),
    max: round(Math.max(...distances)),
    standardDeviation: round(standardDeviation),
    coefficientOfVariation: meanValue === 0 ? 0 : round(standardDeviation / meanValue),
  };
}

export function behaviorVector(sample: WeightSample): number[] {
  const outputs: number[] = [];
  for (const scenario of BEHAVIOR_SCENARIOS) {
    outputs.push(...forwardAveragedBrain(sample.neuralWeights, scenario.inputs));
  }
  return outputs;
}

export function behaviorOutputSpread(samples: WeightSample[]) {
  if (samples.length === 0) return [];
  const vectors = samples.map((sample) => behaviorVector(sample));
  return BATCH_OUTPUT_NAMES.map((label, outputIndex) => {
    const values: number[] = [];
    for (const vector of vectors) {
      for (let scenarioIndex = 0; scenarioIndex < BEHAVIOR_SCENARIOS.length; scenarioIndex += 1) {
        const value = vector[scenarioIndex * BATCH_OUTPUT_NAMES.length + outputIndex];
        if (Number.isFinite(value)) values.push(value as number);
      }
    }
    return {
      label,
      spread: values.length === 0 ? 0 : round(deviation(values, mean(values))),
    };
  }).sort((left, right) => right.spread - left.spread || left.label.localeCompare(right.label));
}

export function clusterWeightSamples(samples: WeightSample[]) {
  if (samples.length <= 2) return [...samples];
  const remaining = new Set(samples.map((sample) => sample.key));
  const byKey = new Map(samples.map((sample) => [sample.key, sample]));
  const distances = new Map<string, number>();
  for (const pair of pairwiseDistances(samples)) {
    distances.set(distanceKey(pair.leftKey, pair.rightKey), pair.distance);
  }

  const start = [...samples].sort((left, right) => averageDistance(left, samples, distances) - averageDistance(right, samples, distances) || left.label.localeCompare(right.label))[0];
  if (!start) return [...samples];

  const ordered = [start];
  remaining.delete(start.key);

  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    if (!last) break;
    const next = [...remaining]
      .map((key) => byKey.get(key))
      .filter((sample): sample is WeightSample => Boolean(sample))
      .sort((left, right) => sampleDistance(last, left, distances) - sampleDistance(last, right, distances) || left.label.localeCompare(right.label))[0];
    if (!next) break;
    ordered.push(next);
    remaining.delete(next.key);
  }

  return ordered;
}

export function architectureKey(lineage: SurvivingLineageSummary) {
  const architecture = lineage.neuralWeights.architecture;
  return [
    architecture.activation,
    `h1:${architecture.hiddenCount}`,
    architecture.secondLayerEnabled ? `h2:${architecture.secondHiddenCount}` : "h2:off",
  ].join("|");
}

export function architectureLabel(lineage: SurvivingLineageSummary) {
  const architecture = lineage.neuralWeights.architecture;
  return [
    architecture.activation,
    `H1 ${architecture.hiddenCount}`,
    architecture.secondLayerEnabled ? `H2 ${architecture.secondHiddenCount}` : "H2 off",
  ].join(" | ");
}

function finiteBounds(values: number[]) {
  let min = values[0] as number;
  let max = values[0] as number;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

function formatValue(value: number, precision: number) {
  return value.toFixed(precision);
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

function euclideanDistance(left: number[], right: number[]) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  }
  return round(Math.sqrt(sum));
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const lowValue = sorted[low] ?? 0;
  const highValue = sorted[high] ?? lowValue;
  return lowValue + (highValue - lowValue) * (position - low);
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deviation(values: number[], meanValue: number) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length);
}

function round(value: number) {
  return Number(value.toFixed(6));
}

function distanceKey(left: string, right: string) {
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

function sampleDistance(left: WeightSample, right: WeightSample, distances: Map<string, number>) {
  return distances.get(distanceKey(left.key, right.key)) ?? Number.POSITIVE_INFINITY;
}

function averageDistance(sample: WeightSample, samples: WeightSample[], distances: Map<string, number>) {
  const values = samples.filter((other) => other.key !== sample.key).map((other) => sampleDistance(sample, other, distances));
  return mean(values);
}
