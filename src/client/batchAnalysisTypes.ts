import type { NeuralWeightSummary } from "../sim/batch";

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

export type GroupStats = {
  n: number;
  mean: number;
  standardDeviation: number;
  standardError: number;
};

export type TTestResult = {
  t: number;
  degreesOfFreedom: number;
  pValue: number;
  meanDifference: number;
  effectSize: number;
};
