import { alignedHiddenState, applyBrainEvaluation } from "./brain";
import { ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import { clamp } from "./math";
import type { createMarketInputResolver } from "./marketInputs";
import { populationRoomRatio } from "./reproductionPressure";
import type { SpawnerAgent, SpawnerWorld } from "./types";
import type { BrainEvaluationJob, BrainEvaluationResult, BrainEvaluationRunner } from "../protocol/brainEvalProtocol";

export type SpawnerAdvanceOptions = {
  brainEvaluationRunner?: BrainEvaluationRunner;
  sessionId?: number;
  runGeneration?: number;
  advanceEpoch?: number;
  batchId?: number;
};

export type SpawnerTickContext = {
  index: number;
  spawner: SpawnerAgent;
  plan: CompiledBrainPlan;
  inputs: number[];
};

export function buildSpawnerTickContexts(
  world: SpawnerWorld,
  marketInputResolver: ReturnType<typeof createMarketInputResolver>,
  plansBySpawnerId: Map<number, CompiledBrainPlan> = new Map(),
) {
  return world.spawners.map((spawner, index): SpawnerTickContext => {
    const plan = plansBySpawnerId.get(spawner.id) ?? ensureCompiledBrainPlan(spawner.genome);
    return {
      index,
      spawner,
      plan,
      inputs: buildSpawnerInputs(world, spawner, marketInputResolver),
    };
  });
}

export function buildBrainEvaluationJobs(
  world: SpawnerWorld,
  contexts: SpawnerTickContext[],
  options: SpawnerAdvanceOptions,
) {
  const jobs: BrainEvaluationJob[] = contexts.map((context) => ({
    sessionId: options.sessionId ?? 0,
    runGeneration: options.runGeneration ?? 0,
    advanceEpoch: options.advanceEpoch ?? 0,
    batchId: options.batchId ?? world.tick,
    tick: world.tick,
    index: context.index,
    spawnerId: context.spawner.id,
    genome: context.spawner.genome,
    learnedState: context.spawner.learnedState,
    hiddenState: context.spawner.hiddenState,
    inputs: context.inputs,
    includeActivations: false,
    includePreviousState: false,
  }));
  return { spawners: contexts.map((context) => context.spawner), jobs };
}

export function applyEvaluationResult(spawner: SpawnerAgent, evaluation: BrainEvaluationResult["evaluation"], job: BrainEvaluationJob | undefined) {
  if (!evaluation) return;
  if (job?.includePreviousState === false) {
    spawner.hiddenState = { ...alignedHiddenState(spawner.genome, spawner.hiddenState), ...evaluation.currentState };
    return;
  }
  applyBrainEvaluation(spawner, evaluation);
}

export function orderedEvaluationResults(spawners: SpawnerAgent[], jobs: BrainEvaluationJob[], results: BrainEvaluationResult[]) {
  if (results.length !== spawners.length) throw new Error(`Brain evaluation result count mismatch: expected ${spawners.length}, got ${results.length}`);
  const ordered = [...results].sort((left, right) => left.index - right.index);
  for (let index = 0; index < spawners.length; index += 1) {
    const result = ordered[index];
    const spawner = spawners[index];
    const job = jobs[index];
    if (!result || !spawner) throw new Error(`Missing brain evaluation result at index ${index}`);
    if (
      !job ||
      result.index !== index ||
      result.spawnerId !== spawner.id ||
      result.sessionId !== job.sessionId ||
      result.runGeneration !== job.runGeneration ||
      result.advanceEpoch !== job.advanceEpoch ||
      result.batchId !== job.batchId ||
      result.tick !== job.tick
    ) {
      throw new Error(`Brain evaluation result identity mismatch at index ${index}`);
    }
    if (result.error || !result.evaluation) throw new Error(result.error ?? `Missing brain evaluation payload at index ${index}`);
  }
  return ordered;
}

export function buildSpawnerInputs(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  marketInputResolver: ReturnType<typeof createMarketInputResolver>,
) {
  const marketInputs = marketInputResolver.resolve(spawner.genome.perception);
  return [
    ...marketInputs,
    energyRatioInput(spawner.energy, world.config.reproductionEnergy),
    clamp(spawner.health / 100, 0, 1),
    populationRoomRatio(world.spawners.length, world.config.maxSpawners),
  ];
}

export function energyRatioInput(energy: number, reproductionEnergy: number) {
  if (reproductionEnergy > 0) return clamp(energy / reproductionEnergy, -1, 2);
  if (energy > 0) return 2;
  if (energy < 0) return -1;
  return 0;
}
