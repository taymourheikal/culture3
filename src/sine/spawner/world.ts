import type { MarketTimeline } from "../marketTimeline";
import { evaluateSpawnerBrainPure, type BrainEvaluation } from "./brain";
import { ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import { createSyncBrainEvaluationRunner } from "./brainEvaluationRunner";
import { DEFAULT_SPAWNER_CONFIG } from "./config";
import { createInnovationRegistry } from "./genome";
import { captureDecisionTrace, pruneDecisionTraces } from "./learning";
import { createMarketInputResolver } from "./marketInputs";
import { resolveFoods } from "./reward";
import { createFoodRuntimeIndex, createSpawnerRuntimeIndex, isSpawnerAlive } from "./runtimeIndex";
import { SeededRng } from "./rng";
import { recordTelemetry } from "./telemetry";
import { decayLearnedState } from "./plasticity";
import type { SpawnerAgent, SpawnerConfig, SpawnerWorld } from "./types";
import { chooseSpawnerAction, decodeSpawnerOutputs, tryReproduceSpawner, trySpawnFood } from "./worldActions";
import {
  applyEvaluationResult,
  buildBrainEvaluationJobs,
  buildSpawnerTickContexts,
  orderedEvaluationResults,
  type SpawnerAdvanceOptions,
} from "./worldBrainEvaluation";
import { applySpawnerUpkeep, createInitialSpawners, removeDeadSpawners } from "./worldLifecycle";
import type { BrainEvaluationJob, BrainEvaluationResult } from "../protocol/brainEvalProtocol";

export { chooseSpawnerAction, decodeSpawnerOutputs, tryReproduceSpawner, trySpawnFood, type SpawnerActionChoice, type SpawnerDecodedOutputs } from "./worldActions";
export { buildSpawnerInputs, energyRatioInput, type SpawnerAdvanceOptions } from "./worldBrainEvaluation";
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
  resolveFoods(world, timeline, createSpawnerRuntimeIndex(world.spawners, world.config));
  removeDeadSpawners(world, "payoff");
  for (const spawner of world.spawners) {
    spawner.learnedState = decayLearnedState(spawner.learnedState, spawner.genome.plasticityProfile);
    pruneDecisionTraces(spawner, world.tick, Math.max(world.config.maxHorizonTicksClampMax, world.config.foodHistoryTicks) + 5);
  }
  const plansBySpawnerId = new Map<number, CompiledBrainPlan>();
  for (const spawner of world.spawners) {
    const plan = ensureCompiledBrainPlan(spawner.genome);
    plansBySpawnerId.set(spawner.id, plan);
    applySpawnerUpkeep(world, spawner, plan);
  }
  removeDeadSpawners(world, "upkeep");

  const pendingFoodCount = createFoodRuntimeIndex(world.foods).pendingCount;
  const marketInputResolver = createMarketInputResolver(timeline, world.tick, pendingFoodCount);
  const newborns: SpawnerAgent[] = [];
  const contexts = buildSpawnerTickContexts(world, marketInputResolver, plansBySpawnerId);
  const decisions = buildBrainEvaluationJobs(world, contexts, options);
  const runner = options.brainEvaluationRunner ?? syncBrainEvaluationRunner;
  const results = runner.evaluateBatch(decisions.jobs);
  if (isPromise(results)) {
    return results.then((resolvedResults) =>
      finishSpawnerWorldStep(world, timeline, newborns, decisions.spawners, decisions.jobs, resolvedResults, plansBySpawnerId),
    );
  }
  finishSpawnerWorldStep(world, timeline, newborns, decisions.spawners, decisions.jobs, results, plansBySpawnerId);
}

function finishSpawnerWorldStep(
  world: SpawnerWorld,
  timeline: MarketTimeline,
  newborns: SpawnerAgent[],
  spawners: SpawnerAgent[],
  jobs: BrainEvaluationJob[],
  results: BrainEvaluationResult[],
  plansBySpawnerId: Map<number, CompiledBrainPlan>,
) {
  const orderedResults = orderedEvaluationResults(spawners, jobs, results);
  for (let index = 0; index < spawners.length; index += 1) {
    const spawner = spawners[index];
    const result = orderedResults[index];
    if (!spawner || !result?.evaluation) continue;
    const evaluation = result.evaluation;
    applyEvaluationResult(spawner, evaluation, jobs[index]);
    const decoded = decodeSpawnerOutputs(world, spawner, evaluation.outputs);
    const action = chooseSpawnerAction(world, spawner, decoded);
    let traceEvaluation: BrainEvaluation | undefined;
    const getTraceEvaluation = () => {
      traceEvaluation =
        traceEvaluation ??
        evaluationWithActivations(evaluation, jobs[index], plansBySpawnerId.get(spawner.id));
      return traceEvaluation;
    };
    const traceId = action === "wait" ? undefined : captureDecisionTrace({ spawner, tick: world.tick, evaluation: getTraceEvaluation(), decoded, action });
    trySpawnFood(world, spawner, decoded, timeline, action, traceId);
    if (!isSpawnerAlive(spawner, world.config)) continue;
    tryReproduceSpawner(world, spawner, decoded, newborns, () =>
      captureDecisionTrace({ spawner, tick: world.tick, evaluation: getTraceEvaluation(), decoded, action: "reproduce" }),
    );
  }

  world.spawners = world.spawners.concat(newborns);
  removeDeadSpawners(world, "action");

  const minTick = world.tick - world.config.foodHistoryTicks;
  world.foods = world.foods.filter((food) => food.status === "pending" || food.resolveTick >= minTick);
  recordTelemetry(world, plansBySpawnerId);
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === "function";
}

function evaluationWithActivations(evaluation: BrainEvaluation, job: BrainEvaluationJob | undefined, plan: CompiledBrainPlan | undefined) {
  if (evaluation.activeConnectionIds.length > 0) return evaluation;
  if (!job?.genome) return evaluation;
  return evaluateSpawnerBrainPure({
    genome: job.genome,
    learnedState: job.learnedState,
    hiddenState: job.hiddenState,
    inputs: job.inputs,
    plan,
    includeActivations: true,
    includePreviousState: false,
  });
}
