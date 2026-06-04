import { evaluateSpawnerBrainPure } from "./brain";
import { brainPlanSignature, compileBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import {
  compactJobFromBrainEvaluationJob,
  evaluateCompactBrainJob,
  materializeCompactBrainEvaluationResults,
} from "./compactBrainEvaluation";
import type { BrainEvaluationJob, BrainEvaluationResult, BrainEvaluationRunner } from "../protocol/brainEvalProtocol";

export type BrainPlanCache = {
  size: number;
  get: (key: string) => CompiledBrainPlan | undefined;
  set: (key: string, value: CompiledBrainPlan) => unknown;
};

export function evaluateBrainJob(job: BrainEvaluationJob, planCache?: BrainPlanCache): BrainEvaluationResult {
  try {
    if (!job.genome) throw new Error(`Missing genome for brain evaluation job ${job.spawnerId}`);
    const plan = planCache ? cachedPlan(job, planCache) : undefined;
    const evaluation = evaluateSpawnerBrainPure({
      genome: job.genome,
      learnedState: job.learnedState,
      hiddenState: job.hiddenState,
      inputs: job.inputs,
      plan,
      includeActivations: job.includeActivations,
      includePreviousState: job.includePreviousState,
    });
    return {
      sessionId: job.sessionId,
      runGeneration: job.runGeneration,
      advanceEpoch: job.advanceEpoch,
      batchId: job.batchId,
      tick: job.tick,
      index: job.index,
      spawnerId: job.spawnerId,
      evaluation,
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

function cachedPlan(job: BrainEvaluationJob, planCache: BrainPlanCache) {
  if (!job.genome) throw new Error(`Missing genome for brain evaluation job ${job.spawnerId}`);
  const signature = brainPlanSignature(job.genome);
  const cached = planCache.get(signature);
  if (cached) return cached;
  const plan = compileBrainPlan(job.genome, signature);
  planCache.set(signature, plan);
  return plan;
}

export function createSyncBrainEvaluationRunner(): BrainEvaluationRunner {
  return {
    mode: "sync",
    currentMode: () => "sync",
    stats: () => ({ parallelBatches: 0, syncFallbackBatches: 0, disabledBatches: 0 }),
    evaluateBatch(jobs: BrainEvaluationJob[]) {
      return jobs.map((job) => evaluateBrainJob(job));
    },
  };
}

export function createCompactSyncBrainEvaluationRunner(): BrainEvaluationRunner {
  return {
    mode: "sync",
    currentMode: () => "sync",
    stats: () => ({ parallelBatches: 0, syncFallbackBatches: 0, disabledBatches: 0 }),
    evaluateBatch(jobs: BrainEvaluationJob[]) {
      const planByJobIndex = new Map<number, CompiledBrainPlan>();
      const compactJobs = jobs.map((job) => {
        if (!job.genome) throw new Error(`Missing genome for compact brain evaluation job ${job.spawnerId}`);
        const plan = compileBrainPlan(job.genome);
        planByJobIndex.set(job.index, plan);
        return structuredClone(compactJobFromBrainEvaluationJob(job, { plan }));
      });
      const compactResults = compactJobs.map((job) => evaluateCompactBrainJob(job));
      return materializeCompactBrainEvaluationResults(structuredClone(compactResults), jobs, planByJobIndex);
    },
  };
}
