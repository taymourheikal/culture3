import { OUTPUT_INDEX } from "./config";
import type { BrainEvaluation, BrainTraceActivations } from "./brain";
import { activeConnectionForInnovation, ensureCompiledBrainPlan } from "./brainPlan";
import { clamp } from "./math";
import {
  clampLearnedState,
  connectionDeltaKey,
  createEmptyTraceStore,
  gateBiasDeltaKey,
  outputBiasDeltaKey,
  sanitizePlasticityProfile,
  traceConnectionActivation,
  type SpawnerDecisionTrace,
} from "./plasticity";
import type { SpawnerAgent, SpawnerPlasticityProfile } from "./types";
import type { SpawnerActionChoice, SpawnerDecodedOutputs } from "./world";

export function captureDecisionTrace({
  spawner,
  tick,
  evaluation,
  decoded,
  action,
  traceActivations,
}: {
  spawner: SpawnerAgent;
  tick: number;
  evaluation?: Pick<BrainEvaluation, "activeConnectionIds" | "connectionActivations">;
  decoded: SpawnerDecodedOutputs;
  action: Exclude<SpawnerActionChoice, "wait"> | "reproduce";
  traceActivations?: BrainTraceActivations;
}) {
  spawner.traceStore = spawner.traceStore ?? createEmptyTraceStore();
  const id = Math.max(1, Math.round(spawner.traceStore.nextTraceId || 1));
  spawner.traceStore.nextTraceId = id + 1;
  const activations = traceActivations ?? {
    activeConnectionIds: evaluation?.activeConnectionIds ?? [],
    connectionActivations: evaluation?.connectionActivations ?? {},
    owned: false,
  };
  const consumeOwnedActivations = activations.owned;
  const hasCompactActivations = Array.isArray(activations.connectionActivationSources) && Array.isArray(activations.connectionActivationTargets);
  const trace: SpawnerDecisionTrace = {
    id,
    tick,
    action,
    strength: decoded.strength,
    activeConnectionIds: consumeOwnedActivations ? activations.activeConnectionIds : [...activations.activeConnectionIds],
    connectionActivations: hasCompactActivations
      ? {}
      : consumeOwnedActivations
      ? activations.connectionActivations
      : copyConnectionActivations(activations.connectionActivations, activations.activeConnectionIds),
    connectionActivationSources: hasCompactActivations
      ? consumeOwnedActivations
        ? activations.connectionActivationSources
        : [...(activations.connectionActivationSources ?? [])]
      : undefined,
    connectionActivationTargets: hasCompactActivations
      ? consumeOwnedActivations
        ? activations.connectionActivationTargets
        : [...(activations.connectionActivationTargets ?? [])]
      : undefined,
  };
  if (consumeOwnedActivations) activations.owned = false;
  spawner.traceStore.traces[String(id)] = trace;
  return id;
}

export function learningSignalFromPayoff(payoff: number, profile: Partial<SpawnerPlasticityProfile> | undefined) {
  const plasticity = sanitizePlasticityProfile(profile);
  const signed = Math.tanh(Number.isFinite(payoff) ? payoff : 0);
  const multiplier = signed >= 0 ? plasticity.positiveRewardMultiplier : plasticity.negativeRewardMultiplier;
  return clamp(signed * multiplier, -1, 1);
}

export function applyFoodResolutionLearning(spawner: SpawnerAgent, traceId: number | undefined, payoff: number) {
  if (traceId === undefined) return false;
  const signal = learningSignalFromPayoff(payoff, spawner.genome.plasticityProfile);
  const applied = applyLearningSignal(spawner, traceId, signal);
  delete spawner.traceStore.traces[String(traceId)];
  return applied;
}

export function applyReproductionLearning(spawner: SpawnerAgent, traceId: number | undefined) {
  if (traceId === undefined) return false;
  const plasticity = sanitizePlasticityProfile(spawner.genome.plasticityProfile);
  const signal = plasticity.reproductionRewardStrength;
  const applied = applyLearningSignal(spawner, traceId, signal, {
    reproduction: true,
    extraOutputBiasIndex: OUTPUT_INDEX.reproduce,
    skipActionOutputBias: true,
  });
  if (applied) spawner.learnedState.reproductionLearningCount += 1;
  return applied;
}

export function applyLearningSignal(
  spawner: SpawnerAgent,
  traceId: number,
  signal: number,
  options: { reproduction?: boolean; extraOutputBiasIndex?: number; skipActionOutputBias?: boolean } = {},
) {
  const plasticity = sanitizePlasticityProfile(spawner.genome.plasticityProfile);
  const boundedSignal = clamp(Number.isFinite(signal) ? signal : 0, -1, 1);
  if (boundedSignal === 0 || (plasticity.weightLearningRate === 0 && plasticity.biasLearningRate === 0)) {
    spawner.learnedState.recentLearningSignal = boundedSignal;
    return false;
  }

  const trace = spawner.traceStore?.traces?.[String(traceId)];
  if (!trace) return false;

  const plan = ensureCompiledBrainPlan(spawner.genome);
  const eligibility = plasticity.eligibilityTraceStrength;
  const weightRate = plasticity.weightLearningRate * boundedSignal * eligibility;
  const biasRate = plasticity.biasLearningRate * boundedSignal * eligibility;
  let changed = false;

  for (let traceIndex = 0; traceIndex < trace.activeConnectionIds.length; traceIndex += 1) {
    const innovationId = trace.activeConnectionIds[traceIndex];
    if (innovationId === undefined) continue;
    const connection = activeConnectionForInnovation(plan, innovationId);
    if (!connection) continue;
    const activation = traceConnectionActivation(trace, innovationId, traceIndex);
    if (!activation) continue;
    changed =
      addDelta(
        spawner.learnedState.connectionDeltas,
        connectionDeltaKey(innovationId),
        weightRate * activation.source * activation.target,
        plasticity.maxLearnedDelta,
      ) || changed;
    if (connection.target.kind === "hidden") {
      changed =
        addDelta(
          spawner.learnedState.gateBiasDeltas,
          gateBiasDeltaKey(connection.target.unitId, connection.target.gate),
          biasRate * activation.target,
          plasticity.maxLearnedDelta,
        ) || changed;
    } else {
      changed =
        addDelta(
          spawner.learnedState.outputBiasDeltas,
          outputBiasDeltaKey(connection.target.index),
          biasRate * activation.target,
          plasticity.maxLearnedDelta,
        ) || changed;
    }
  }

  if (options.extraOutputBiasIndex !== undefined) {
    changed =
      addDelta(spawner.learnedState.outputBiasDeltas, outputBiasDeltaKey(options.extraOutputBiasIndex), biasRate, plasticity.maxLearnedDelta) ||
      changed;
  }
  if (!options.skipActionOutputBias) {
    changed = applyActionOutputBias(spawner, trace, biasRate, plasticity.maxLearnedDelta) || changed;
  }

  spawner.learnedState.recentLearningSignal = boundedSignal;
  if (!changed) return false;
  spawner.learnedState.learningUpdateCount += 1;
  spawner.learnedState = clampLearnedState(spawner.learnedState, plasticity);
  return true;
}

export function pruneDecisionTraces(spawner: SpawnerAgent, currentTick: number, maxAgeTicks: number) {
  const store = spawner.traceStore ?? createEmptyTraceStore();
  const cutoff = currentTick - Math.max(1, Math.round(maxAgeTicks));
  for (const [key, trace] of Object.entries(store.traces)) {
    if (trace.tick < cutoff) delete store.traces[key];
  }
  spawner.traceStore = store;
}

function applyActionOutputBias(spawner: SpawnerAgent, trace: SpawnerDecisionTrace, amount: number, cap: number) {
  let changed = false;
  if (trace.action === "long") changed = addDelta(spawner.learnedState.outputBiasDeltas, outputBiasDeltaKey(OUTPUT_INDEX.long), amount, cap) || changed;
  if (trace.action === "short") changed = addDelta(spawner.learnedState.outputBiasDeltas, outputBiasDeltaKey(OUTPUT_INDEX.short), amount, cap) || changed;
  return addDelta(spawner.learnedState.outputBiasDeltas, outputBiasDeltaKey(OUTPUT_INDEX.strength), amount * trace.strength, cap) || changed;
}

function copyConnectionActivations(evaluationActivations: BrainEvaluation["connectionActivations"], activeConnectionIds?: number[]) {
  const activations: SpawnerDecisionTrace["connectionActivations"] = {};
  if (activeConnectionIds) {
    for (const innovationId of activeConnectionIds) {
      const activation = evaluationActivations[String(innovationId)];
      if (activation) activations[String(innovationId)] = { source: activation.source, target: activation.target };
    }
    return activations;
  }
  for (const [innovationId, activation] of Object.entries(evaluationActivations)) {
    activations[innovationId] = { source: activation.source, target: activation.target };
  }
  return activations;
}

function addDelta(map: Record<string, number>, key: string, delta: number, cap: number) {
  if (!Number.isFinite(delta) || delta === 0) return false;
  const previous = map[key] ?? 0;
  const next = clamp((map[key] ?? 0) + delta, -cap, cap);
  if (next === previous) return false;
  if (next === 0) {
    delete map[key];
  } else {
    map[key] = next;
  }
  return true;
}
