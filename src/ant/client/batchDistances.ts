import { BATCH_OUTPUT_NAMES } from "../sim/batch";
import { BEHAVIOR_SCENARIOS, behaviorVector } from "./averagedBrain";
import { deviation, euclideanDistance, mean, quantile, round } from "./batchAnalysisMath";
import type { DistancePair, SummaryStats, WeightSample } from "./batchAnalysisTypes";

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
