import { createSyncBrainEvaluationRunner } from "../spawner/brainEvaluationRunner";
import { brainGenomeCacheSignature } from "../spawner/brainPlan";
import { BoundedCache } from "./boundedCache";
import { BRAIN_EVAL_CACHE_LIMIT, BRAIN_EVAL_DISABLE_COOLDOWN_MS, BRAIN_EVAL_FAILURE_DISABLE_THRESHOLD } from "./brainEvalConfig";
import type {
  BrainEvalWorkerRequest,
  BrainEvalWorkerResponse,
  BrainEvaluationJob,
  BrainEvaluationResult,
  BrainEvaluationRunner,
} from "../protocol/brainEvalProtocol";

export type BrainEvalPoolConfig = {
  workerCount: number;
  timeoutMs: number;
  cacheLimit?: number;
  disableAfterFailures?: number;
  disableCooldownMs?: number;
  now?: () => number;
  workerFactory?: (index: number) => BrowserWorker;
};

type PendingShard = {
  resolve: (results: BrainEvaluationResult[]) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export interface BrowserWorker {
  addEventListener(type: "message", listener: (event: { data: BrainEvalWorkerResponse }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  addEventListener(type: "messageerror", listener: () => void): void;
  postMessage: (message: BrainEvalWorkerRequest) => void;
  terminate: () => void;
}

type BrowserWorkerConstructor = new (url: URL, options: { type: "module" }) => BrowserWorker;

export function createBrainEvalPool(config: BrainEvalPoolConfig): BrainEvaluationRunner {
  const syncFallback = createSyncBrainEvaluationRunner();
  const workers = createWorkers(config.workerCount);
  const cacheLimit = Math.max(0, Math.floor(config.cacheLimit ?? BRAIN_EVAL_CACHE_LIMIT));
  const disableAfterFailures = Math.max(1, Math.floor(config.disableAfterFailures ?? BRAIN_EVAL_FAILURE_DISABLE_THRESHOLD));
  const disableCooldownMs = Math.max(0, config.disableCooldownMs ?? BRAIN_EVAL_DISABLE_COOLDOWN_MS);
  const currentTime = config.now ?? (() => performance.now());
  const sentGenomeKeysByWorker = workers.map(() => new BoundedCache<string, true>(cacheLimit));
  const pending = new Map<number, PendingShard>();
  let nextRequestId = 1;
  let disposed = false;
  let consecutiveFailures = 0;
  let disabledUntil = 0;
  let parallelBatches = 0;
  let syncFallbackBatches = 0;
  let disabledBatches = 0;

  if (workers.length === 0) return syncFallback;

  for (const worker of workers) {
    worker.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type !== "brainShardResult") return;
      const shard = pending.get(message.requestId);
      if (!shard) return;
      pending.delete(message.requestId);
      clearTimeout(shard.timeoutId);
      if (message.error) shard.reject(new Error(message.error));
      else shard.resolve(message.results);
    });
    worker.addEventListener("error", (event) => {
      failAllPending(new Error(event.message || "Brain evaluation worker failed"));
    });
    worker.addEventListener("messageerror", () => {
      failAllPending(new Error("Brain evaluation worker sent an unreadable message"));
    });
  }

  return {
    mode: "parallel",
    currentMode,
    stats: () => ({ parallelBatches, syncFallbackBatches, disabledBatches }),
    async evaluateBatch(jobs) {
      if (disposed || jobs.length === 0) return syncFallback.evaluateBatch(jobs);
      if (isDisabled()) {
        disabledBatches += 1;
        return syncFallback.evaluateBatch(jobs);
      }
      try {
        const shards = shardJobs(jobs, workers.length);
        const results = await Promise.all(shards.map((shard, index) => sendShard(index % workers.length, workers[index % workers.length]!, shard)));
        consecutiveFailures = 0;
        parallelBatches += 1;
        return results.flat();
      } catch {
        clearSentGenomeKeys();
        recordFailure();
        syncFallbackBatches += 1;
        return syncFallback.evaluateBatch(jobs);
      }
    },

    reset() {
      failAllPending(new Error("Brain evaluation pool reset"));
      consecutiveFailures = 0;
      disabledUntil = 0;
      parallelBatches = 0;
      syncFallbackBatches = 0;
      disabledBatches = 0;
      for (const sentKeys of sentGenomeKeysByWorker) sentKeys.clear();
    },

    dispose() {
      disposed = true;
      failAllPending(new Error("Brain evaluation pool disposed"));
      for (const worker of workers) worker.terminate();
      workers.length = 0;
    },
  };

  function sendShard(workerIndex: number, worker: BrowserWorker, jobs: BrainEvaluationJob[]) {
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise<BrainEvaluationResult[]>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Brain evaluation worker timed out"));
      }, config.timeoutMs);
      pending.set(requestId, { resolve, reject, timeoutId });
      const request: BrainEvalWorkerRequest = { type: "evaluateBrainShard", requestId, cacheLimit, jobs: cacheGenomePayloads(workerIndex, jobs) };
      worker.postMessage(request);
    });
  }

  function currentMode() {
    return isDisabled() ? "sync" : "parallel";
  }

  function isDisabled() {
    if (disabledUntil <= 0) return false;
    if (currentTime() < disabledUntil) return true;
    disabledUntil = 0;
    consecutiveFailures = 0;
    return false;
  }

  function recordFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= disableAfterFailures) disabledUntil = currentTime() + disableCooldownMs;
  }

  function clearSentGenomeKeys() {
    for (const sentKeys of sentGenomeKeysByWorker) sentKeys.clear();
  }

  function failAllPending(error: Error) {
    for (const [requestId, shard] of pending) {
      pending.delete(requestId);
      clearTimeout(shard.timeoutId);
      shard.reject(error);
    }
  }

  function cacheGenomePayloads(workerIndex: number, jobs: BrainEvaluationJob[]) {
    return jobs.map((job) => {
      if (!job.genome) return job;
      const genomeKey = `${job.sessionId}:${job.runGeneration}:${job.spawnerId}:${brainGenomeCacheSignature(job.genome)}`;
      const sentKeys = sentGenomeKeysByWorker[workerIndex];
      if (!sentKeys) return { ...job, genomeKey };
      if (sentKeys.get(genomeKey)) return { ...job, genomeKey, genome: undefined };
      sentKeys.set(genomeKey, true);
      return { ...job, genomeKey };
    });
  }

  function createWorkers(workerCount: number) {
    if (config.workerFactory) return Array.from({ length: Math.max(0, Math.floor(workerCount)) }, (_, index) => config.workerFactory?.(index)).filter(Boolean) as BrowserWorker[];
    return createBrowserWorkers(workerCount);
  }
}

function createBrowserWorkers(workerCount: number) {
  const WorkerCtor = (globalThis as { Worker?: BrowserWorkerConstructor }).Worker;
  if (!WorkerCtor) return [];
  const count = Math.max(0, Math.floor(workerCount));
  const workers: BrowserWorker[] = [];
  for (let index = 0; index < count; index += 1) {
    try {
      workers.push(new WorkerCtor(new URL("./brainEval.worker.ts", import.meta.url), { type: "module" }));
    } catch {
      for (const worker of workers) worker.terminate();
      return [];
    }
  }
  return workers;
}

function shardJobs(jobs: BrainEvaluationJob[], shardCount: number) {
  const count = Math.max(1, Math.min(shardCount, jobs.length));
  const size = Math.ceil(jobs.length / count);
  const shards: BrainEvaluationJob[][] = [];
  for (let index = 0; index < jobs.length; index += size) {
    shards.push(jobs.slice(index, index + size));
  }
  return shards;
}
