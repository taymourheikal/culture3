import type { SeededRng } from "./rng";
import { finiteOr, sanitizeProbability, sanitizeStdDev } from "./sanitize";
import type { SpawnerConfig, SpawnerMutationProfile } from "./types";

const STDDEV_SAFETY_MAX = 10;

type MutationProfileKey = keyof SpawnerMutationProfile;
type MutationProfileGroupTitle =
  | "Topology Mutation"
  | "Weight And Bias Mutation"
  | "Perception Mutation"
  | "Payoff Scale Mutation"
  | "Trading Policy Mutation"
  | "Control Mutation";

type MutationProfileDescriptor = {
  key: MutationProfileKey;
  label: string;
  group: MutationProfileGroupTitle;
  fallback: number;
  sanitizer: "probability" | "stddev";
  format: (value: number) => string;
  drifts: true;
};

const MUTATION_PROFILE_GROUPS: readonly MutationProfileGroupTitle[] = [
  "Topology Mutation",
  "Weight And Bias Mutation",
  "Perception Mutation",
  "Payoff Scale Mutation",
  "Trading Policy Mutation",
  "Control Mutation",
];

const MUTATION_PROFILE_DESCRIPTORS: readonly MutationProfileDescriptor[] = [
  probabilityDescriptor("addUnitRate", "Add unit rate", "Topology Mutation", 0.015),
  probabilityDescriptor("disableUnitRate", "Disable unit rate", "Topology Mutation", 0.006),
  probabilityDescriptor("reenableUnitRate", "Re-enable unit rate", "Topology Mutation", 0.003),
  probabilityDescriptor("addConnectionRate", "Add connection rate", "Topology Mutation", 0.06),
  probabilityDescriptor("disableConnectionRate", "Disable connection rate", "Topology Mutation", 0.025),
  probabilityDescriptor("reenableConnectionRate", "Re-enable connection rate", "Topology Mutation", 0.012),
  probabilityDescriptor("weightMutationRate", "Weight mutation rate", "Weight And Bias Mutation", 0.82),
  stddevDescriptor("weightMutationStdDev", "Weight mutation stddev", "Weight And Bias Mutation", 0.045),
  probabilityDescriptor("weightReplaceRate", "Weight replace rate", "Weight And Bias Mutation", 0.015),
  stddevDescriptor("newConnectionWeightStdDev", "New connection stddev", "Weight And Bias Mutation", 0.45),
  probabilityDescriptor("gateBiasMutationRate", "Gate bias rate", "Weight And Bias Mutation", 0.7),
  stddevDescriptor("gateBiasMutationStdDev", "Gate bias stddev", "Weight And Bias Mutation", 0.035),
  probabilityDescriptor("outputBiasMutationRate", "Output bias rate", "Weight And Bias Mutation", 0.7),
  stddevDescriptor("outputBiasMutationStdDev", "Output bias stddev", "Weight And Bias Mutation", 0.035),
  probabilityDescriptor("perceptionMutationRate", "Perception mutation rate", "Perception Mutation", 0.08),
  stddevDescriptor("perceptionLagMutationStdDev", "Lag mutation stddev", "Perception Mutation", 2, "ticks"),
  stddevDescriptor("perceptionWindowMutationStdDev", "Window mutation stddev", "Perception Mutation", 4, "ticks"),
  stddevDescriptor("perceptionSensitivityMutationStdDev", "Roughness mutation stddev", "Perception Mutation", 0.002, undefined, 4),
  stddevDescriptor("perceptionDensityScaleMutationStdDev", "Density-scale mutation stddev", "Perception Mutation", 4, "ticks"),
  probabilityDescriptor("payoffScaleMutationRate", "Payoff scale mutation rate", "Payoff Scale Mutation", 0.08),
  stddevDescriptor("payoffScaleWindowMutationStdDev", "Payoff window stddev", "Payoff Scale Mutation", 4, "ticks"),
  stddevDescriptor("payoffScaleSampleStepMutationStdDev", "Payoff sample-step stddev", "Payoff Scale Mutation", 4, "ticks"),
  probabilityDescriptor("tradingPolicyMutationRate", "Trading policy mutation rate", "Trading Policy Mutation", 0.08),
  stddevDescriptor("spawnThresholdMutationStdDev", "Spawn-threshold stddev", "Trading Policy Mutation", 0.025),
  stddevDescriptor("minSignalStrengthMutationStdDev", "Min-strength stddev", "Trading Policy Mutation", 0.025),
  stddevDescriptor("thresholdBiasMutationStdDev", "Threshold-bias stddev", "Control Mutation", 0.015),
  stddevDescriptor("minHorizonTicksMutationStdDev", "Min horizon stddev", "Control Mutation", 0.67, "ticks"),
  stddevDescriptor("maxHorizonTicksMutationStdDev", "Max horizon stddev", "Control Mutation", 1.56, "ticks"),
  stddevDescriptor("cooldownBaseTicksMutationStdDev", "Cooldown stddev", "Control Mutation", 0.44, "ticks"),
  stddevDescriptor("mutationProfileMutationStdDev", "Profile drift stddev", "Control Mutation", 0.006),
];

export function defaultMutationProfileFromConfig(config: SpawnerConfig): SpawnerMutationProfile {
  return sanitizeMutationProfile({
    addUnitRate: config.addUnitRate,
    disableUnitRate: config.disableUnitRate,
    reenableUnitRate: config.reenableUnitRate,
    addConnectionRate: config.addConnectionRate,
    disableConnectionRate: config.disableConnectionRate,
    reenableConnectionRate: config.reenableConnectionRate,
    weightMutationRate: config.weightMutationRate,
    weightMutationStdDev: config.weightMutationStdDev,
    weightReplaceRate: config.weightReplaceRate,
    newConnectionWeightStdDev: config.newConnectionWeightStdDev,
    gateBiasMutationRate: config.biasMutationRate,
    gateBiasMutationStdDev: config.biasMutationStdDev,
    outputBiasMutationRate: config.biasMutationRate,
    outputBiasMutationStdDev: config.biasMutationStdDev,
    perceptionMutationRate: config.perceptionMutationRate,
    perceptionLagMutationStdDev: config.perceptionLagMutationStdDev,
    perceptionWindowMutationStdDev: config.perceptionWindowMutationStdDev,
    perceptionSensitivityMutationStdDev: config.perceptionSensitivityMutationStdDev,
    perceptionDensityScaleMutationStdDev: config.perceptionDensityScaleMutationStdDev,
    payoffScaleMutationRate: config.payoffScaleMutationRate,
    payoffScaleWindowMutationStdDev: config.payoffScaleWindowMutationStdDev,
    payoffScaleSampleStepMutationStdDev: config.payoffScaleSampleStepMutationStdDev,
    tradingPolicyMutationRate: config.tradingPolicyMutationRate,
    spawnThresholdMutationStdDev: config.spawnThresholdMutationStdDev,
    minSignalStrengthMutationStdDev: config.minSignalStrengthMutationStdDev,
    thresholdBiasMutationStdDev: config.thresholdBiasMutationStdDev,
    minHorizonTicksMutationStdDev: config.minHorizonTicksMutationStdDev,
    maxHorizonTicksMutationStdDev: config.maxHorizonTicksMutationStdDev,
    cooldownBaseTicksMutationStdDev: config.cooldownBaseTicksMutationStdDev,
    mutationProfileMutationStdDev: config.mutationProfileMutationStdDev,
  });
}

export function sanitizeMutationProfile(profile: Partial<SpawnerMutationProfile> | undefined): SpawnerMutationProfile {
  const sanitized = {} as SpawnerMutationProfile;
  for (const descriptor of MUTATION_PROFILE_DESCRIPTORS) {
    sanitized[descriptor.key] = sanitizeMutationProfileField(descriptor, profile?.[descriptor.key]);
  }
  return sanitized;
}

export function driftMutationProfile(profile: SpawnerMutationProfile, rng: SeededRng) {
  const current = sanitizeMutationProfile(profile);
  const drift = current.mutationProfileMutationStdDev;
  const drifted = {} as SpawnerMutationProfile;
  for (const descriptor of MUTATION_PROFILE_DESCRIPTORS) {
    drifted[descriptor.key] = descriptor.drifts ? mutate(current[descriptor.key], drift, rng) : current[descriptor.key];
  }
  return sanitizeMutationProfile(drifted);
}

export function summarizeMutationProfile(profile: SpawnerMutationProfile) {
  const current = sanitizeMutationProfile(profile);
  const topologyRate =
    (current.addUnitRate +
      current.disableUnitRate +
      current.reenableUnitRate +
      current.addConnectionRate +
      current.disableConnectionRate +
      current.reenableConnectionRate) /
    6;
  const weightActivity = current.weightMutationRate * current.weightMutationStdDev;
  const biasActivity =
    (current.gateBiasMutationRate * current.gateBiasMutationStdDev +
      current.outputBiasMutationRate * current.outputBiasMutationStdDev) /
    2;
  return {
    topologyRate,
    weightActivity,
    biasActivity,
    perceptionMutationRate: current.perceptionMutationRate,
    payoffScaleMutationRate: current.payoffScaleMutationRate,
    tradingPolicyMutationRate: current.tradingPolicyMutationRate,
    mutationProfileMutationStdDev: current.mutationProfileMutationStdDev,
  };
}

export function mutationProfileDetailGroups(profile: SpawnerMutationProfile) {
  const current = sanitizeMutationProfile(profile);
  return MUTATION_PROFILE_GROUPS.map((title) => ({
    title,
    rows: MUTATION_PROFILE_DESCRIPTORS
      .filter((descriptor) => descriptor.group === title)
      .map((descriptor) => ({ label: descriptor.label, value: descriptor.format(current[descriptor.key]) })),
  }));
}

function mutate(value: number, stdDev: number, rng: SeededRng) {
  return value + rng.gaussian(0, Math.max(0, finiteOr(stdDev, 0)));
}

function probability(value: number | undefined, fallback: number) {
  return sanitizeProbability(value, fallback);
}

function stddev(value: number | undefined, fallback: number) {
  return sanitizeStdDev(value, fallback, STDDEV_SAFETY_MAX);
}

function probabilityDescriptor(
  key: MutationProfileKey,
  label: string,
  group: MutationProfileGroupTitle,
  fallback: number,
): MutationProfileDescriptor {
  return {
    key,
    label,
    group,
    fallback,
    sanitizer: "probability",
    format: formatProbability,
    drifts: true,
  };
}

function stddevDescriptor(
  key: MutationProfileKey,
  label: string,
  group: MutationProfileGroupTitle,
  fallback: number,
  unit?: "ticks",
  digits = 3,
): MutationProfileDescriptor {
  return {
    key,
    label,
    group,
    fallback,
    sanitizer: "stddev",
    format: (value) => `${formatDecimal(value, digits)}${unit ? ` ${unit}` : ""}`,
    drifts: true,
  };
}

function sanitizeMutationProfileField(descriptor: MutationProfileDescriptor, value: number | undefined) {
  return descriptor.sanitizer === "probability"
    ? probability(value, descriptor.fallback)
    : stddev(value, descriptor.fallback);
}

function formatProbability(value: number) {
  return value.toFixed(3);
}

function formatDecimal(value: number, digits = 3) {
  return value.toFixed(digits);
}
