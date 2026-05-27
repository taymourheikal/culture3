import { createSyncBrainEvaluationRunner } from "../spawnerSimulation";
import type { BrainEvaluationResult, BrainEvaluationRunner } from "../protocol/brainEvalProtocol";
import { createBrainEvalPool } from "./brainEvalPool";
import { BRAIN_EVAL_TIMEOUT_MS, defaultBrainEvalWorkerCount, MIN_PARALLEL_BRAIN_EVAL_JOBS } from "./brainEvalConfig";

const STALE_BRAIN_EVALUATION_MESSAGE = "Stale brain evaluation batch";

export type BrainEvaluationFreshness = {
  activeSessionId: number;
  generation: number;
  epoch: number;
  population: number;
  isFresh: (activeSessionId: number, generation: number, epoch: number) => boolean;
};

export function createBrainEvaluationCoordinator() {
  const syncRunner = createSyncBrainEvaluationRunner();
  const parallelRunner = createBrainEvalPool({
    workerCount: defaultBrainEvalWorkerCount(),
    timeoutMs: BRAIN_EVAL_TIMEOUT_MS,
  });

  function runnerForPopulation(population: number) {
    return population >= MIN_PARALLEL_BRAIN_EVAL_JOBS ? parallelRunner : syncRunner;
  }

  function verifyFreshResults(results: BrainEvaluationResult[], freshness: BrainEvaluationFreshness) {
    if (!freshness.isFresh(freshness.activeSessionId, freshness.generation, freshness.epoch)) throw new Error(STALE_BRAIN_EVALUATION_MESSAGE);
    return results;
  }

  return {
    currentMode(population: number) {
      const runner = runnerForPopulation(population);
      return runner.currentMode?.() ?? runner.mode ?? "sync";
    },
    guardedRunner(freshness: BrainEvaluationFreshness): BrainEvaluationRunner {
      const runner = runnerForPopulation(freshness.population);
      return {
        mode: runner.mode,
        currentMode: () => runner.currentMode?.() ?? runner.mode ?? "sync",
        evaluateBatch(jobs) {
          const result = runner.evaluateBatch(jobs);
          if (isPromise(result)) return result.then((results) => verifyFreshResults(results, freshness));
          return verifyFreshResults(result, freshness);
        },
      };
    },
    reset() {
      parallelRunner.reset?.();
    },
    dispose() {
      parallelRunner.dispose?.();
    },
  };
}

export function isStaleBrainEvaluationError(error: unknown) {
  return error instanceof Error && error.message === STALE_BRAIN_EVALUATION_MESSAGE;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === "function";
}
