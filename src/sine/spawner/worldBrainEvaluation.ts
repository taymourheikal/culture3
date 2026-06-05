import {
  alignedHiddenState,
  applyBrainEvaluation,
  evaluateSpawnerBrainRuntime,
  materializeBrainRuntimeEvaluation,
  type BrainRuntimeEvaluation,
} from "./brain";
import type { CompiledBrainPlan } from "./brainPlan";
import { createPlanAlignedLearnedStateView, type PlanAlignedLearnedStateView } from "./learnedStateView";
import type { MarketFeatureInstrumentation } from "./marketFeatureContext";
import { clamp } from "./math";
import type { createMarketInputResolver } from "./marketInputs";
import { populationRoomRatio } from "./reproductionPressure";
import { createSpawnerRuntimeContext, type SpawnerRuntimeContext } from "./spawnerRuntimeContext";
import type { SpawnerAgent, SpawnerLearnedState, SpawnerWorld } from "./types";
import type { BrainEvaluationJob, BrainEvaluationResult, BrainEvaluationRunner } from "../protocol/brainEvalProtocol";

export type SpawnerAdvanceOptions = {
  brainEvaluationRunner?: BrainEvaluationRunner;
  sessionId?: number;
  runGeneration?: number;
  advanceEpoch?: number;
  batchId?: number;
  traceInstrumentation?: BrainTraceInstrumentation;
  phaseInstrumentation?: SpawnerPhaseInstrumentation;
  marketFeatureInstrumentation?: MarketFeatureInstrumentation;
};

export type SpawnerPhaseInstrumentation = {
  recordPhase(phase: string, ms: number, count?: number): void;
  recordMetric?: (metric: string, value: number) => void;
};

export type BrainTraceInstrumentation = {
  evaluatedAgents: number;
  firstPassBatches: number;
  firstPassMs: number;
  waitActions: number;
  longActions: number;
  shortActions: number;
  reproductionTraces: number;
  optimizedTraceMaterializations: number;
  optimizedTraceMaterializationMs: number;
  fallbackTraceEvaluations: number;
  fallbackTraceMs: number;
};

export type SpawnerEvaluationFrame = {
  sessionId: number;
  runGeneration: number;
  advanceEpoch: number | undefined;
  batchId: number;
  tick: number;
  spawners: SpawnerAgent[];
  spawnerIds: number[];
  indexes: number[];
  plans: CompiledBrainPlan[];
  inputs: number[][];
  hiddenStates: Record<number, number>[];
  learnedStates: SpawnerLearnedState[];
  learnedStateViews: PlanAlignedLearnedStateView[];
};

export type BrainEvaluationSource = {
  genome?: SpawnerAgent["genome"];
  learnedState: SpawnerLearnedState;
  learnedStateView?: PlanAlignedLearnedStateView;
  hiddenState: Record<number, number>;
  inputs: number[];
};

export type RuntimeBrainEvaluationResult = {
  sessionId: number;
  runGeneration: number;
  advanceEpoch: number | undefined;
  batchId: number;
  tick: number;
  index: number;
  spawnerId: number;
  runtimeEvaluation?: BrainRuntimeEvaluation;
  error?: string;
};

export type SpawnerEvaluationResult = BrainEvaluationResult | RuntimeBrainEvaluationResult;

export function buildSpawnerEvaluationFrame(
  world: SpawnerWorld,
  marketInputResolver: ReturnType<typeof createMarketInputResolver>,
  runtimeContext: SpawnerRuntimeContext = createSpawnerRuntimeContext(world.spawners),
  options: SpawnerAdvanceOptions = {},
) {
  const spawners = runtimeContext.spawners;
  const frame: SpawnerEvaluationFrame = {
    sessionId: options.sessionId ?? 0,
    runGeneration: options.runGeneration ?? 0,
    advanceEpoch: options.advanceEpoch,
    batchId: options.batchId ?? world.tick,
    tick: world.tick,
    spawners,
    spawnerIds: new Array(spawners.length),
    indexes: new Array(spawners.length),
    plans: runtimeContext.plans,
    inputs: new Array(spawners.length),
    hiddenStates: new Array(spawners.length),
    learnedStates: new Array(spawners.length),
    learnedStateViews: new Array(spawners.length),
  };
  for (let index = 0; index < spawners.length; index += 1) {
    const spawner = spawners[index];
    if (!spawner) continue;
    const plan = runtimeContext.plans[index];
    if (!plan) throw new Error(`Missing compiled brain plan at evaluation frame index ${index}`);
    frame.indexes[index] = index;
    frame.spawnerIds[index] = spawner.id;
    frame.inputs[index] = buildSpawnerInputs(world, spawner, marketInputResolver, options);
    frame.hiddenStates[index] = spawner.hiddenState;
    frame.learnedStates[index] = spawner.learnedState;
    frame.learnedStateViews[index] = createPlanAlignedLearnedStateView(spawner.genome, spawner.learnedState, plan, { assumeNormalizedLearnedState: true });
  }
  return frame;
}

export function buildBrainEvaluationJobs(
  frame: SpawnerEvaluationFrame,
  options: SpawnerAdvanceOptions,
) {
  const sessionId = options.sessionId ?? frame.sessionId;
  const runGeneration = options.runGeneration ?? frame.runGeneration;
  const advanceEpoch = options.advanceEpoch ?? frame.advanceEpoch;
  const batchId = options.batchId ?? frame.batchId;
  return timePhase(options, "brainJobArrayAllocation", () => frame.spawners.map((spawner, index): BrainEvaluationJob => ({
    sessionId,
    runGeneration,
    advanceEpoch,
    batchId,
    tick: frame.tick,
    index: frame.indexes[index] ?? index,
    spawnerId: frame.spawnerIds[index] ?? spawner.id,
    genome: spawner.genome,
    learnedState: frame.learnedStates[index] ?? spawner.learnedState,
    hiddenState: frame.hiddenStates[index] ?? spawner.hiddenState,
    inputs: frame.inputs[index] ?? [],
    includeActivations: false,
    includePreviousState: false,
  })));
}

export function evaluateSpawnerFrameSync(frame: SpawnerEvaluationFrame): RuntimeBrainEvaluationResult[] {
  return frame.spawners.map((spawner, index): RuntimeBrainEvaluationResult => {
    try {
      const runtimeEvaluation = evaluateSpawnerBrainRuntime({
        genome: spawner.genome,
        learnedState: frame.learnedStates[index] ?? spawner.learnedState,
        learnedStateView: frame.learnedStateViews[index],
        hiddenState: frame.hiddenStates[index] ?? spawner.hiddenState,
        inputs: frame.inputs[index] ?? [],
        plan: frame.plans[index],
        includeActivations: false,
        includePreviousState: false,
      });
      return frameResultIdentity(frame, index, { runtimeEvaluation });
    } catch (error) {
      return frameResultIdentity(frame, index, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function applyEvaluationResult(
  spawner: SpawnerAgent,
  result: Pick<BrainEvaluationResult, "evaluation"> | Pick<RuntimeBrainEvaluationResult, "runtimeEvaluation">,
  source: Pick<BrainEvaluationJob, "includePreviousState"> | undefined,
) {
  const runtime = runtimeEvaluationFromResult(result);
  if (runtime) {
    spawner.hiddenState = hiddenStateWithCurrentArray(spawner, runtime);
    return;
  }
  const evaluation = publicEvaluationFromResult(result);
  if (!evaluation) return;
  if (source?.includePreviousState === false) {
    spawner.hiddenState = { ...alignedHiddenState(spawner.genome, spawner.hiddenState), ...evaluation.currentState };
    return;
  }
  applyBrainEvaluation(spawner, evaluation);
}

function hiddenStateWithCurrentArray(spawner: SpawnerAgent, runtime: BrainRuntimeEvaluation) {
  const nextState = { ...spawner.hiddenState };
  for (const unit of spawner.genome.units) {
    if (!Number.isFinite(nextState[unit.unitId])) nextState[unit.unitId] = 0;
  }
  for (let index = 0; index < runtime.plan.unitIds.length; index += 1) {
    const unitId = runtime.plan.unitIds[index];
    if (unitId === undefined) continue;
    nextState[unitId] = finiteHiddenValue(runtime.currentStateArray[index]);
  }
  return nextState;
}

function finiteHiddenValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function orderedEvaluationResults<T extends SpawnerEvaluationResult>(frame: SpawnerEvaluationFrame, results: T[], jobs?: BrainEvaluationJob[]) {
  if (results.length !== frame.spawners.length) throw new Error(`Brain evaluation result count mismatch: expected ${frame.spawners.length}, got ${results.length}`);
  const ordered = [...results].sort((left, right) => left.index - right.index);
  for (let index = 0; index < frame.spawners.length; index += 1) {
    const result = ordered[index];
    const spawner = frame.spawners[index];
    const job = jobs?.[index];
    if (!result || !spawner) throw new Error(`Missing brain evaluation result at index ${index}`);
    const expectedSessionId = job?.sessionId ?? frame.sessionId;
    const expectedRunGeneration = job?.runGeneration ?? frame.runGeneration;
    const expectedAdvanceEpoch = job?.advanceEpoch ?? frame.advanceEpoch;
    const expectedBatchId = job?.batchId ?? frame.batchId;
    const expectedTick = job?.tick ?? frame.tick;
    if (
      result.index !== index ||
      result.spawnerId !== spawner.id ||
      result.sessionId !== expectedSessionId ||
      result.runGeneration !== expectedRunGeneration ||
      result.advanceEpoch !== expectedAdvanceEpoch ||
      result.batchId !== expectedBatchId ||
      result.tick !== expectedTick
    ) {
      throw new Error(`Brain evaluation result identity mismatch at index ${index}`);
    }
    if (result.error || (!publicEvaluationFromResult(result) && !runtimeEvaluationFromResult(result))) {
      throw new Error(result.error ?? `Missing brain evaluation payload at index ${index}`);
    }
  }
  return ordered;
}

export function outputsFromEvaluationResult(result: SpawnerEvaluationResult): number[] {
  const runtime = runtimeEvaluationFromResult(result);
  if (runtime) return runtime.outputs;
  return publicEvaluationFromResult(result)?.outputs ?? [];
}

export function runtimeEvaluationFromResult(result: Pick<RuntimeBrainEvaluationResult, "runtimeEvaluation"> | Pick<BrainEvaluationResult, "evaluation">): BrainRuntimeEvaluation | undefined {
  return "runtimeEvaluation" in result ? result.runtimeEvaluation : undefined;
}

export function publicEvaluationFromResult(result: Pick<BrainEvaluationResult, "evaluation"> | Pick<RuntimeBrainEvaluationResult, "runtimeEvaluation">) {
  return "evaluation" in result ? result.evaluation : undefined;
}

export function materializeEvaluationResult(
  result: SpawnerEvaluationResult,
  source: BrainEvaluationSource,
  options: { includeActivations?: boolean; includePreviousState?: boolean } = {},
) {
  const evaluation = publicEvaluationFromResult(result);
  if (evaluation) return evaluation;
  const runtime = runtimeEvaluationFromResult(result);
  if (!runtime) return undefined;
  if (!source.genome) return undefined;
  return materializeBrainRuntimeEvaluation(runtime, source.genome, source.hiddenState, options);
}

export function frameEvaluationSource(frame: SpawnerEvaluationFrame, index: number): BrainEvaluationSource {
  const spawner = frame.spawners[index];
  if (!spawner) throw new Error(`Missing spawner for evaluation frame index ${index}`);
  return {
    genome: spawner.genome,
    learnedState: frame.learnedStates[index] ?? spawner.learnedState,
    learnedStateView: frame.learnedStateViews[index],
    hiddenState: frame.hiddenStates[index] ?? spawner.hiddenState,
    inputs: frame.inputs[index] ?? [],
  };
}

function frameResultIdentity(
  frame: SpawnerEvaluationFrame,
  index: number,
  payload: Pick<BrainEvaluationResult, "evaluation" | "error"> | Pick<RuntimeBrainEvaluationResult, "runtimeEvaluation" | "error">,
): RuntimeBrainEvaluationResult {
  return {
    sessionId: frame.sessionId,
    runGeneration: frame.runGeneration,
    advanceEpoch: frame.advanceEpoch,
    batchId: frame.batchId,
    tick: frame.tick,
    index: frame.indexes[index] ?? index,
    spawnerId: frame.spawnerIds[index] ?? frame.spawners[index]?.id ?? -1,
    ...payload,
  };
}

export function buildSpawnerInputs(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  marketInputResolver: ReturnType<typeof createMarketInputResolver>,
  options: SpawnerAdvanceOptions = {},
) {
  const marketInputs = timePhase(options, "marketInputResolve", () => marketInputResolver.resolve(spawner.genome.perception));
  return timePhase(options, "spawnerInputArrayConstruction", () => [
    ...marketInputs,
    energyRatioInput(spawner.energy, world.config.reproductionEnergy),
    clamp(spawner.health / 100, 0, 1),
    populationRoomRatio(world.spawners.length, world.config.maxSpawners),
  ]);
}

export function energyRatioInput(energy: number, reproductionEnergy: number) {
  if (reproductionEnergy > 0) return clamp(energy / reproductionEnergy, -1, 2);
  if (energy > 0) return 2;
  if (energy < 0) return -1;
  return 0;
}

function timePhase<T>(options: SpawnerAdvanceOptions, phase: string, read: () => T): T {
  const instrumentation = options.phaseInstrumentation;
  if (!instrumentation) return read();
  const started = performance.now();
  try {
    return read();
  } finally {
    instrumentation.recordPhase(phase, performance.now() - started);
  }
}
