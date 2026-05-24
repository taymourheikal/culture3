import { clamp } from "./math";
import type { SeededRng } from "./rng";
import type { SpawnerConfig, SpawnerMutationProfile } from "./types";

const STDDEV_SAFETY_MAX = 10;

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
    thresholdBiasMutationStdDev: config.thresholdBiasMutationStdDev,
    minHorizonTicksMutationStdDev: config.minHorizonTicksMutationStdDev,
    maxHorizonTicksMutationStdDev: config.maxHorizonTicksMutationStdDev,
    cooldownBaseTicksMutationStdDev: config.cooldownBaseTicksMutationStdDev,
    mutationProfileMutationStdDev: config.mutationProfileMutationStdDev,
  });
}

export function sanitizeMutationProfile(profile: Partial<SpawnerMutationProfile> | undefined): SpawnerMutationProfile {
  return {
    addUnitRate: probability(profile?.addUnitRate, 0.015),
    disableUnitRate: probability(profile?.disableUnitRate, 0.006),
    reenableUnitRate: probability(profile?.reenableUnitRate, 0.003),
    addConnectionRate: probability(profile?.addConnectionRate, 0.06),
    disableConnectionRate: probability(profile?.disableConnectionRate, 0.025),
    reenableConnectionRate: probability(profile?.reenableConnectionRate, 0.012),
    weightMutationRate: probability(profile?.weightMutationRate, 0.82),
    weightMutationStdDev: stddev(profile?.weightMutationStdDev, 0.045),
    weightReplaceRate: probability(profile?.weightReplaceRate, 0.015),
    newConnectionWeightStdDev: stddev(profile?.newConnectionWeightStdDev, 0.45),
    gateBiasMutationRate: probability(profile?.gateBiasMutationRate, 0.7),
    gateBiasMutationStdDev: stddev(profile?.gateBiasMutationStdDev, 0.035),
    outputBiasMutationRate: probability(profile?.outputBiasMutationRate, 0.7),
    outputBiasMutationStdDev: stddev(profile?.outputBiasMutationStdDev, 0.035),
    perceptionMutationRate: probability(profile?.perceptionMutationRate, 0.08),
    perceptionLagMutationStdDev: stddev(profile?.perceptionLagMutationStdDev, 2),
    perceptionWindowMutationStdDev: stddev(profile?.perceptionWindowMutationStdDev, 4),
    perceptionSensitivityMutationStdDev: stddev(profile?.perceptionSensitivityMutationStdDev, 0.002),
    perceptionDensityScaleMutationStdDev: stddev(profile?.perceptionDensityScaleMutationStdDev, 4),
    thresholdBiasMutationStdDev: stddev(profile?.thresholdBiasMutationStdDev, 0.015),
    minHorizonTicksMutationStdDev: stddev(profile?.minHorizonTicksMutationStdDev, 0.67),
    maxHorizonTicksMutationStdDev: stddev(profile?.maxHorizonTicksMutationStdDev, 1.56),
    cooldownBaseTicksMutationStdDev: stddev(profile?.cooldownBaseTicksMutationStdDev, 0.44),
    mutationProfileMutationStdDev: stddev(profile?.mutationProfileMutationStdDev, 0.006),
  };
}

export function driftMutationProfile(profile: SpawnerMutationProfile, rng: SeededRng) {
  const current = sanitizeMutationProfile(profile);
  const drift = current.mutationProfileMutationStdDev;
  return sanitizeMutationProfile({
    addUnitRate: mutate(current.addUnitRate, drift, rng),
    disableUnitRate: mutate(current.disableUnitRate, drift, rng),
    reenableUnitRate: mutate(current.reenableUnitRate, drift, rng),
    addConnectionRate: mutate(current.addConnectionRate, drift, rng),
    disableConnectionRate: mutate(current.disableConnectionRate, drift, rng),
    reenableConnectionRate: mutate(current.reenableConnectionRate, drift, rng),
    weightMutationRate: mutate(current.weightMutationRate, drift, rng),
    weightMutationStdDev: mutate(current.weightMutationStdDev, drift, rng),
    weightReplaceRate: mutate(current.weightReplaceRate, drift, rng),
    newConnectionWeightStdDev: mutate(current.newConnectionWeightStdDev, drift, rng),
    gateBiasMutationRate: mutate(current.gateBiasMutationRate, drift, rng),
    gateBiasMutationStdDev: mutate(current.gateBiasMutationStdDev, drift, rng),
    outputBiasMutationRate: mutate(current.outputBiasMutationRate, drift, rng),
    outputBiasMutationStdDev: mutate(current.outputBiasMutationStdDev, drift, rng),
    perceptionMutationRate: mutate(current.perceptionMutationRate, drift, rng),
    perceptionLagMutationStdDev: mutate(current.perceptionLagMutationStdDev, drift, rng),
    perceptionWindowMutationStdDev: mutate(current.perceptionWindowMutationStdDev, drift, rng),
    perceptionSensitivityMutationStdDev: mutate(current.perceptionSensitivityMutationStdDev, drift, rng),
    perceptionDensityScaleMutationStdDev: mutate(current.perceptionDensityScaleMutationStdDev, drift, rng),
    thresholdBiasMutationStdDev: mutate(current.thresholdBiasMutationStdDev, drift, rng),
    minHorizonTicksMutationStdDev: mutate(current.minHorizonTicksMutationStdDev, drift, rng),
    maxHorizonTicksMutationStdDev: mutate(current.maxHorizonTicksMutationStdDev, drift, rng),
    cooldownBaseTicksMutationStdDev: mutate(current.cooldownBaseTicksMutationStdDev, drift, rng),
    mutationProfileMutationStdDev: mutate(current.mutationProfileMutationStdDev, drift, rng),
  });
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
    mutationProfileMutationStdDev: current.mutationProfileMutationStdDev,
  };
}

export function mutationProfileDetailGroups(profile: SpawnerMutationProfile) {
  const current = sanitizeMutationProfile(profile);
  return [
    {
      title: "Topology Mutation",
      rows: [
        { label: "Add unit rate", value: formatProbability(current.addUnitRate) },
        { label: "Disable unit rate", value: formatProbability(current.disableUnitRate) },
        { label: "Re-enable unit rate", value: formatProbability(current.reenableUnitRate) },
        { label: "Add connection rate", value: formatProbability(current.addConnectionRate) },
        { label: "Disable connection rate", value: formatProbability(current.disableConnectionRate) },
        { label: "Re-enable connection rate", value: formatProbability(current.reenableConnectionRate) },
      ],
    },
    {
      title: "Weight And Bias Mutation",
      rows: [
        { label: "Weight mutation rate", value: formatProbability(current.weightMutationRate) },
        { label: "Weight mutation stddev", value: formatDecimal(current.weightMutationStdDev) },
        { label: "Weight replace rate", value: formatProbability(current.weightReplaceRate) },
        { label: "New connection stddev", value: formatDecimal(current.newConnectionWeightStdDev) },
        { label: "Gate bias rate", value: formatProbability(current.gateBiasMutationRate) },
        { label: "Gate bias stddev", value: formatDecimal(current.gateBiasMutationStdDev) },
        { label: "Output bias rate", value: formatProbability(current.outputBiasMutationRate) },
        { label: "Output bias stddev", value: formatDecimal(current.outputBiasMutationStdDev) },
      ],
    },
    {
      title: "Perception Mutation",
      rows: [
        { label: "Perception mutation rate", value: formatProbability(current.perceptionMutationRate) },
        { label: "Lag mutation stddev", value: `${formatDecimal(current.perceptionLagMutationStdDev)} ticks` },
        { label: "Window mutation stddev", value: `${formatDecimal(current.perceptionWindowMutationStdDev)} ticks` },
        { label: "Roughness mutation stddev", value: formatDecimal(current.perceptionSensitivityMutationStdDev, 4) },
        { label: "Density-scale mutation stddev", value: `${formatDecimal(current.perceptionDensityScaleMutationStdDev)} ticks` },
      ],
    },
    {
      title: "Control Mutation",
      rows: [
        { label: "Threshold-bias stddev", value: formatDecimal(current.thresholdBiasMutationStdDev) },
        { label: "Min horizon stddev", value: `${formatDecimal(current.minHorizonTicksMutationStdDev)} ticks` },
        { label: "Max horizon stddev", value: `${formatDecimal(current.maxHorizonTicksMutationStdDev)} ticks` },
        { label: "Cooldown stddev", value: `${formatDecimal(current.cooldownBaseTicksMutationStdDev)} ticks` },
        { label: "Profile drift stddev", value: formatDecimal(current.mutationProfileMutationStdDev) },
      ],
    },
  ];
}

function mutate(value: number, stdDev: number, rng: SeededRng) {
  return value + rng.gaussian(0, Math.max(0, finiteOr(stdDev, 0)));
}

function probability(value: number | undefined, fallback: number) {
  return clamp(finiteOr(value, fallback), 0, 1);
}

function stddev(value: number | undefined, fallback: number) {
  return clamp(finiteOr(value, fallback), 0, STDDEV_SAFETY_MAX);
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatProbability(value: number) {
  return value.toFixed(3);
}

function formatDecimal(value: number, digits = 3) {
  return value.toFixed(digits);
}
