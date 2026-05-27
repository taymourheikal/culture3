import type { SpawnerPlasticityProfile } from "./plasticity";

export type GateType = "update" | "reset" | "candidate";
export type OutputName = "long" | "short" | "strength" | "horizon" | "cooldown" | "reproduce";

export type ConnectionSource =
  | { kind: "input"; index: number }
  | { kind: "hidden"; unitId: number; mode: "current" | "previous" };

export type ConnectionTarget =
  | { kind: "hidden"; unitId: number; gate: GateType }
  | { kind: "output"; index: number };

export type HiddenUnitGene = {
  unitId: number;
  innovationId: number;
  layerIndex: number;
  enabled: boolean;
  updateBias: number;
  resetBias: number;
  candidateBias: number;
};

export type ConnectionGene = {
  innovationId: number;
  source: ConnectionSource;
  target: ConnectionTarget;
  weight: number;
  enabled: boolean;
};

export type SpawnerPerceptionLagPair = {
  fromTicks: number;
  toTicks: number;
};

export type SpawnerPerception = {
  deltaLagPairs: SpawnerPerceptionLagPair[];
  rollingWindowTicks: number;
  localScaleWindowTicks: number;
  localScaleSampleStepTicks: number;
  trendWindowTicks: number;
  cycleWindowTicks: number;
  roughnessSensitivity: number;
  pendingDensityScale: number;
};

export type SpawnerPayoffProfile = {
  scaleWindowTicks: number;
  scaleSampleStepTicks: number;
};

export type SpawnerTradingPolicy = {
  spawnThreshold: number;
  minSignalStrength: number;
};

export type SpawnerMutationProfile = {
  addUnitRate: number;
  disableUnitRate: number;
  reenableUnitRate: number;
  addConnectionRate: number;
  disableConnectionRate: number;
  reenableConnectionRate: number;
  weightMutationRate: number;
  weightMutationStdDev: number;
  weightReplaceRate: number;
  newConnectionWeightStdDev: number;
  gateBiasMutationRate: number;
  gateBiasMutationStdDev: number;
  outputBiasMutationRate: number;
  outputBiasMutationStdDev: number;
  perceptionMutationRate: number;
  perceptionLagMutationStdDev: number;
  perceptionWindowMutationStdDev: number;
  perceptionSensitivityMutationStdDev: number;
  perceptionDensityScaleMutationStdDev: number;
  payoffScaleMutationRate: number;
  payoffScaleWindowMutationStdDev: number;
  payoffScaleSampleStepMutationStdDev: number;
  tradingPolicyMutationRate: number;
  spawnThresholdMutationStdDev: number;
  minSignalStrengthMutationStdDev: number;
  thresholdBiasMutationStdDev: number;
  minHorizonTicksMutationStdDev: number;
  maxHorizonTicksMutationStdDev: number;
  cooldownBaseTicksMutationStdDev: number;
  mutationProfileMutationStdDev: number;
};

export type InnovationRegistry = {
  nextInnovationId: number;
  connectionInnovations: Record<string, number>;
};

export type SpawnerGenome = {
  units: HiddenUnitGene[];
  connections: ConnectionGene[];
  outputBias: number[];
  nextUnitId: number;
  mutationStd: number;
  thresholdBias: number;
  minHorizonTicks: number;
  maxHorizonTicks: number;
  cooldownBaseTicks: number;
  perception: SpawnerPerception;
  payoffProfile: SpawnerPayoffProfile;
  tradingPolicy: SpawnerTradingPolicy;
  mutationProfile: SpawnerMutationProfile;
  plasticityProfile: SpawnerPlasticityProfile;
};
