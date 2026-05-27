import type { GateType, SpawnerConfig } from "./types";
import { clamp } from "./math";
import {
  finiteOr as sharedFiniteOr,
  nonNegative,
  nonNegativeInteger,
  positive,
  probability,
} from "../numeric";

const LEARNED_DELTA_SAFETY_MAX = 100;
const TRACE_RETENTION_SAFETY_MAX = 10_000;

export type SpawnerLearnedState = {
  connectionDeltas: Record<string, number>;
  outputBiasDeltas: Record<string, number>;
  gateBiasDeltas: Record<string, number>;
  recentLearningSignal: number;
  learningUpdateCount: number;
  reproductionLearningCount: number;
};

export type SpawnerDecisionTrace = {
  id: number;
  tick: number;
  action: "long" | "short" | "reproduce";
  strength: number;
  activeConnectionIds: number[];
  connectionActivations: Record<string, { source: number; target: number }>;
};

export type SpawnerTraceStore = {
  nextTraceId: number;
  traces: Record<string, SpawnerDecisionTrace>;
};

export type SpawnerPlasticityProfile = {
  weightLearningRate: number;
  biasLearningRate: number;
  positiveRewardMultiplier: number;
  negativeRewardMultiplier: number;
  reproductionRewardStrength: number;
  experienceDecayRate: number;
  maxLearnedDelta: number;
  eligibilityTraceStrength: number;
  plasticityMutationStdDev: number;
};

export const DEFAULT_PLASTICITY_PROFILE: SpawnerPlasticityProfile = {
  weightLearningRate: 0,
  biasLearningRate: 0,
  positiveRewardMultiplier: 1,
  negativeRewardMultiplier: 1,
  reproductionRewardStrength: 0,
  experienceDecayRate: 0,
  maxLearnedDelta: 5,
  eligibilityTraceStrength: 1,
  plasticityMutationStdDev: 0,
};

export function createEmptyLearnedState(): SpawnerLearnedState {
  return {
    connectionDeltas: {},
    outputBiasDeltas: {},
    gateBiasDeltas: {},
    recentLearningSignal: 0,
    learningUpdateCount: 0,
    reproductionLearningCount: 0,
  };
}

export function createEmptyTraceStore(): SpawnerTraceStore {
  return {
    nextTraceId: 1,
    traces: {},
  };
}

export function sanitizeLearnedState(state: Partial<SpawnerLearnedState> | undefined, maxDelta = DEFAULT_PLASTICITY_PROFILE.maxLearnedDelta): SpawnerLearnedState {
  const cap = sanitizePositive(maxDelta, DEFAULT_PLASTICITY_PROFILE.maxLearnedDelta, LEARNED_DELTA_SAFETY_MAX);
  return {
    connectionDeltas: sanitizeDeltaMap(state?.connectionDeltas, cap),
    outputBiasDeltas: sanitizeDeltaMap(state?.outputBiasDeltas, cap),
    gateBiasDeltas: sanitizeDeltaMap(state?.gateBiasDeltas, cap),
    recentLearningSignal: finiteOr(state?.recentLearningSignal, 0),
    learningUpdateCount: sanitizeCount(state?.learningUpdateCount),
    reproductionLearningCount: sanitizeCount(state?.reproductionLearningCount),
  };
}

export function cloneLearnedState(state: Partial<SpawnerLearnedState> | undefined, maxDelta = DEFAULT_PLASTICITY_PROFILE.maxLearnedDelta): SpawnerLearnedState {
  return sanitizeLearnedState(state, maxDelta);
}

export function learnedStateNorm(state: Partial<SpawnerLearnedState> | undefined, maxDelta = DEFAULT_PLASTICITY_PROFILE.maxLearnedDelta) {
  const current = sanitizeLearnedState(state, maxDelta);
  const values = [
    ...Object.values(current.connectionDeltas),
    ...Object.values(current.outputBiasDeltas),
    ...Object.values(current.gateBiasDeltas),
  ];
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

export function decayLearnedState(
  state: Partial<SpawnerLearnedState> | undefined,
  profile: Partial<SpawnerPlasticityProfile> | undefined,
): SpawnerLearnedState {
  const plasticity = sanitizePlasticityProfile(profile);
  const factor = clamp(1 - plasticity.experienceDecayRate, 0, 1);
  const decayed = sanitizeLearnedState(state, plasticity.maxLearnedDelta);
  return {
    ...decayed,
    connectionDeltas: scaleDeltaMap(decayed.connectionDeltas, factor, plasticity.maxLearnedDelta),
    outputBiasDeltas: scaleDeltaMap(decayed.outputBiasDeltas, factor, plasticity.maxLearnedDelta),
    gateBiasDeltas: scaleDeltaMap(decayed.gateBiasDeltas, factor, plasticity.maxLearnedDelta),
  };
}

export function clampLearnedState(
  state: Partial<SpawnerLearnedState> | undefined,
  profile: Partial<SpawnerPlasticityProfile> | undefined,
): SpawnerLearnedState {
  return sanitizeLearnedState(state, sanitizePlasticityProfile(profile).maxLearnedDelta);
}

export function sanitizeTraceStore(store: Partial<SpawnerTraceStore> | undefined): SpawnerTraceStore {
  const traces: Record<string, SpawnerDecisionTrace> = {};
  const source = store?.traces && typeof store.traces === "object" ? store.traces : {};
  for (const [key, trace] of Object.entries(source).slice(-TRACE_RETENTION_SAFETY_MAX)) {
    const sanitized = sanitizeDecisionTrace(trace);
    if (sanitized) traces[key] = sanitized;
  }
  return {
    nextTraceId: Math.max(1, sanitizeCount(store?.nextTraceId, 1)),
    traces,
  };
}

export function cloneTraceStore(store: Partial<SpawnerTraceStore> | undefined): SpawnerTraceStore {
  return sanitizeTraceStore(store);
}

export function sanitizePlasticityProfile(profile: Partial<SpawnerPlasticityProfile> | undefined): SpawnerPlasticityProfile {
  return {
    weightLearningRate: sanitizeProbability(profile?.weightLearningRate, DEFAULT_PLASTICITY_PROFILE.weightLearningRate),
    biasLearningRate: sanitizeProbability(profile?.biasLearningRate, DEFAULT_PLASTICITY_PROFILE.biasLearningRate),
    positiveRewardMultiplier: sanitizeNonNegative(profile?.positiveRewardMultiplier, DEFAULT_PLASTICITY_PROFILE.positiveRewardMultiplier),
    negativeRewardMultiplier: sanitizeNonNegative(profile?.negativeRewardMultiplier, DEFAULT_PLASTICITY_PROFILE.negativeRewardMultiplier),
    reproductionRewardStrength: sanitizeProbability(profile?.reproductionRewardStrength, DEFAULT_PLASTICITY_PROFILE.reproductionRewardStrength),
    experienceDecayRate: sanitizeProbability(profile?.experienceDecayRate, DEFAULT_PLASTICITY_PROFILE.experienceDecayRate),
    maxLearnedDelta: sanitizePositive(profile?.maxLearnedDelta, DEFAULT_PLASTICITY_PROFILE.maxLearnedDelta, LEARNED_DELTA_SAFETY_MAX),
    eligibilityTraceStrength: sanitizeProbability(profile?.eligibilityTraceStrength, DEFAULT_PLASTICITY_PROFILE.eligibilityTraceStrength),
    plasticityMutationStdDev: sanitizeProbability(profile?.plasticityMutationStdDev, DEFAULT_PLASTICITY_PROFILE.plasticityMutationStdDev),
  };
}

export function clonePlasticityProfile(profile: Partial<SpawnerPlasticityProfile> | undefined): SpawnerPlasticityProfile {
  return sanitizePlasticityProfile(profile);
}

export function plasticityProfileFromConfig(config: SpawnerConfig): SpawnerPlasticityProfile {
  return sanitizePlasticityProfile({
    weightLearningRate: config.plasticityWeightLearningRate,
    biasLearningRate: config.plasticityBiasLearningRate,
    positiveRewardMultiplier: config.plasticityPositiveRewardMultiplier,
    negativeRewardMultiplier: config.plasticityNegativeRewardMultiplier,
    reproductionRewardStrength: config.plasticityReproductionRewardStrength,
    experienceDecayRate: config.plasticityExperienceDecayRate,
    maxLearnedDelta: config.plasticityMaxLearnedDelta,
    eligibilityTraceStrength: config.plasticityEligibilityTraceStrength,
    plasticityMutationStdDev: config.plasticityMutationStdDev,
  });
}

export function driftPlasticityProfile(
  profile: Partial<SpawnerPlasticityProfile> | undefined,
  rng: { gaussian: (mean: number, stddev: number) => number },
): SpawnerPlasticityProfile {
  const current = sanitizePlasticityProfile(profile);
  const drift = current.plasticityMutationStdDev;
  if (drift === 0) return current;
  return sanitizePlasticityProfile({
    weightLearningRate: current.weightLearningRate + rng.gaussian(0, drift),
    biasLearningRate: current.biasLearningRate + rng.gaussian(0, drift),
    positiveRewardMultiplier: current.positiveRewardMultiplier + rng.gaussian(0, drift),
    negativeRewardMultiplier: current.negativeRewardMultiplier + rng.gaussian(0, drift),
    reproductionRewardStrength: current.reproductionRewardStrength + rng.gaussian(0, drift),
    experienceDecayRate: current.experienceDecayRate + rng.gaussian(0, drift),
    maxLearnedDelta: current.maxLearnedDelta + rng.gaussian(0, drift),
    eligibilityTraceStrength: current.eligibilityTraceStrength + rng.gaussian(0, drift),
    plasticityMutationStdDev: current.plasticityMutationStdDev + rng.gaussian(0, drift),
  });
}

export function connectionDeltaKey(innovationId: number) {
  return String(Math.round(innovationId));
}

export function outputBiasDeltaKey(outputIndex: number) {
  return String(Math.round(outputIndex));
}

export function gateBiasDeltaKey(unitId: number, gate: GateType) {
  return `${Math.round(unitId)}:${gate}`;
}

export function plasticitySummary(profile: Partial<SpawnerPlasticityProfile> | undefined) {
  const current = sanitizePlasticityProfile(profile);
  return {
    learningRateMean: (current.weightLearningRate + current.biasLearningRate) / 2,
    rewardMultiplierMean: (current.positiveRewardMultiplier + current.negativeRewardMultiplier) / 2,
    reproductionRewardStrength: current.reproductionRewardStrength,
    experienceDecayRate: current.experienceDecayRate,
    maxLearnedDelta: current.maxLearnedDelta,
    plasticityMutationStdDev: current.plasticityMutationStdDev,
  };
}

function sanitizeDecisionTrace(trace: SpawnerDecisionTrace | undefined) {
  if (!trace || typeof trace !== "object") return null;
  const legacyAction = (trace as { chosenAction?: unknown }).chosenAction;
  const action =
    trace.action === "long" || trace.action === "short" || trace.action === "reproduce"
      ? trace.action
      : legacyAction === "long" || legacyAction === "short"
        ? legacyAction
        : "reproduce";
  return {
    id: sanitizeCount(trace.id),
    tick: sanitizeCount(trace.tick, 0),
    action,
    strength: finiteOr(trace.strength, 0),
    activeConnectionIds: Array.isArray(trace.activeConnectionIds) ? trace.activeConnectionIds.map((id) => sanitizeCount(id)).filter((id) => id > 0) : [],
    connectionActivations: sanitizeConnectionActivations(trace.connectionActivations),
  } satisfies SpawnerDecisionTrace;
}

function sanitizeConnectionActivations(value: SpawnerDecisionTrace["connectionActivations"] | undefined) {
  const activations: SpawnerDecisionTrace["connectionActivations"] = {};
  if (!value || typeof value !== "object") return activations;
  for (const [key, activation] of Object.entries(value)) {
    activations[key] = {
      source: finiteOr(activation?.source, 0),
      target: finiteOr(activation?.target, 0),
    };
  }
  return activations;
}

function sanitizeDeltaMap(value: Record<string, number> | undefined, cap: number) {
  const deltas: Record<string, number> = {};
  if (!value || typeof value !== "object") return deltas;
  for (const [key, delta] of Object.entries(value)) {
    const sanitized = clamp(finiteOr(delta, 0), -cap, cap);
    if (sanitized !== 0) deltas[key] = sanitized;
  }
  return deltas;
}

function scaleDeltaMap(value: Record<string, number>, factor: number, cap: number) {
  const next: Record<string, number> = {};
  for (const [key, delta] of Object.entries(value)) {
    const scaled = clamp(delta * factor, -cap, cap);
    if (scaled !== 0) next[key] = scaled;
  }
  return next;
}

function finiteOr(value: number | undefined, fallback: number) {
  return sharedFiniteOr(value, fallback);
}

function sanitizeProbability(value: number | undefined, fallback: number) {
  return probability(value, fallback);
}

function sanitizeNonNegative(value: number | undefined, fallback: number) {
  return nonNegative(value, fallback);
}

function sanitizePositive(value: number | undefined, fallback: number, max: number) {
  return positive(value, fallback, Number.EPSILON, max);
}

function sanitizeCount(value: number | undefined, fallback = 0) {
  return nonNegativeInteger(value, fallback);
}
