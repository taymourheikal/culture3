import type { GateType, SpawnerConfig } from "./types";
import { clamp } from "./math";
import {
  finiteOr as sharedFiniteOr,
  nonNegative,
  nonNegativeInteger,
  positive,
  probability,
} from "../numeric";

export const LEARNED_DELTA_SAFETY_MAX = 100;
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
  connectionActivationSources?: number[];
  connectionActivationTargets?: number[];
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
  options: { assumeNormalizedRuntimeState?: boolean } = {},
): SpawnerLearnedState {
  if (options.assumeNormalizedRuntimeState && state && hasNormalizedDecayProfile(profile)) {
    const current = state as SpawnerLearnedState;
    if (!learnedStateDecayCanChange(current, profile)) return current;
    const factor = clamp(1 - profile.experienceDecayRate, 0, 1);
    return {
      ...current,
      connectionDeltas: scaleDeltaMap(current.connectionDeltas, factor, profile.maxLearnedDelta),
      outputBiasDeltas: scaleDeltaMap(current.outputBiasDeltas, factor, profile.maxLearnedDelta),
      gateBiasDeltas: scaleDeltaMap(current.gateBiasDeltas, factor, profile.maxLearnedDelta),
    };
  }
  const plasticity = sanitizePlasticityProfile(profile);
  const factor = clamp(1 - plasticity.experienceDecayRate, 0, 1);
  const decayed = sanitizeLearnedState(state, plasticity.maxLearnedDelta);
  if (factor === 1 || !hasActiveLearnedDeltas(decayed)) return decayed;
  return {
    ...decayed,
    connectionDeltas: scaleDeltaMap(decayed.connectionDeltas, factor, plasticity.maxLearnedDelta),
    outputBiasDeltas: scaleDeltaMap(decayed.outputBiasDeltas, factor, plasticity.maxLearnedDelta),
    gateBiasDeltas: scaleDeltaMap(decayed.gateBiasDeltas, factor, plasticity.maxLearnedDelta),
  };
}

export function learnedStateDecayCanChange(
  state: Partial<SpawnerLearnedState> | undefined,
  profile: Partial<SpawnerPlasticityProfile> | undefined,
) {
  const decayRate = profile?.experienceDecayRate;
  return typeof decayRate === "number" && Number.isFinite(decayRate) && decayRate > 0 && hasActiveLearnedDeltas(state);
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

export function traceConnectionActivation(trace: SpawnerDecisionTrace, innovationId: number, activeConnectionIndex?: number) {
  const compactIndex = activeConnectionIndex ?? trace.activeConnectionIds.indexOf(innovationId);
  if (
    compactIndex >= 0 &&
    Array.isArray(trace.connectionActivationSources) &&
    Array.isArray(trace.connectionActivationTargets)
  ) {
    const sourceValue = trace.connectionActivationSources[compactIndex];
    const targetValue = trace.connectionActivationTargets[compactIndex];
    if (sourceValue === undefined || targetValue === undefined) return undefined;
    const source = finiteOr(sourceValue, 0);
    const target = finiteOr(targetValue, 0);
    return { source, target };
  }
  const activation = trace.connectionActivations[String(innovationId)];
  return activation ? { source: finiteOr(activation.source, 0), target: finiteOr(activation.target, 0) } : undefined;
}

export function materializeDecisionTrace(trace: SpawnerDecisionTrace): SpawnerDecisionTrace {
  const connectionActivations = sanitizeConnectionActivations(trace.connectionActivations);
  if (Array.isArray(trace.connectionActivationSources) && Array.isArray(trace.connectionActivationTargets)) {
    for (let index = 0; index < trace.activeConnectionIds.length; index += 1) {
      const innovationId = trace.activeConnectionIds[index];
      if (innovationId === undefined || connectionActivations[String(innovationId)]) continue;
      const activation = traceConnectionActivation(trace, innovationId, index);
      if (activation) connectionActivations[String(innovationId)] = activation;
    }
  }
  return {
    id: trace.id,
    tick: trace.tick,
    action: trace.action,
    strength: trace.strength,
    activeConnectionIds: [...trace.activeConnectionIds],
    connectionActivations,
  };
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
  return materializeDecisionTrace({
    id: sanitizeCount(trace.id),
    tick: sanitizeCount(trace.tick, 0),
    action,
    strength: finiteOr(trace.strength, 0),
    activeConnectionIds: Array.isArray(trace.activeConnectionIds) ? trace.activeConnectionIds.map((id) => sanitizeCount(id)).filter((id) => id > 0) : [],
    connectionActivations: sanitizeConnectionActivations(trace.connectionActivations),
    connectionActivationSources: sanitizeActivationArray((trace as Partial<SpawnerDecisionTrace>).connectionActivationSources),
    connectionActivationTargets: sanitizeActivationArray((trace as Partial<SpawnerDecisionTrace>).connectionActivationTargets),
  } satisfies SpawnerDecisionTrace);
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

function sanitizeActivationArray(value: number[] | undefined) {
  return Array.isArray(value) ? value.map((entry) => finiteOr(entry, 0)) : undefined;
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

function hasActiveLearnedDeltas(state: Partial<SpawnerLearnedState> | undefined) {
  return hasEntries(state?.connectionDeltas) || hasEntries(state?.outputBiasDeltas) || hasEntries(state?.gateBiasDeltas);
}

function hasNormalizedDecayProfile(profile: Partial<SpawnerPlasticityProfile> | undefined): profile is SpawnerPlasticityProfile {
  return (
    typeof profile?.experienceDecayRate === "number" &&
    Number.isFinite(profile.experienceDecayRate) &&
    typeof profile.maxLearnedDelta === "number" &&
    Number.isFinite(profile.maxLearnedDelta)
  );
}

function hasEntries(value: Record<string, number> | undefined) {
  if (!value || typeof value !== "object") return false;
  for (const _key in value) return true;
  return false;
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
