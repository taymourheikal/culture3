import type { MarketTimeline } from "../marketTimeline";
import {
  evaluateSpawnerBrainPure,
  materializeBrainEvaluationTraceActivations,
  materializeBrainRuntimeCompactTraceActivations,
  type BrainEvaluation,
  type BrainRuntimeEvaluation,
  type BrainTraceActivations,
} from "./brain";
import { ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import { createSyncBrainEvaluationRunner } from "./brainEvaluationRunner";
import { DEFAULT_SPAWNER_CONFIG } from "./config";
import { createInnovationRegistry } from "./genome";
import { captureDecisionTrace, pruneDecisionTraces } from "./learning";
import { createMarketInputResolver } from "./marketInputs";
import { resolveFoods } from "./reward";
import { trimResolvedFoodHistory } from "./foodDueQueue";
import { createFoodRuntimeIndex, createSpawnerRuntimeIndex, isSpawnerAlive } from "./runtimeIndex";
import { SeededRng } from "./rng";
import { recordTelemetry } from "./telemetry";
import { decayLearnedState } from "./plasticity";
import { createSpawnerRuntimeContext, spawnerRuntimeContextMatches, type SpawnerRuntimeContext } from "./spawnerRuntimeContext";
import type { SpawnerAgent, SpawnerConfig, SpawnerWorld } from "./types";
import { chooseSpawnerAction, decodeSpawnerOutputs, tryReproduceSpawner, trySpawnFood } from "./worldActions";
import {
  applyEvaluationResult,
  buildBrainEvaluationJobs,
  buildSpawnerEvaluationFrame,
  evaluateSpawnerFrameSync,
  frameEvaluationSource,
  orderedEvaluationResults,
  outputsFromEvaluationResult,
  publicEvaluationFromResult,
  runtimeEvaluationFromResult,
  type BrainEvaluationSource,
  type SpawnerEvaluationResult,
  type SpawnerAdvanceOptions,
  type SpawnerEvaluationFrame,
} from "./worldBrainEvaluation";
import { applySpawnerUpkeep, createInitialSpawners, removeDeadSpawners } from "./worldLifecycle";
import type { BrainEvaluationJob } from "../protocol/brainEvalProtocol";

export { chooseSpawnerAction, decodeSpawnerOutputs, tryReproduceSpawner, trySpawnFood, type SpawnerActionChoice, type SpawnerDecodedOutputs } from "./worldActions";
export { buildSpawnerInputs, energyRatioInput, type SpawnerAdvanceOptions, type SpawnerPhaseInstrumentation } from "./worldBrainEvaluation";
export { applySpawnerUpkeep, pruneDeadSpawners, removeDeadSpawners } from "./worldLifecycle";

const syncBrainEvaluationRunner = createSyncBrainEvaluationRunner();

export function createSpawnerWorld(seed = 101, config: Partial<SpawnerConfig> = {}): SpawnerWorld {
  const fullConfig = { ...DEFAULT_SPAWNER_CONFIG, ...config };
  const rng = new SeededRng(seed);
  const innovations = createInnovationRegistry();
  const world: SpawnerWorld = {
    seed,
    rng,
    tick: 0,
    nextEventId: 1,
    nextSpawnerId: 1,
    nextLineageId: 1,
    nextFoodId: 1,
    spawners: [],
    foods: [],
    recentEvents: [],
    lineages: {},
    cumulativeLoss: 0,
    cumulativeNetPayoff: 0,
    totalResolved: 0,
    totalLosses: 0,
    recentResolvedPayoffs: [],
    telemetry: [],
    config: fullConfig,
    innovations,
  };

  createInitialSpawners(world);

  return world;
}

export function advanceSpawnerWorldToTimeline(world: SpawnerWorld, timeline: MarketTimeline, maxSteps = Number.POSITIVE_INFINITY) {
  let steps = 0;
  while (world.tick < timeline.tick && steps < maxSteps) {
    world.tick += 1;
    steps += 1;
    const result = stepSpawnerWorld(world, timeline);
    if (isPromise(result)) throw new Error("Synchronous spawner advance received an async brain evaluation runner");
  }
  return {
    processedTicks: steps,
    remainingTicks: timeline.tick - world.tick,
  };
}

export async function advanceSpawnerWorldToTimelineAsync(
  world: SpawnerWorld,
  timeline: MarketTimeline,
  maxSteps = Number.POSITIVE_INFINITY,
  options: SpawnerAdvanceOptions = {},
) {
  let steps = 0;
  while (world.tick < timeline.tick && steps < maxSteps) {
    world.tick += 1;
    steps += 1;
    await stepSpawnerWorld(world, timeline, options);
  }
  return {
    processedTicks: steps,
    remainingTicks: timeline.tick - world.tick,
  };
}

export function getVisibleSpawnerFoods(world: Pick<SpawnerWorld, "foods">, centerTick: number, ticksVisible: number) {
  const start = centerTick - ticksVisible / 2;
  const end = centerTick + ticksVisible / 2;
  return world.foods.filter((food) => food.spawnTick <= end && food.resolveTick >= start);
}

export function spawnerHitRate(spawner: SpawnerAgent) {
  return spawner.resolvedCount > 0 ? spawner.wins / spawner.resolvedCount : 0;
}

export function spawnerAveragePayoff(spawner: SpawnerAgent) {
  return spawner.resolvedCount > 0 ? spawner.totalPayoff / spawner.resolvedCount : 0;
}

function stepSpawnerWorld(world: SpawnerWorld, timeline: MarketTimeline, options: SpawnerAdvanceOptions = {}) {
  recordFoodMetrics(options, world);
  timePhase(options, "foodResolution", () => resolveFoods(world, timeline, createSpawnerRuntimeIndex(world.spawners, world.config)));
  timePhase(options, "payoffDeathPruning", () => removeDeadSpawners(world, "payoff"));
  timePhase(options, "learnedStateDecay", () => {
    for (const spawner of world.spawners) {
      spawner.learnedState = decayLearnedState(spawner.learnedState, spawner.genome.plasticityProfile, { assumeNormalizedRuntimeState: true });
    }
  }, world.spawners.length);
  timePhase(options, "tracePruning", () => {
    for (const spawner of world.spawners) {
      pruneDecisionTraces(spawner, world.tick, Math.max(world.config.maxHorizonTicksClampMax, world.config.foodHistoryTicks) + 5);
    }
  }, world.spawners.length);
  const upkeepContext = timePhase(options, "planLookup", () => createSpawnerRuntimeContext(world.spawners), world.spawners.length);
  timePhase(options, "upkeep", () => {
    for (let index = 0; index < upkeepContext.spawners.length; index += 1) {
      const spawner = upkeepContext.spawners[index];
      if (!spawner) continue;
      const plan = upkeepContext.plans[index] ?? ensureCompiledBrainPlan(spawner.genome);
      applySpawnerUpkeep(world, spawner, plan);
    }
  }, upkeepContext.spawners.length);
  timePhase(options, "upkeepDeathPruning", () => removeDeadSpawners(world, "upkeep"));
  const evaluationContext = spawnerRuntimeContextMatches(upkeepContext, world.spawners)
    ? upkeepContext
    : timePhase(options, "postPrunePlanContext", () => createSpawnerRuntimeContext(world.spawners), world.spawners.length);

  const pendingFoodCount = createFoodRuntimeIndex(world.foods).pendingCount;
  const marketInputResolver = timePhase(options, "marketInputResolverCreation", () =>
    createMarketInputResolver(timeline, world.tick, pendingFoodCount, options.marketFeatureInstrumentation),
  );
  const newborns: SpawnerAgent[] = [];
  const frame = timePhase(
    options,
    "spawnerContextInputConstruction",
    () => buildSpawnerEvaluationFrame(world, marketInputResolver, evaluationContext, options),
    evaluationContext.spawners.length,
  );
  recordMarketResolverMetrics(options, marketInputResolver);
  const runner = options.brainEvaluationRunner ?? syncBrainEvaluationRunner;
  const jobs = runner === syncBrainEvaluationRunner
    ? undefined
    : timePhase(options, "brainJobConstruction", () => buildBrainEvaluationJobs(frame, options), frame.spawners.length);
  if (!jobs) recordPhase(options, "brainJobConstruction", 0, frame.spawners.length);
  const evaluationStarted = nowMs();
  const results = jobs ? runner.evaluateBatch(jobs) : evaluateSpawnerFrameSync(frame);
  if (isPromise(results)) {
    return results.then((resolvedResults) => {
      recordFirstPassTiming(options, frame.spawners.length, nowMs() - evaluationStarted);
      recordPhase(options, "brainEvaluation", nowMs() - evaluationStarted, frame.spawners.length);
      return finishSpawnerWorldStep(world, timeline, newborns, frame, resolvedResults, evaluationContext, options, jobs);
    });
  }
  recordFirstPassTiming(options, frame.spawners.length, nowMs() - evaluationStarted);
  recordPhase(options, "brainEvaluation", nowMs() - evaluationStarted, frame.spawners.length);
  finishSpawnerWorldStep(world, timeline, newborns, frame, results, evaluationContext, options, jobs);
}

function finishSpawnerWorldStep(
  world: SpawnerWorld,
  timeline: MarketTimeline,
  newborns: SpawnerAgent[],
  frame: SpawnerEvaluationFrame,
  results: SpawnerEvaluationResult[],
  evaluationContext: SpawnerRuntimeContext,
  options: SpawnerAdvanceOptions,
  jobs?: BrainEvaluationJob[],
) {
  const orderedResults = timePhase(options, "resultOrdering", () => orderedEvaluationResults(frame, results, jobs), results.length);
  for (let index = 0; index < frame.spawners.length; index += 1) {
    const spawner = frame.spawners[index];
    const result = orderedResults[index];
    if (!spawner || !result) continue;
    timePhase(options, "resultApplication", () => applyEvaluationResult(spawner, result, jobs?.[index] ?? { includePreviousState: false }));
    const decoded = timePhase(options, "outputDecoding", () => decodeSpawnerOutputs(world, spawner, outputsFromEvaluationResult(result)));
    const action = timePhase(options, "actionSelection", () => chooseSpawnerAction(world, spawner, decoded));
    recordAction(options, action);
    const source = jobs?.[index] ?? frameEvaluationSource(frame, index);
    let traceActivations: BrainTraceActivations | undefined;
    const getTraceActivations = () => {
      traceActivations =
        traceActivations ??
        traceActivationsForEvaluation(result, source, frame.plans[index], options);
      return traceActivations;
    };
    const traceId =
      action === "wait"
        ? undefined
        : timePhase(options, "decisionTraceCapture", () =>
            captureDecisionTrace({ spawner, tick: world.tick, evaluation: publicEvaluationFromResult(result), traceActivations: getTraceActivations(), decoded, action }),
          );
    const spawned = timePhase(options, "foodSpawning", () => trySpawnFood(world, spawner, decoded, timeline, action, traceId));
    if (spawned) recordMetric(options, "spawnedFoodCount", 1);
    if (!isSpawnerAlive(spawner, world.config)) continue;
    const beforeBirths = newborns.length;
    timePhase(options, "reproductionAttempt", () =>
      tryReproduceSpawner(world, spawner, decoded, newborns, () =>
        captureReproductionTrace(world, spawner, publicEvaluationFromResult(result), decoded, getTraceActivations, options),
      ),
    );
    if (newborns.length > beforeBirths) recordMetric(options, "reproductionCount", newborns.length - beforeBirths);
  }

  timePhase(options, "birthAppend", () => {
    world.spawners = world.spawners.concat(newborns);
  }, newborns.length);
  timePhase(options, "actionDeathPruning", () => removeDeadSpawners(world, "action"));

  timePhase(options, "foodTrimming", () => {
    const minTick = world.tick - world.config.foodHistoryTicks;
    trimResolvedFoodHistory(world, minTick);
  }, world.foods.length);
  recordMetric(options, "retainedFoodCountAfterTrim", world.foods.length);
  timePhase(options, "telemetry", () => recordTelemetry(world, evaluationContext), world.spawners.length);
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === "function";
}

function traceActivationsForEvaluation(
  result: SpawnerEvaluationResult,
  source: BrainEvaluationSource | undefined,
  plan: CompiledBrainPlan | undefined,
  options: SpawnerAdvanceOptions,
) {
  const runtime = runtimeEvaluationFromResult(result);
  if (runtime) return traceActivationsForRuntime(runtime, options);
  const evaluation = publicEvaluationFromResult(result);
  if (!evaluation) {
    return {
      activeConnectionIds: [],
      connectionActivations: {},
      owned: false,
    };
  }
  if (evaluation.activeConnectionIds.length > 0) {
    return {
      activeConnectionIds: evaluation.activeConnectionIds,
      connectionActivations: evaluation.connectionActivations,
      owned: false,
    };
  }
  const materializeStarted = nowMs();
  const materialized = timePhase(options, "traceActivationMaterialization", () => materializeBrainEvaluationTraceActivations(evaluation));
  if (materialized) {
    if (options.traceInstrumentation) {
      options.traceInstrumentation.optimizedTraceMaterializations += 1;
      options.traceInstrumentation.optimizedTraceMaterializationMs += nowMs() - materializeStarted;
    }
    return materialized;
  }
  if (!source?.genome) {
    return {
      activeConnectionIds: evaluation.activeConnectionIds,
      connectionActivations: evaluation.connectionActivations,
      owned: false,
    };
  }
  const genome = source.genome;
  const started = nowMs();
  try {
    const fallback = timePhase(options, "traceFallbackEvaluation", () => evaluateSpawnerBrainPure({
      genome,
      learnedState: source.learnedState,
      learnedStateView: source.learnedStateView,
      hiddenState: source.hiddenState,
      inputs: source.inputs,
      plan,
      includeActivations: true,
      includePreviousState: false,
    }));
    return {
      activeConnectionIds: fallback.activeConnectionIds,
      connectionActivations: fallback.connectionActivations,
      owned: false,
    };
  } finally {
    if (options.traceInstrumentation) {
      options.traceInstrumentation.fallbackTraceEvaluations += 1;
      options.traceInstrumentation.fallbackTraceMs += nowMs() - started;
    }
  }
}

function traceActivationsForRuntime(runtime: BrainRuntimeEvaluation, options: SpawnerAdvanceOptions) {
  if (runtime.activeConnectionIds && runtime.connectionActivations) {
    return {
      activeConnectionIds: runtime.activeConnectionIds,
      connectionActivations: runtime.connectionActivations,
      owned: false,
    };
  }
  const materializeStarted = nowMs();
  const materialized = timePhase(options, "traceActivationMaterialization", () => materializeBrainRuntimeCompactTraceActivations(runtime));
  if (options.traceInstrumentation) {
    options.traceInstrumentation.optimizedTraceMaterializations += 1;
    options.traceInstrumentation.optimizedTraceMaterializationMs += nowMs() - materializeStarted;
  }
  return materialized;
}

function captureReproductionTrace(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  evaluation: BrainEvaluation | undefined,
  decoded: ReturnType<typeof decodeSpawnerOutputs>,
  getTraceActivations: () => BrainTraceActivations,
  options: SpawnerAdvanceOptions,
) {
  if (options.traceInstrumentation) options.traceInstrumentation.reproductionTraces += 1;
  return captureDecisionTrace({ spawner, tick: world.tick, evaluation, traceActivations: getTraceActivations(), decoded, action: "reproduce" });
}

function recordFirstPassTiming(options: SpawnerAdvanceOptions, evaluatedAgents: number, elapsedMs: number) {
  const instrumentation = options.traceInstrumentation;
  if (!instrumentation) return;
  instrumentation.evaluatedAgents += evaluatedAgents;
  instrumentation.firstPassBatches += 1;
  instrumentation.firstPassMs += elapsedMs;
}

function recordAction(options: SpawnerAdvanceOptions, action: ReturnType<typeof chooseSpawnerAction>) {
  const instrumentation = options.traceInstrumentation;
  if (!instrumentation) return;
  if (action === "wait") instrumentation.waitActions += 1;
  else if (action === "long") instrumentation.longActions += 1;
  else instrumentation.shortActions += 1;
}

function recordFoodMetrics(options: SpawnerAdvanceOptions, world: SpawnerWorld) {
  if (!options.phaseInstrumentation?.recordMetric) return;
  let pending = 0;
  let due = 0;
  let horizonTotal = 0;
  let horizonCount = 0;
  for (const food of world.foods) {
    if (food.status !== "pending") continue;
    pending += 1;
    horizonTotal += Math.max(0, food.resolveTick - food.spawnTick);
    horizonCount += 1;
    if (food.resolveTick <= world.tick) due += 1;
  }
  recordMetric(options, "retainedFoodCount", world.foods.length);
  recordMetric(options, "pendingFoodCount", pending);
  recordMetric(options, "dueFoodCount", due);
  if (horizonCount > 0) recordMetric(options, "pendingFoodAverageHorizonTicks", horizonTotal / horizonCount);
}

function recordMarketResolverMetrics(options: SpawnerAdvanceOptions, resolver: ReturnType<typeof createMarketInputResolver>) {
  recordMetric(options, "marketInputResolveCount", resolver.getResolveCount());
  recordMetric(options, "marketInputCacheHitCount", resolver.getCacheHitCount());
  recordMetric(options, "marketInputComputeCount", resolver.getComputeCount());
  recordMetric(options, "marketInputCacheSize", resolver.getCacheSize());
  recordMetric(options, "marketFeatureResolveCount", resolver.getFeatureResolveCount());
  recordMetric(options, "marketFeatureCacheHitCount", resolver.getFeatureCacheHitCount());
  recordMetric(options, "marketFeatureComputeCount", resolver.getFeatureComputeCount());
  recordMetric(options, "marketFeatureCacheSize", resolver.getFeatureCacheSize());
  recordMetric(options, "marketFeatureSampleCacheSize", resolver.getSampleCacheSize());
}

function recordMetric(options: SpawnerAdvanceOptions, metric: string, value: number) {
  options.phaseInstrumentation?.recordMetric?.(metric, value);
}

function timePhase<T>(options: SpawnerAdvanceOptions, phase: string, read: () => T, count?: number): T {
  if (!options.phaseInstrumentation) return read();
  const started = nowMs();
  try {
    return read();
  } finally {
    recordPhase(options, phase, nowMs() - started, count);
  }
}

function recordPhase(options: SpawnerAdvanceOptions, phase: string, ms: number, count?: number) {
  options.phaseInstrumentation?.recordPhase(phase, ms, count);
}

function nowMs() {
  return performance.now();
}
