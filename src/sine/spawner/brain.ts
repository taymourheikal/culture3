import { OUTPUT_COUNT } from "./config";
import {
  createPlanAlignedEffectiveBrainValues,
  isPlanAlignedEffectiveBrainValues,
  type EffectiveBrainValues,
  type EffectiveGenomeView,
  type PlanAlignedEffectiveBrainValues,
} from "./effectiveGenome";
import { compileBrainPlan, ensureCompiledBrainPlan, type CompiledBrainConnection, type CompiledBrainPlan, type CompiledBrainUnit } from "./brainPlan";
import { alignedHiddenStateRecord, hiddenArrayToCurrentRecord, hiddenRecordToArray, type HiddenStateArray } from "./brainState";
import { sigmoid } from "./math";
import type { ConnectionGene, GateType, SpawnerAgent, SpawnerGenome, SpawnerLearnedState } from "./types";

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
  owned: boolean;
};

type RuntimeBrainEvaluation = {
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

const runtimeByEvaluation = new WeakMap<BrainEvaluation, RuntimeBrainEvaluation>();

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
  const runtime: RuntimeBrainEvaluation = {
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

function evaluateBrainKernel({
  genome,
  learnedState,
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
}): RuntimeBrainEvaluation {
  const connectionActivations: BrainEvaluation["connectionActivations"] | undefined = includeActivations
    ? timeBrain(instrumentation, "activationMapAllocation", () => ({}))
    : undefined;
  const plan = timeBrain(instrumentation, providedPlan ? "providedPlanUse" : useCachedPlan === false ? "freshPlanCompile" : "cachedPlanLookup", () =>
    providedPlan ?? (useCachedPlan === false ? compileBrainPlan(genome) : ensureCompiledBrainPlan(genome)),
  );
  const runtimeValues = timeBrain(instrumentation, "effectiveValueArrayConstruction", () =>
    effectiveValues ?? createPlanAlignedEffectiveBrainValues(genome, learnedState, plan, { assumeNormalizedLearnedState }),
  );
  const planValues = timeBrain(instrumentation, "effectiveValuePlanAlignmentCheck", () =>
    isPlanAlignedEffectiveBrainValues(runtimeValues) && runtimeValues.planSignature === plan.signature ? runtimeValues : undefined,
  );
  const previousArray = timeBrain(instrumentation, "hiddenRecordToArray", () => hiddenRecordToArray(plan, hiddenState), plan.unitIds.length);
  const currentArray = timeBrain(instrumentation, "currentStateArrayAllocation", () => new Array<number>(plan.unitIds.length), plan.unitIds.length);

  timeBrain(instrumentation, "hiddenLayerMath", () =>
    evaluateHiddenLayers({ plan, inputs, previousState: previousArray, currentState: currentArray, effectiveValues: runtimeValues, planValues, connectionActivations }),
  );
  const outputs = timeBrain(instrumentation, "outputMathAndArrayAllocation", () =>
    evaluateOutputs({ plan, inputs, previousState: previousArray, currentState: currentArray, effectiveValues: runtimeValues, planValues, connectionActivations }),
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
  runtime: RuntimeBrainEvaluation,
  genome: SpawnerGenome,
  hiddenState: Record<number, number>,
  {
    includeActivations = true,
    includePreviousState = true,
  }: Pick<BrainEvaluationOptions, "includeActivations" | "includePreviousState">,
): BrainEvaluation {
  const evaluation = {
    outputs: runtime.outputs,
    previousState: includePreviousState ? alignedHiddenState(genome, hiddenState) : {},
    currentState: hiddenArrayToCurrentRecord(runtime.plan, runtime.currentStateArray),
    activeConnectionIds: includeActivations ? [...(runtime.activeConnectionIds ?? runtime.plan.activeConnectionIds)] : [],
    connectionActivations: includeActivations ? runtime.connectionActivations ?? {} : {},
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
  const connectionActivations: BrainEvaluation["connectionActivations"] = {};
  const replayCurrentState = recordHiddenLayerActivations({
    plan: runtime.plan,
    inputs: runtime.inputs,
    previousState: runtime.previousStateArray,
    effectiveValues: runtime.effectiveValues,
    planValues: runtime.planValues,
    connectionActivations,
  });
  recordOutputActivations({
    plan: runtime.plan,
    inputs: runtime.inputs,
    previousState: runtime.previousStateArray,
    currentState: replayCurrentState,
    outputs: runtime.outputs,
    connectionActivations,
  });
  return {
    activeConnectionIds: [...runtime.plan.activeConnectionIds],
    connectionActivations,
    owned: true,
  };
}

function recordHiddenLayerActivations({
  plan,
  inputs,
  previousState,
  effectiveValues,
  planValues,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  planValues: PlanAlignedEffectiveBrainValues | undefined;
  connectionActivations: BrainEvaluation["connectionActivations"];
}) {
  const currentState = new Array<number>(plan.unitIds.length);
  for (const layer of plan.layers) {
    for (const unitPlan of layer.units) {
      evaluateHiddenUnit({ unitPlan, inputs, previousState, currentState, effectiveValues, planValues, connectionActivations });
    }
  }
  return currentState;
}

function recordOutputActivations({
  plan,
  inputs,
  previousState,
  currentState,
  outputs,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  outputs: number[];
  connectionActivations: BrainEvaluation["connectionActivations"];
}) {
  for (let outputIndex = 0; outputIndex < OUTPUT_COUNT; outputIndex += 1) {
    const outputConnections = plan.outputInputRefs[outputIndex] ?? [];
    const output = outputs[outputIndex] ?? 0;
    for (const connectionRef of outputConnections) {
      recordConnectionActivation(connectionActivations, connectionRef.connection, sourceValue(connectionRef, inputs, previousState, currentState), output);
    }
  }
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

function evaluateHiddenLayers({
  plan,
  inputs,
  previousState,
  currentState,
  effectiveValues,
  planValues,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  planValues: PlanAlignedEffectiveBrainValues | undefined;
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined;
}) {
  for (const layer of plan.layers) {
    for (const unitPlan of layer.units) {
      evaluateHiddenUnit({ unitPlan, inputs, previousState, currentState, effectiveValues, planValues, connectionActivations });
    }
  }
}

function evaluateHiddenUnit({
  unitPlan,
  inputs,
  previousState,
  currentState,
  effectiveValues,
  planValues,
  connectionActivations,
}: {
  unitPlan: CompiledBrainUnit;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  planValues: PlanAlignedEffectiveBrainValues | undefined;
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined;
}) {
  const update = sigmoid(evaluateGateSum(unitPlan, "update", unitPlan.updateInputRefs, inputs, previousState, currentState, effectiveValues, planValues, connectionActivations));
  const reset = sigmoid(evaluateGateSum(unitPlan, "reset", unitPlan.resetInputRefs, inputs, previousState, currentState, effectiveValues, planValues, connectionActivations));
  const candidate = Math.tanh(
    evaluateGateSum(unitPlan, "candidate", unitPlan.candidateInputRefs, inputs, previousState, currentState, effectiveValues, planValues, connectionActivations, reset),
  );
  currentState[unitPlan.unitIndex] = (1 - update) * (previousState[unitPlan.unitIndex] ?? 0) + update * candidate;
}

function evaluateOutputs({
  plan,
  inputs,
  previousState,
  currentState,
  effectiveValues,
  planValues,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  planValues: PlanAlignedEffectiveBrainValues | undefined;
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined;
}) {
  const outputs = new Array<number>(OUTPUT_COUNT);
  for (let outputIndex = 0; outputIndex < OUTPUT_COUNT; outputIndex += 1) {
    const outputConnections = plan.outputInputRefs[outputIndex] ?? [];
    let output = planValues?.outputBiases[outputIndex] ?? effectiveValues.getOutputBias(outputIndex);
    for (const connectionRef of outputConnections) {
      output += connectionWeight(connectionRef, effectiveValues, planValues) * sourceValue(connectionRef, inputs, previousState, currentState);
    }
    if (connectionActivations) {
      for (const connectionRef of outputConnections) {
        recordConnectionActivation(connectionActivations, connectionRef.connection, sourceValue(connectionRef, inputs, previousState, currentState), output);
      }
    }
    outputs[outputIndex] = output;
  }
  return outputs;
}

function evaluateGateSum(
  unitPlan: CompiledBrainUnit,
  gate: GateType,
  connections: CompiledBrainConnection[],
  inputs: number[],
  previousState: HiddenStateArray,
  currentState: HiddenStateArray,
  effectiveValues: EffectiveBrainValues,
  planValues: PlanAlignedEffectiveBrainValues | undefined,
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined,
  reset = 1,
) {
  let sum = gateBias(unitPlan, gate, effectiveValues, planValues);
  for (const connectionRef of connections) {
    const value = sourceValue(connectionRef, inputs, previousState, currentState);
    const gatedValue = gate === "candidate" && connectionRef.connection.source.kind === "hidden" && connectionRef.connection.source.mode === "previous" ? value * reset : value;
    sum += connectionWeight(connectionRef, effectiveValues, planValues) * gatedValue;
  }
  const target = gate === "candidate" ? Math.tanh(sum) : sigmoid(sum);
  if (connectionActivations) {
    for (const connectionRef of connections) {
      const value = sourceValue(connectionRef, inputs, previousState, currentState);
      const gatedValue = gate === "candidate" && connectionRef.connection.source.kind === "hidden" && connectionRef.connection.source.mode === "previous" ? value * reset : value;
      recordConnectionActivation(connectionActivations, connectionRef.connection, gatedValue, target);
    }
  }
  return sum;
}

function connectionWeight(
  connectionRef: CompiledBrainConnection,
  effectiveValues: EffectiveBrainValues,
  planValues: PlanAlignedEffectiveBrainValues | undefined,
) {
  if (planValues) return planValues.connectionWeightsByPlanIndex[connectionRef.connectionIndex] ?? 0;
  return effectiveValues.getConnectionWeight(connectionRef.connection);
}

function gateBias(unitPlan: CompiledBrainUnit, gate: GateType, effectiveValues: EffectiveBrainValues, planValues: PlanAlignedEffectiveBrainValues | undefined) {
  if (!planValues) return effectiveValues.getGateBias(unitPlan.unit, gate);
  return gate === "update"
    ? planValues.updateGateBiasesByUnitIndex[unitPlan.unitIndex] ?? 0
    : gate === "reset"
      ? planValues.resetGateBiasesByUnitIndex[unitPlan.unitIndex] ?? 0
      : planValues.candidateGateBiasesByUnitIndex[unitPlan.unitIndex] ?? 0;
}

function recordConnectionActivation(
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined,
  connection: ConnectionGene,
  source: number,
  target: number,
) {
  if (!connectionActivations) return;
  connectionActivations[String(connection.innovationId)] = { source, target };
}

function sourceValue(
  connectionRef: CompiledBrainConnection,
  inputs: number[],
  previousState: HiddenStateArray,
  currentState: HiddenStateArray,
) {
  const connection = connectionRef.connection;
  const source = connection.source;
  if (source.kind === "input") return inputs[source.index] ?? 0;
  const unitIndex = connectionRef.sourceUnitIndex;
  if (unitIndex === undefined) return 0;
  if (source.mode === "previous") return previousState[unitIndex] ?? 0;
  return currentState[unitIndex] ?? 0;
}
