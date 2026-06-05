import { type CompiledBrainConnection, type CompiledBrainPlan, type CompiledBrainUnit } from "./brainPlan";
import type { HiddenStateArray } from "./brainState";
import { OUTPUT_COUNT } from "./config";
import type { EffectiveBrainValues, PlanAlignedEffectiveBrainValues } from "./effectiveGenome";
import { sigmoid } from "./math";
import type { GateType } from "./types";

export type BrainKernelActivationMap = Record<string, { source: number; target: number }>;
export type BrainKernelCompactActivationRecorder = {
  kind: "compact";
  sourceByConnectionIndex: number[];
  targetByConnectionIndex: number[];
};
export type BrainKernelActivationRecorder = BrainKernelActivationMap | BrainKernelCompactActivationRecorder;

export type CompactBrainKernelInput = {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  outputs: number[];
  effectiveValues: EffectiveBrainValues;
  planValues?: PlanAlignedEffectiveBrainValues;
  connectionActivations?: BrainKernelActivationRecorder;
};

export function evaluateCompactBrainKernel({
  plan,
  inputs,
  previousState,
  currentState,
  outputs,
  effectiveValues,
  planValues,
  connectionActivations,
}: CompactBrainKernelInput) {
  currentState.length = plan.unitIds.length;
  outputs.length = OUTPUT_COUNT;
  evaluateHiddenLayers({ plan, inputs, previousState, currentState, effectiveValues, planValues, connectionActivations });
  evaluateOutputs({ plan, inputs, previousState, currentState, outputs, effectiveValues, planValues, connectionActivations });
  return { outputs, currentState };
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
  connectionActivations: BrainKernelActivationRecorder | undefined;
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
  connectionActivations: BrainKernelActivationRecorder | undefined;
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
  outputs,
  effectiveValues,
  planValues,
  connectionActivations,
}: {
  plan: CompiledBrainPlan;
  inputs: number[];
  previousState: HiddenStateArray;
  currentState: HiddenStateArray;
  outputs: number[];
  effectiveValues: EffectiveBrainValues;
  planValues: PlanAlignedEffectiveBrainValues | undefined;
  connectionActivations: BrainKernelActivationRecorder | undefined;
}) {
  for (let outputIndex = 0; outputIndex < OUTPUT_COUNT; outputIndex += 1) {
    const outputConnections = plan.outputInputRefs[outputIndex] ?? [];
    let output = planValues?.outputBiases[outputIndex] ?? effectiveValues.getOutputBias(outputIndex);
    for (const connectionRef of outputConnections) {
      output += connectionWeight(connectionRef, effectiveValues, planValues) * sourceValue(connectionRef, inputs, previousState, currentState);
    }
    if (connectionActivations) {
      for (const connectionRef of outputConnections) {
        recordConnectionActivation(connectionActivations, connectionRef, sourceValue(connectionRef, inputs, previousState, currentState), output);
      }
    }
    outputs[outputIndex] = output;
  }
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
  connectionActivations: BrainKernelActivationRecorder | undefined,
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
      recordConnectionActivation(connectionActivations, connectionRef, gatedValue, target);
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
  connectionActivations: BrainKernelActivationRecorder | undefined,
  connectionRef: CompiledBrainConnection,
  source: number,
  target: number,
) {
  if (!connectionActivations) return;
  if (isCompactActivationRecorder(connectionActivations)) {
    connectionActivations.sourceByConnectionIndex[connectionRef.connectionIndex] = source;
    connectionActivations.targetByConnectionIndex[connectionRef.connectionIndex] = target;
    return;
  }
  connectionActivations[String(connectionRef.connection.innovationId)] = { source, target };
}

function isCompactActivationRecorder(value: BrainKernelActivationRecorder): value is BrainKernelCompactActivationRecorder {
  return (value as BrainKernelCompactActivationRecorder).kind === "compact";
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
