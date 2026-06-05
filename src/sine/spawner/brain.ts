import { OUTPUT_COUNT } from "./config";
import {
  createPlanAlignedEffectiveBrainValues,
  isPlanAlignedEffectiveBrainValues,
  type EffectiveBrainValues,
  type EffectiveGenomeView,
  type PlanAlignedEffectiveBrainValues,
} from "./effectiveGenome";
import { compileBrainPlan, ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import { evaluateCompactBrainKernel, type BrainKernelCompactActivationRecorder } from "./brainKernel";
import { alignedHiddenStateRecord, hiddenArrayToCurrentRecord, hiddenRecordToArray, type HiddenStateArray } from "./brainState";
import type { PlanAlignedLearnedStateView } from "./learnedStateView";
import type { SpawnerAgent, SpawnerGenome, SpawnerLearnedState } from "./types";

export function forwardSpawner(spawner: SpawnerAgent, inputs: number[]) {
  const evaluation = evaluateSpawnerBrain(spawner, inputs);
  applyBrainEvaluation(spawner, evaluation);
  return evaluation.outputs;
}

export type BrainEvaluation = {
  outputs: number[];
  previousState: Record<number, number>;
  currentState: Record<number, number>;
  activeConnectionIds: number[];
  connectionActivations: Record<string, { source: number; target: number }>;
};

export type BrainTraceActivations = {
  activeConnectionIds: number[];
  connectionActivations: BrainEvaluation["connectionActivations"];
  connectionActivationSources?: number[];
  connectionActivationTargets?: number[];
  owned: boolean;
};

export type BrainRuntimeEvaluation = {
  outputs: number[];
  inputs: number[];
  previousStateArray: HiddenStateArray;
  currentStateArray: HiddenStateArray;
  plan: CompiledBrainPlan;
  effectiveValues: EffectiveBrainValues;
  planValues: PlanAlignedEffectiveBrainValues | undefined;
  activeConnectionIds?: number[];
  connectionActivations?: BrainEvaluation["connectionActivations"];
};

const runtimeByEvaluation = new WeakMap<BrainEvaluation, BrainRuntimeEvaluation>();

export type BrainEvaluationOptions = {
  plan?: CompiledBrainPlan;
  useCachedPlan?: boolean;
  includeActivations?: boolean;
  includePreviousState?: boolean;
  instrumentation?: BrainEvaluationInstrumentation;
};

export type BrainEvaluationInstrumentation = {
  recordBrainPhase(phase: string, ms: number, count?: number): void;
};

export type PureBrainEvaluationInput = {
  genome: SpawnerGenome;
  learnedState?: Partial<SpawnerLearnedState>;
  learnedStateView?: PlanAlignedLearnedStateView;
  hiddenState: Record<number, number>;
  inputs: number[];
  plan?: CompiledBrainPlan;
  useCachedPlan?: boolean;
  includeActivations?: boolean;
  includePreviousState?: boolean;
  instrumentation?: BrainEvaluationInstrumentation;
};

export type BrainEvaluationRuntimeArraysInput = {
  genome: SpawnerGenome;
  learnedState?: Partial<SpawnerLearnedState>;
  learnedStateView?: PlanAlignedLearnedStateView;
  hiddenState: Record<number, number>;
  inputs: number[];
  plan: CompiledBrainPlan;
  outputs: number[];
  previousStateArray: number[];
  currentStateArray: number[];
  includeActivations?: boolean;
  includePreviousState?: boolean;
  activeConnectionIds?: number[];
  connectionActivations?: BrainEvaluation["connectionActivations"];
};

export function evaluateSpawnerBrain(
  spawner: SpawnerAgent,
  inputs: number[],
  effectiveGenome?: EffectiveGenomeView,
  options: BrainEvaluationOptions = {},
): BrainEvaluation {
  alignHiddenState(spawner);
  return evaluateBrainKernel({
    genome: effectiveGenome?.genome ?? spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    plan: options.plan,
    useCachedPlan: options.useCachedPlan,
    includeActivations: options.includeActivations,
    includePreviousState: options.includePreviousState,
    effectiveValues: effectiveGenome,
    assumeNormalizedLearnedState: true,
    instrumentation: options.instrumentation,
  });
}

export function evaluateSpawnerBrainPure({
  genome,
  learnedState,
  learnedStateView,
  hiddenState,
  inputs,
  plan,
  useCachedPlan,
  includeActivations,
  includePreviousState,
  instrumentation,
}: PureBrainEvaluationInput): BrainEvaluation {
  return evaluateBrainKernel({
    genome,
    learnedState,
    learnedStateView,
    hiddenState,
    inputs,
    plan,
    useCachedPlan,
    includeActivations,
    includePreviousState,
    instrumentation,
  });
}

export function materializeBrainEvaluationFromRuntimeArrays({
  genome,
  learnedState,
  hiddenState,
  inputs,
  plan,
  outputs,
  previousStateArray,
  currentStateArray,
  includeActivations = true,
  includePreviousState = true,
  activeConnectionIds,
  connectionActivations,
}: BrainEvaluationRuntimeArraysInput): BrainEvaluation {
  const effectiveValues = createPlanAlignedEffectiveBrainValues(genome, learnedState, plan);
  const runtime: BrainRuntimeEvaluation = {
    outputs,
    inputs,
    previousStateArray: [...previousStateArray],
    currentStateArray: [...currentStateArray],
    plan,
    effectiveValues,
    planValues: effectiveValues,
    activeConnectionIds,
    connectionActivations,
  };
  return materializeBrainEvaluation(runtime, genome, hiddenState, { includeActivations, includePreviousState });
}

export function evaluateSpawnerBrainRuntime(input: PureBrainEvaluationInput): BrainRuntimeEvaluation {
  return evaluateBrainRuntime({
    genome: input.genome,
    learnedState: input.learnedState,
    learnedStateView: input.learnedStateView,
    hiddenState: input.hiddenState,
    inputs: input.inputs,
    plan: input.plan,
    useCachedPlan: input.useCachedPlan,
    includeActivations: input.includeActivations,
    instrumentation: input.instrumentation,
  });
}

export function materializeBrainRuntimeEvaluation(
  runtime: BrainRuntimeEvaluation,
  genome: SpawnerGenome,
  hiddenState: Record<number, number>,
  options: Pick<BrainEvaluationOptions, "includeActivations" | "includePreviousState"> = {},
): BrainEvaluation {
  return materializeBrainEvaluation(runtime, genome, hiddenState, options);
}

function evaluateBrainKernel({
  genome,
  learnedState,
  learnedStateView,
  hiddenState,
  inputs,
  plan: providedPlan,
  useCachedPlan,
  includeActivations = true,
  includePreviousState = true,
  effectiveValues,
  assumeNormalizedLearnedState,
  instrumentation,
}: PureBrainEvaluationInput & { effectiveValues?: EffectiveBrainValues; assumeNormalizedLearnedState?: boolean }): BrainEvaluation {
  const runtime = timeBrain(instrumentation, "runtimeEvaluation", () => evaluateBrainRuntime({
    genome,
    learnedState,
    learnedStateView,
    hiddenState,
    inputs,
    plan: providedPlan,
    useCachedPlan,
    includeActivations,
    effectiveValues,
    assumeNormalizedLearnedState,
    instrumentation,
  }));
  return timeBrain(instrumentation, "publicDtoMaterialization", () => materializeBrainEvaluation(runtime, genome, hiddenState, { includeActivations, includePreviousState }));
}

function evaluateBrainRuntime({
  genome,
  learnedState,
  learnedStateView,
  hiddenState,
  inputs,
  plan: providedPlan,
  useCachedPlan,
  includeActivations = true,
  effectiveValues,
  assumeNormalizedLearnedState,
  instrumentation,
}: Omit<PureBrainEvaluationInput, "includePreviousState"> & {
  effectiveValues?: EffectiveBrainValues;
  assumeNormalizedLearnedState?: boolean;
}): BrainRuntimeEvaluation {
  const connectionActivations: BrainEvaluation["connectionActivations"] | undefined = includeActivations
    ? timeBrain(instrumentation, "activationMapAllocation", () => ({}))
    : undefined;
  const plan = timeBrain(instrumentation, providedPlan ? "providedPlanUse" : useCachedPlan === false ? "freshPlanCompile" : "cachedPlanLookup", () =>
    providedPlan ?? (useCachedPlan === false ? compileBrainPlan(genome) : ensureCompiledBrainPlan(genome)),
  );
  const runtimeValues = timeBrain(instrumentation, "effectiveValueArrayConstruction", () =>
    effectiveValues ?? createPlanAlignedEffectiveBrainValues(genome, learnedStateView ?? learnedState, plan, { assumeNormalizedLearnedState }),
  );
  const planValues = timeBrain(instrumentation, "effectiveValuePlanAlignmentCheck", () =>
    isPlanAlignedEffectiveBrainValues(runtimeValues) && runtimeValues.planSignature === plan.signature ? runtimeValues : undefined,
  );
  const previousArray = timeBrain(instrumentation, "hiddenRecordToArray", () => hiddenRecordToArray(plan, hiddenState), plan.unitIds.length);
  const currentArray = timeBrain(instrumentation, "currentStateArrayAllocation", () => new Array<number>(plan.unitIds.length), plan.unitIds.length);
  const outputs = timeBrain(instrumentation, "outputArrayAllocation", () => new Array<number>(OUTPUT_COUNT), OUTPUT_COUNT);

  timeBrain(instrumentation, "compactBrainKernel", () =>
    evaluateCompactBrainKernel({
      plan,
      inputs,
      previousState: previousArray,
      currentState: currentArray,
      outputs,
      effectiveValues: runtimeValues,
      planValues,
      connectionActivations,
    }),
  );

  return {
    outputs,
    inputs,
    previousStateArray: previousArray,
    currentStateArray: currentArray,
    plan,
    effectiveValues: runtimeValues,
    planValues,
    activeConnectionIds: includeActivations ? plan.activeConnectionIds : undefined,
    connectionActivations,
  };
}

function timeBrain<T>(instrumentation: BrainEvaluationInstrumentation | undefined, phase: string, read: () => T, count?: number): T {
  if (!instrumentation) return read();
  const started = performance.now();
  try {
    return read();
  } finally {
    instrumentation.recordBrainPhase(phase, performance.now() - started, count);
  }
}

function materializeBrainEvaluation(
  runtime: BrainRuntimeEvaluation,
  genome: SpawnerGenome,
  hiddenState: Record<number, number>,
  {
    includeActivations = true,
    includePreviousState = true,
  }: Pick<BrainEvaluationOptions, "includeActivations" | "includePreviousState">,
): BrainEvaluation {
  const activations = includeActivations
    ? runtime.connectionActivations
      ? { activeConnectionIds: runtime.activeConnectionIds ?? runtime.plan.activeConnectionIds, connectionActivations: runtime.connectionActivations }
      : materializeBrainRuntimeTraceActivations(runtime)
    : undefined;
  const evaluation = {
    outputs: runtime.outputs,
    previousState: includePreviousState ? alignedHiddenState(genome, hiddenState) : {},
    currentState: hiddenArrayToCurrentRecord(runtime.plan, runtime.currentStateArray),
    activeConnectionIds: activations ? [...activations.activeConnectionIds] : [],
    connectionActivations: activations ? activations.connectionActivations : {},
  };
  if (!includeActivations) runtimeByEvaluation.set(evaluation, runtime);
  return evaluation;
}

export function materializeBrainEvaluationActivations(evaluation: BrainEvaluation): BrainEvaluation | undefined {
  if (evaluation.activeConnectionIds.length > 0) return evaluation;
  const activations = materializeBrainEvaluationTraceActivations(evaluation);
  if (!activations) return undefined;
  const runtime = runtimeByEvaluation.get(evaluation);
  const activated = {
    outputs: evaluation.outputs,
    previousState: evaluation.previousState,
    currentState: evaluation.currentState,
    activeConnectionIds: [...activations.activeConnectionIds],
    connectionActivations: activations.connectionActivations,
  };
  if (runtime) runtimeByEvaluation.set(activated, { ...runtime, activeConnectionIds: activations.activeConnectionIds, connectionActivations: activations.connectionActivations });
  return activated;
}

export function materializeBrainEvaluationTraceActivations(evaluation: BrainEvaluation): BrainTraceActivations | undefined {
  if (evaluation.activeConnectionIds.length > 0) {
    return {
      activeConnectionIds: evaluation.activeConnectionIds,
      connectionActivations: evaluation.connectionActivations,
      owned: false,
    };
  }
  const runtime = runtimeByEvaluation.get(evaluation);
  if (!runtime) return undefined;
  return materializeBrainRuntimeTraceActivations(runtime);
}

export function materializeBrainRuntimeTraceActivations(runtime: BrainRuntimeEvaluation): BrainTraceActivations {
  const connectionActivations: BrainEvaluation["connectionActivations"] = {};
  const replayCurrentState = new Array<number>(runtime.plan.unitIds.length);
  const replayOutputs = new Array<number>(OUTPUT_COUNT);
  evaluateCompactBrainKernel({
    plan: runtime.plan,
    inputs: runtime.inputs,
    previousState: runtime.previousStateArray,
    currentState: replayCurrentState,
    outputs: replayOutputs,
    effectiveValues: runtime.effectiveValues,
    planValues: runtime.planValues,
    connectionActivations,
  });
  return {
    activeConnectionIds: [...runtime.plan.activeConnectionIds],
    connectionActivations,
    owned: true,
  };
}

export function materializeBrainRuntimeCompactTraceActivations(runtime: BrainRuntimeEvaluation): BrainTraceActivations {
  const compactActivations: BrainKernelCompactActivationRecorder = {
    kind: "compact",
    sourceByConnectionIndex: new Array<number>(runtime.plan.activeConnectionCount),
    targetByConnectionIndex: new Array<number>(runtime.plan.activeConnectionCount),
  };
  const replayCurrentState = new Array<number>(runtime.plan.unitIds.length);
  const replayOutputs = new Array<number>(OUTPUT_COUNT);
  evaluateCompactBrainKernel({
    plan: runtime.plan,
    inputs: runtime.inputs,
    previousState: runtime.previousStateArray,
    currentState: replayCurrentState,
    outputs: replayOutputs,
    effectiveValues: runtime.effectiveValues,
    planValues: runtime.planValues,
    connectionActivations: compactActivations,
  });
  return {
    activeConnectionIds: [...runtime.plan.activeConnectionIds],
    connectionActivations: {},
    connectionActivationSources: compactActivations.sourceByConnectionIndex,
    connectionActivationTargets: compactActivations.targetByConnectionIndex,
    owned: true,
  };
}

export function applyBrainEvaluation(spawner: SpawnerAgent, evaluation: BrainEvaluation) {
  spawner.hiddenState = { ...evaluation.previousState, ...evaluation.currentState };
  alignHiddenState(spawner);
}

export function alignHiddenState(spawner: SpawnerAgent) {
  spawner.hiddenState = alignedHiddenState(spawner.genome, spawner.hiddenState);
}

export function alignedHiddenState(genome: Pick<SpawnerGenome, "units">, hiddenState: Record<number, number>) {
  return alignedHiddenStateRecord(genome, hiddenState);
}
