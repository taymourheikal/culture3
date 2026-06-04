import {
  materializeBrainEvaluationFromRuntimeArrays,
  type BrainEvaluation,
} from "./brain";
import { evaluateCompactBrainKernel } from "./brainKernel";
import { compileBrainPlan, brainGenomeCacheSignature, brainPlanSignature, type CompiledBrainPlan } from "./brainPlan";
import { hiddenRecordToArray } from "./brainState";
import { OUTPUT_COUNT } from "./config";
import { createPlanAlignedEffectiveBrainValuesFromArrays } from "./effectiveGenome";
import {
  connectionDeltaKey,
  createEmptyLearnedState,
  gateBiasDeltaKey,
  outputBiasDeltaKey,
} from "./plasticity";
import { createPlanAlignedLearnedStateView } from "./learnedStateView";
import type { SpawnerGenome, SpawnerLearnedState } from "./types";
import type {
  BrainEvaluationJob,
  BrainEvaluationResult,
  CompactBrainEvaluationJob,
  CompactBrainEvaluationPayload,
  CompactBrainEvaluationResult,
  CompactBrainGenomePayload,
  CompactCompiledBrainPlanPayload,
  CompactLearnedStatePayload,
} from "../protocol/brainEvalProtocol";

export type CompactBrainPlanCache = {
  get: (key: string) => CompiledBrainPlan | undefined;
  set: (key: string, value: CompiledBrainPlan) => unknown;
};

export function compactGenomeKey(job: BrainEvaluationJob) {
  if (!job.genome) throw new Error(`Missing genome for compact brain evaluation job ${job.spawnerId}`);
  return `${job.sessionId}:${job.runGeneration}:${job.spawnerId}:${brainGenomeCacheSignature(job.genome)}`;
}

export function compactJobFromBrainEvaluationJob(
  job: BrainEvaluationJob,
  options: { genomeKey?: string; includeGenome?: boolean; includeGenomePayload?: boolean; plan?: CompiledBrainPlan } = {},
): CompactBrainEvaluationJob {
  if (!job.genome) throw new Error(`Missing genome for compact brain evaluation job ${job.spawnerId}`);
  const plan = options.plan ?? compileBrainPlan(job.genome);
  const genomeKey = options.genomeKey ?? compactGenomeKey(job);
  return {
    sessionId: job.sessionId,
    runGeneration: job.runGeneration,
    advanceEpoch: job.advanceEpoch,
    batchId: job.batchId,
    tick: job.tick,
    index: job.index,
    spawnerId: job.spawnerId,
    genomeKey,
    genome: options.includeGenome === false ? undefined : job.genome,
    genomePayload: options.includeGenomePayload === false ? undefined : compactGenomePayload(genomeKey, job.genome, plan),
    learnedState: compactLearnedStatePayload(job.genome, job.learnedState, plan),
    hiddenState: hiddenRecordToArray(plan, job.hiddenState),
    inputs: [...job.inputs],
    includeActivations: job.includeActivations,
    includePreviousState: job.includePreviousState,
  };
}

export function compactGenomePayload(genomeKey: string, genome: SpawnerGenome, plan: CompiledBrainPlan): CompactBrainGenomePayload {
  const baseConnectionWeights = new Array(plan.activeConnectionCount).fill(0);
  for (const connection of genome.connections) {
    if (!connection.enabled) continue;
    const connectionIndex = plan.connectionIndexByInnovationId.get(connection.innovationId);
    if (connectionIndex !== undefined) baseConnectionWeights[connectionIndex] = finiteOr(connection.weight, 0);
  }
  const updateGateBiases = new Array(plan.activeUnitCount).fill(0);
  const resetGateBiases = new Array(plan.activeUnitCount).fill(0);
  const candidateGateBiases = new Array(plan.activeUnitCount).fill(0);
  for (const unit of genome.units) {
    if (!unit.enabled) continue;
    const unitIndex = plan.unitIndexById.get(unit.unitId);
    if (unitIndex === undefined) continue;
    updateGateBiases[unitIndex] = finiteOr(unit.updateBias, 0);
    resetGateBiases[unitIndex] = finiteOr(unit.resetBias, 0);
    candidateGateBiases[unitIndex] = finiteOr(unit.candidateBias, 0);
  }
  return {
    genomeKey,
    planSignature: plan.signature,
    structuralPlan: compactPlanPayload(plan),
    baseConnectionWeights,
    outputBiases: Array.from({ length: OUTPUT_COUNT }, (_, outputIndex) => finiteOr(genome.outputBias[outputIndex], 0)),
    updateGateBiases,
    resetGateBiases,
    candidateGateBiases,
    maxLearnedDelta: finiteOr(genome.plasticityProfile.maxLearnedDelta, 0),
  };
}

export function compactPlanPayload(plan: CompiledBrainPlan): CompactCompiledBrainPlanPayload {
  return {
    signature: plan.signature,
    unitIds: [...plan.unitIds],
    activeConnectionIds: [...plan.activeConnectionIds],
    activeUnitCount: plan.activeUnitCount,
    activeConnectionCount: plan.activeConnectionCount,
    activeLayerCount: plan.activeLayerCount,
  };
}

export function compactLearnedStatePayload(
  genome: SpawnerGenome,
  learnedState: Partial<SpawnerLearnedState> | undefined,
  plan: CompiledBrainPlan,
): CompactLearnedStatePayload {
  const view = createPlanAlignedLearnedStateView(genome, learnedState, plan);
  return {
    connectionDeltasByPlanIndex: denseNumericArray(view.connectionDeltasByPlanIndex, plan.activeConnectionCount),
    outputBiasDeltas: denseNumericArray(view.outputBiasDeltas, OUTPUT_COUNT),
    updateGateBiasDeltasByUnitIndex: denseNumericArray(view.updateGateBiasDeltasByUnitIndex, plan.activeUnitCount),
    resetGateBiasDeltasByUnitIndex: denseNumericArray(view.resetGateBiasDeltasByUnitIndex, plan.activeUnitCount),
    candidateGateBiasDeltasByUnitIndex: denseNumericArray(view.candidateGateBiasDeltasByUnitIndex, plan.activeUnitCount),
    recentLearningSignal: view.recentLearningSignal,
    learningUpdateCount: view.learningUpdateCount,
    reproductionLearningCount: view.reproductionLearningCount,
  };
}

export function materializeCompactLearnedState(payload: CompactLearnedStatePayload, plan: CompiledBrainPlan): SpawnerLearnedState {
  const learnedState = createEmptyLearnedState();
  for (let index = 0; index < plan.activeConnectionIds.length; index += 1) {
    setNonZeroDelta(learnedState.connectionDeltas, connectionDeltaKey(plan.activeConnectionIds[index] ?? -1), payload.connectionDeltasByPlanIndex[index]);
  }
  for (let outputIndex = 0; outputIndex < OUTPUT_COUNT; outputIndex += 1) {
    setNonZeroDelta(learnedState.outputBiasDeltas, outputBiasDeltaKey(outputIndex), payload.outputBiasDeltas[outputIndex]);
  }
  for (let index = 0; index < plan.unitIds.length; index += 1) {
    const unitId = plan.unitIds[index] ?? -1;
    setNonZeroDelta(learnedState.gateBiasDeltas, gateBiasDeltaKey(unitId, "update"), payload.updateGateBiasDeltasByUnitIndex[index]);
    setNonZeroDelta(learnedState.gateBiasDeltas, gateBiasDeltaKey(unitId, "reset"), payload.resetGateBiasDeltasByUnitIndex[index]);
    setNonZeroDelta(learnedState.gateBiasDeltas, gateBiasDeltaKey(unitId, "candidate"), payload.candidateGateBiasDeltasByUnitIndex[index]);
  }
  learnedState.recentLearningSignal = finiteOr(payload.recentLearningSignal, 0);
  learnedState.learningUpdateCount = nonNegativeInteger(payload.learningUpdateCount);
  learnedState.reproductionLearningCount = nonNegativeInteger(payload.reproductionLearningCount);
  return learnedState;
}

export function evaluateCompactBrainJob(
  job: CompactBrainEvaluationJob,
  genome: SpawnerGenome | undefined = job.genome,
  planCache?: CompactBrainPlanCache,
): CompactBrainEvaluationResult {
  try {
    if (!genome) throw new Error(`Missing genome for compact brain evaluation job ${job.spawnerId}`);
    const plan = cachedCompactPlan(genome, job.genomePayload?.planSignature, planCache);
    const effectiveValues = compactEffectiveBrainValues(job, genome, plan);
    const currentState = new Array<number>(plan.unitIds.length);
    const outputs = new Array<number>(OUTPUT_COUNT);
    const connectionActivations: BrainEvaluation["connectionActivations"] | undefined = job.includeActivations ? {} : undefined;
    evaluateCompactBrainKernel({
      plan,
      inputs: job.inputs,
      previousState: job.hiddenState,
      currentState,
      outputs,
      effectiveValues,
      planValues: effectiveValues,
      connectionActivations,
    });
    return {
      sessionId: job.sessionId,
      runGeneration: job.runGeneration,
      advanceEpoch: job.advanceEpoch,
      batchId: job.batchId,
      tick: job.tick,
      index: job.index,
      spawnerId: job.spawnerId,
      evaluation: compactEvaluationPayloadFromArrays({ outputs, currentState, connectionActivations }, job, plan),
    };
  } catch (error) {
    return {
      sessionId: job.sessionId,
      runGeneration: job.runGeneration,
      advanceEpoch: job.advanceEpoch,
      batchId: job.batchId,
      tick: job.tick,
      index: job.index,
      spawnerId: job.spawnerId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function compactEffectiveBrainValues(job: CompactBrainEvaluationJob, genome: SpawnerGenome, plan: CompiledBrainPlan) {
  const payload = job.genomePayload ?? compactGenomePayload(job.genomeKey, genome, plan);
  return createPlanAlignedEffectiveBrainValuesFromArrays(
    genome,
    plan,
    {
      connectionWeightsByPlanIndex: payload.baseConnectionWeights,
      outputBiases: payload.outputBiases,
      updateGateBiasesByUnitIndex: payload.updateGateBiases,
      resetGateBiasesByUnitIndex: payload.resetGateBiases,
      candidateGateBiasesByUnitIndex: payload.candidateGateBiases,
    },
    {
      connectionDeltasByPlanIndex: job.learnedState.connectionDeltasByPlanIndex,
      outputBiasDeltas: job.learnedState.outputBiasDeltas,
      updateGateBiasDeltasByUnitIndex: job.learnedState.updateGateBiasDeltasByUnitIndex,
      resetGateBiasDeltasByUnitIndex: job.learnedState.resetGateBiasDeltasByUnitIndex,
      candidateGateBiasDeltasByUnitIndex: job.learnedState.candidateGateBiasDeltasByUnitIndex,
      maxLearnedDelta: payload.maxLearnedDelta,
    },
  );
}

export function compactEvaluationPayload(
  evaluation: BrainEvaluation,
  job: Pick<CompactBrainEvaluationJob, "hiddenState" | "inputs" | "includeActivations" | "includePreviousState">,
  plan: CompiledBrainPlan,
): CompactBrainEvaluationPayload {
  return {
    outputs: [...evaluation.outputs],
    currentState: hiddenRecordToArray(plan, evaluation.currentState),
    previousState: job.includePreviousState ? hiddenRecordToArray(plan, evaluation.previousState) : undefined,
    activeConnectionIds: job.includeActivations ? [...evaluation.activeConnectionIds] : undefined,
    connectionActivations: job.includeActivations ? cloneActivationMap(evaluation.connectionActivations) : undefined,
    runtimeTraceState: {
      previousState: [...job.hiddenState],
      inputs: [...job.inputs],
    },
  };
}

function compactEvaluationPayloadFromArrays(
  evaluation: Pick<CompactBrainEvaluationPayload, "outputs" | "currentState" | "connectionActivations">,
  job: Pick<CompactBrainEvaluationJob, "hiddenState" | "inputs" | "includeActivations" | "includePreviousState">,
  plan: CompiledBrainPlan,
): CompactBrainEvaluationPayload {
  return {
    outputs: [...evaluation.outputs],
    currentState: [...evaluation.currentState],
    previousState: job.includePreviousState ? [...job.hiddenState] : undefined,
    activeConnectionIds: job.includeActivations ? [...plan.activeConnectionIds] : undefined,
    connectionActivations: job.includeActivations ? cloneActivationMap(evaluation.connectionActivations ?? {}) : undefined,
    runtimeTraceState: {
      previousState: [...job.hiddenState],
      inputs: [...job.inputs],
    },
  };
}

export function materializeCompactBrainEvaluationResult(
  result: CompactBrainEvaluationResult,
  sourceJob: BrainEvaluationJob | undefined,
  plan?: CompiledBrainPlan,
): BrainEvaluationResult {
  const identity = {
    sessionId: result.sessionId,
    runGeneration: result.runGeneration,
    advanceEpoch: result.advanceEpoch,
    batchId: result.batchId,
    tick: result.tick,
    index: result.index,
    spawnerId: result.spawnerId,
  };
  if (result.error || !result.evaluation) return { ...identity, error: result.error ?? `Missing compact brain evaluation payload at index ${result.index}` };
  if (!sourceJob?.genome) return { ...identity, error: `Missing source genome for compact brain evaluation result ${result.spawnerId}` };
  const compiledPlan = plan ?? compileBrainPlan(sourceJob.genome);
  const previousStateArray = result.evaluation.runtimeTraceState?.previousState ?? hiddenRecordToArray(compiledPlan, sourceJob.hiddenState);
  const inputs = result.evaluation.runtimeTraceState?.inputs ?? sourceJob.inputs;
  return {
    ...identity,
    evaluation: materializeBrainEvaluationFromRuntimeArrays({
      genome: sourceJob.genome,
      learnedState: sourceJob.learnedState,
      hiddenState: sourceJob.hiddenState,
      inputs,
      plan: compiledPlan,
      outputs: result.evaluation.outputs,
      previousStateArray,
      currentStateArray: result.evaluation.currentState,
      includeActivations: sourceJob.includeActivations,
      includePreviousState: sourceJob.includePreviousState,
      activeConnectionIds: result.evaluation.activeConnectionIds,
      connectionActivations: result.evaluation.connectionActivations,
    }),
  };
}

export function materializeCompactBrainEvaluationResults(
  compactResults: CompactBrainEvaluationResult[],
  sourceJobs: BrainEvaluationJob[],
  planByJobIndex?: Map<number, CompiledBrainPlan>,
): BrainEvaluationResult[] {
  const sourceJobByIndex = new Map(sourceJobs.map((job) => [job.index, job]));
  return compactResults.map((result) => materializeCompactBrainEvaluationResult(result, sourceJobByIndex.get(result.index), planByJobIndex?.get(result.index)));
}

function cachedCompactPlan(genome: SpawnerGenome, planSignature: string | undefined, planCache: CompactBrainPlanCache | undefined) {
  const signature = planSignature ?? brainPlanSignature(genome);
  if (!planCache) return compileBrainPlan(genome, signature);
  const cached = planCache.get(signature);
  if (cached) return cached;
  const plan = compileBrainPlan(genome, signature);
  planCache.set(signature, plan);
  return plan;
}

function cloneActivationMap(record: BrainEvaluation["connectionActivations"]) {
  const clone: BrainEvaluation["connectionActivations"] = {};
  for (const [key, value] of Object.entries(record)) clone[key] = { source: value.source, target: value.target };
  return clone;
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function denseNumericArray(values: ArrayLike<number | undefined>, length: number) {
  return Array.from({ length }, (_, index) => finiteOr(values[index], 0));
}

function nonNegativeInteger(value: number | undefined) {
  return Math.max(0, Math.floor(finiteOr(value, 0)));
}

function setNonZeroDelta(record: Record<string, number>, key: string, value: number | undefined) {
  const finite = finiteOr(value, 0);
  if (finite !== 0) record[key] = finite;
}
