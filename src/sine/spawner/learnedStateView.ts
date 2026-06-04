import type { CompiledBrainPlan } from "./brainPlan";
import { OUTPUT_COUNT } from "./config";
import {
  connectionDeltaKey,
  gateBiasDeltaKey,
  outputBiasDeltaKey,
  sanitizeLearnedState,
  type SpawnerLearnedState,
} from "./plasticity";
import type { GateType, SpawnerGenome } from "./types";

export type PlanAlignedLearnedStateView = {
  kind: "plan-aligned-learned-state";
  planSignature: string;
  connectionDeltasByPlanIndex: number[];
  outputBiasDeltas: number[];
  updateGateBiasDeltasByUnitIndex: number[];
  resetGateBiasDeltasByUnitIndex: number[];
  candidateGateBiasDeltasByUnitIndex: number[];
  recentLearningSignal: number;
  learningUpdateCount: number;
  reproductionLearningCount: number;
  activeConnectionDeltaCount: number;
  activeOutputBiasDeltaCount: number;
  activeGateBiasDeltaCount: number;
  activeDeltaCount: number;
};

export function createPlanAlignedLearnedStateView(
  genome: SpawnerGenome,
  learnedState: Partial<SpawnerLearnedState> | undefined,
  plan: CompiledBrainPlan,
  options: { assumeNormalizedLearnedState?: boolean } = {},
): PlanAlignedLearnedStateView {
  const normalized = options.assumeNormalizedLearnedState
    ? learnedState
    : sanitizeLearnedState(learnedState, genome.plasticityProfile?.maxLearnedDelta);
  const connectionDeltasByPlanIndex: number[] = [];
  const outputBiasDeltas: number[] = [];
  const updateGateBiasDeltasByUnitIndex: number[] = [];
  const resetGateBiasDeltasByUnitIndex: number[] = [];
  const candidateGateBiasDeltasByUnitIndex: number[] = [];

  let activeConnectionDeltaCount = 0;
  let activeOutputBiasDeltaCount = 0;
  let activeGateBiasDeltaCount = 0;

  for (const [key, value] of Object.entries(normalized?.connectionDeltas ?? {})) {
    const connectionIndex = plan.connectionIndexByInnovationId.get(Number(key));
    if (connectionIndex === undefined || value === 0) continue;
    connectionDeltasByPlanIndex[connectionIndex] = value;
    activeConnectionDeltaCount += 1;
  }

  for (const [key, value] of Object.entries(normalized?.outputBiasDeltas ?? {})) {
    const outputIndex = Number(key);
    if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex >= OUTPUT_COUNT || value === 0) continue;
    outputBiasDeltas[outputIndex] = value;
    activeOutputBiasDeltaCount += 1;
  }

  for (const [key, value] of Object.entries(normalized?.gateBiasDeltas ?? {})) {
    if (value === 0) continue;
    const parsed = parseGateBiasDeltaKey(key);
    if (!parsed) continue;
    const unitIndex = plan.unitIndexById.get(parsed.unitId);
    if (unitIndex === undefined) continue;
    if (parsed.gate === "update") updateGateBiasDeltasByUnitIndex[unitIndex] = value;
    else if (parsed.gate === "reset") resetGateBiasDeltasByUnitIndex[unitIndex] = value;
    else candidateGateBiasDeltasByUnitIndex[unitIndex] = value;
    activeGateBiasDeltaCount += 1;
  }

  return {
    kind: "plan-aligned-learned-state",
    planSignature: plan.signature,
    connectionDeltasByPlanIndex,
    outputBiasDeltas,
    updateGateBiasDeltasByUnitIndex,
    resetGateBiasDeltasByUnitIndex,
    candidateGateBiasDeltasByUnitIndex,
    recentLearningSignal: finiteOr(normalized?.recentLearningSignal, 0),
    learningUpdateCount: nonNegativeInteger(normalized?.learningUpdateCount),
    reproductionLearningCount: nonNegativeInteger(normalized?.reproductionLearningCount),
    activeConnectionDeltaCount,
    activeOutputBiasDeltaCount,
    activeGateBiasDeltaCount,
    activeDeltaCount: activeConnectionDeltaCount + activeOutputBiasDeltaCount + activeGateBiasDeltaCount,
  };
}

export function isPlanAlignedLearnedStateView(value: unknown): value is PlanAlignedLearnedStateView {
  return (value as PlanAlignedLearnedStateView | undefined)?.kind === "plan-aligned-learned-state";
}

export function materializePlanAlignedLearnedStateView(
  view: PlanAlignedLearnedStateView,
  plan: CompiledBrainPlan,
): SpawnerLearnedState {
  const learnedState: SpawnerLearnedState = {
    connectionDeltas: {},
    outputBiasDeltas: {},
    gateBiasDeltas: {},
    recentLearningSignal: view.recentLearningSignal,
    learningUpdateCount: view.learningUpdateCount,
    reproductionLearningCount: view.reproductionLearningCount,
  };
  for (let index = 0; index < plan.activeConnectionIds.length; index += 1) {
    setNonZero(learnedState.connectionDeltas, connectionDeltaKey(plan.activeConnectionIds[index] ?? -1), view.connectionDeltasByPlanIndex[index]);
  }
  for (let outputIndex = 0; outputIndex < OUTPUT_COUNT; outputIndex += 1) {
    setNonZero(learnedState.outputBiasDeltas, outputBiasDeltaKey(outputIndex), view.outputBiasDeltas[outputIndex]);
  }
  for (let index = 0; index < plan.unitIds.length; index += 1) {
    const unitId = plan.unitIds[index] ?? -1;
    setNonZero(learnedState.gateBiasDeltas, gateBiasDeltaKey(unitId, "update"), view.updateGateBiasDeltasByUnitIndex[index]);
    setNonZero(learnedState.gateBiasDeltas, gateBiasDeltaKey(unitId, "reset"), view.resetGateBiasDeltasByUnitIndex[index]);
    setNonZero(learnedState.gateBiasDeltas, gateBiasDeltaKey(unitId, "candidate"), view.candidateGateBiasDeltasByUnitIndex[index]);
  }
  return learnedState;
}

function parseGateBiasDeltaKey(key: string): { unitId: number; gate: GateType } | undefined {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0) return undefined;
  const unitId = Number(key.slice(0, separatorIndex));
  const gate = key.slice(separatorIndex + 1);
  if (!Number.isInteger(unitId) || (gate !== "update" && gate !== "reset" && gate !== "candidate")) return undefined;
  return { unitId, gate };
}

function setNonZero(record: Record<string, number>, key: string, value: number | undefined) {
  const finite = finiteOr(value, 0);
  if (finite !== 0) record[key] = finite;
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeInteger(value: number | undefined) {
  return Math.max(0, Math.floor(finiteOr(value, 0)));
}
