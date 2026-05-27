import { OUTPUT_COUNT } from "./config";
import { createEffectiveBrainValues, type EffectiveBrainValues, type EffectiveGenomeView } from "./effectiveGenome";
import { compileBrainPlan, ensureCompiledBrainPlan, type CompiledBrainPlan, type CompiledBrainUnit } from "./brainPlan";
import { alignedHiddenStateRecord, hiddenArrayToCurrentRecord, hiddenRecordToArray, type HiddenStateArray } from "./brainState";
import { sigmoid } from "./math";
import type { ConnectionGene, GateType, HiddenUnitGene, SpawnerAgent, SpawnerGenome, SpawnerLearnedState } from "./types";

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

export type BrainEvaluationOptions = {
  plan?: CompiledBrainPlan;
  useCachedPlan?: boolean;
  includeActivations?: boolean;
  includePreviousState?: boolean;
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
};

export function evaluateSpawnerBrain(
  spawner: SpawnerAgent,
  inputs: number[],
  effectiveGenome?: EffectiveGenomeView,
  options: BrainEvaluationOptions = {},
): BrainEvaluation {
  alignHiddenState(spawner);
  const effectiveValues = effectiveGenome ?? createEffectiveBrainValues(spawner.genome, spawner.learnedState, { assumeNormalizedLearnedState: true });
  return evaluateBrainKernel({
    genome: effectiveValues.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    plan: options.plan,
    useCachedPlan: options.useCachedPlan,
    includeActivations: options.includeActivations,
    includePreviousState: options.includePreviousState,
    effectiveValues,
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
    effectiveValues: createEffectiveBrainValues(genome, learnedState),
  });
}

function evaluateBrainKernel({
  genome,
  hiddenState,
  inputs,
  plan: providedPlan,
  useCachedPlan,
  includeActivations = true,
  includePreviousState = true,
  effectiveValues,
}: PureBrainEvaluationInput & { effectiveValues: EffectiveBrainValues }): BrainEvaluation {
  const connectionActivations: BrainEvaluation["connectionActivations"] | undefined = includeActivations ? {} : undefined;
  const plan = providedPlan ?? (useCachedPlan === false ? compileBrainPlan(effectiveValues.genome) : ensureCompiledBrainPlan(effectiveValues.genome));
  const previousArray = hiddenRecordToArray(plan, hiddenState);
  const currentArray = new Array(plan.unitIds.length).fill(0);

  evaluateHiddenLayers({ plan, inputs, previousState: previousArray, currentState: currentArray, effectiveValues, connectionActivations });
  const outputs = evaluateOutputs({ plan, inputs, previousState: previousArray, currentState: currentArray, effectiveValues, connectionActivations });

  return {
    outputs,
    previousState: includePreviousState ? alignedHiddenState(genome, hiddenState) : {},
    currentState: hiddenArrayToCurrentRecord(plan, currentArray),
    activeConnectionIds: includeActivations ? [...plan.activeConnectionIds] : [],
    connectionActivations: connectionActivations ?? {},
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

function evaluateHiddenLayers({
  plan,
  inputs,
  previousState,
  currentState,
  effectiveValues,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined;
}) {
  for (const layer of plan.layers) {
    for (const unitPlan of layer.units) evaluateHiddenUnit({ unitPlan, plan, inputs, previousState, currentState, effectiveValues, connectionActivations });
  }
}

function evaluateHiddenUnit({
  unitPlan,
  plan,
  inputs,
  previousState,
  currentState,
  effectiveValues,
  connectionActivations,
}: {
  unitPlan: CompiledBrainUnit;
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined;
}) {
  const unit = unitPlan.unit;
  const update = sigmoid(evaluateGateSum(unit, "update", unitPlan.updateInputs, plan, inputs, previousState, currentState, effectiveValues, connectionActivations));
  const reset = sigmoid(evaluateGateSum(unit, "reset", unitPlan.resetInputs, plan, inputs, previousState, currentState, effectiveValues, connectionActivations));
  const candidate = Math.tanh(
    evaluateGateSum(unit, "candidate", unitPlan.candidateInputs, plan, inputs, previousState, currentState, effectiveValues, connectionActivations, reset),
  );
  currentState[unitPlan.unitIndex] = (1 - update) * (previousState[unitPlan.unitIndex] ?? 0) + update * candidate;
}

function evaluateOutputs({
  plan,
  inputs,
  previousState,
  currentState,
  effectiveValues,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  effectiveValues: EffectiveBrainValues;
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined;
}) {
  return Array.from({ length: OUTPUT_COUNT }, (_, outputIndex) => {
    const outputConnections = plan.outputInputs[outputIndex] ?? [];
    let output = effectiveValues.getOutputBias(outputIndex);
    for (const connection of outputConnections) {
      output += effectiveValues.getConnectionWeight(connection) * sourceValue(connection, plan, inputs, previousState, currentState);
    }
    if (connectionActivations) {
      for (const connection of outputConnections) {
        recordConnectionActivation(connectionActivations, connection, sourceValue(connection, plan, inputs, previousState, currentState), output);
      }
    }
    return output;
  });
}

function evaluateGateSum(
  unit: HiddenUnitGene,
  gate: GateType,
  connections: ConnectionGene[],
  plan: CompiledBrainPlan,
  inputs: number[],
  previousState: HiddenStateArray,
  currentState: HiddenStateArray,
  effectiveValues: EffectiveBrainValues,
  connectionActivations: BrainEvaluation["connectionActivations"] | undefined,
  reset = 1,
) {
  let sum = effectiveValues.getGateBias(unit, gate);
  for (const connection of connections) {
    const value = sourceValue(connection, plan, inputs, previousState, currentState);
    const gatedValue = gate === "candidate" && connection.source.kind === "hidden" && connection.source.mode === "previous" ? value * reset : value;
    sum += effectiveValues.getConnectionWeight(connection) * gatedValue;
  }
  const target = gate === "candidate" ? Math.tanh(sum) : sigmoid(sum);
  if (connectionActivations) {
    for (const connection of connections) {
      const value = sourceValue(connection, plan, inputs, previousState, currentState);
      const gatedValue = gate === "candidate" && connection.source.kind === "hidden" && connection.source.mode === "previous" ? value * reset : value;
      recordConnectionActivation(connectionActivations, connection, gatedValue, target);
    }
  }
  return sum;
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
  connection: ConnectionGene,
  plan: CompiledBrainPlan,
  inputs: number[],
  previousState: HiddenStateArray,
  currentState: HiddenStateArray,
) {
  const source = connection.source;
  if (source.kind === "input") return inputs[source.index] ?? 0;
  const unitIndex = plan.unitIndexById.get(source.unitId);
  if (unitIndex === undefined) return 0;
  if (source.mode === "previous") return previousState[unitIndex] ?? 0;
  return currentState[unitIndex] ?? 0;
}
