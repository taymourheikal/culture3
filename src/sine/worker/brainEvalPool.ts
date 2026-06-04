import { createSyncBrainEvaluationRunner } from "../spawner/brainEvaluationRunner";
import { compileBrainPlan, type CompiledBrainPlan } from "../spawner/brainPlan";
import { brainGenomeCacheSignature } from "../spawner/brainPlan";
import {
  compactGenomeKey,
  compactJobFromBrainEvaluationJob,
  materializeCompactBrainEvaluationResults,
} from "../spawner/compactBrainEvaluation";
import { BoundedCache } from "./boundedCache";
import { BRAIN_EVAL_CACHE_LIMIT, BRAIN_EVAL_DISABLE_COOLDOWN_MS, BRAIN_EVAL_FAILURE_DISABLE_THRESHOLD } from "./brainEvalConfig";
import type {
  BrainEvalWorkerRequest,
  BrainEvalWorkerResponse,
  BrainEvaluationJob,
  BrainEvaluationResult,
  BrainEvaluationRunner,
  BrainEvaluationRunnerBatchStats,
} from "../protocol/brainEvalProtocol";

export type BrainEvalPoolConfig = {
  workerCount: number;
  timeoutMs: number;
  /**
   * Diagnostic benchmark protocol only. Production selection currently leaves
   * nested browser-worker brain evaluation disabled because measured sync
   * evaluation is faster than both object and compact worker protocols.
   */
  protocol?: "object" | "compact";
  cacheLimit?: number;
  disableAfterFailures?: number;
  disableCooldownMs?: number;
  now?: () => number;
  workerFactory?: (index: number) => BrowserWorker;
};

type PendingShard = {
  finish: (message: BrainEvalWorkerResponse) => void;
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
  const protocol = config.protocol ?? "object";
  const sentGenomeKeysByWorker = workers.map(() => new BoundedCache<string, true>(cacheLimit));
  const sentCompactGenomeKeysByWorker = workers.map(() => new BoundedCache<string, true>(cacheLimit));
  const pending = new Map<number, PendingShard>();
  let nextRequestId = 1;
  let disposed = false;
  let consecutiveFailures = 0;
  let disabledUntil = 0;
  let parallelBatches = 0;
  let syncFallbackBatches = 0;
  let disabledBatches = 0;
  const transportTotals = createEmptyBatchStats(protocol);
  let lastBatchStats: BrainEvaluationRunnerBatchStats | undefined;

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
      else shard.finish(message);
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
    stats: () => ({ parallelBatches, syncFallbackBatches, disabledBatches, transport: cloneBatchStats(transportTotals), lastBatch: lastBatchStats ? cloneBatchStats(lastBatchStats) : undefined }),
    async evaluateBatch(jobs) {
      if (disposed || jobs.length === 0) return syncFallback.evaluateBatch(jobs);
      if (isDisabled()) {
        disabledBatches += 1;
        return syncFallback.evaluateBatch(jobs);
      }
      const batchStarted = nowMs();
      const batchStats = createEmptyBatchStats(protocol);
      batchStats.jobs = jobs.length;
      try {
        const shards = shardJobs(jobs, workers.length);
        batchStats.shards = shards.length;
        const results = await Promise.all(shards.map((shard, index) => sendShard(index % workers.length, workers[index % workers.length]!, shard, batchStats)));
        batchStats.batchWallMs = nowMs() - batchStarted;
        batchStats.estimatedTransportAndWaitMs = Math.max(0, batchStats.batchWallMs - batchStats.workerComputeMs - batchStats.resultMaterializationMs);
        addBatchStats(transportTotals, batchStats);
        lastBatchStats = cloneBatchStats(batchStats);
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
      resetBatchStats(transportTotals, protocol);
      lastBatchStats = undefined;
      for (const sentKeys of sentGenomeKeysByWorker) sentKeys.clear();
      for (const sentKeys of sentCompactGenomeKeysByWorker) sentKeys.clear();
    },

    dispose() {
      disposed = true;
      failAllPending(new Error("Brain evaluation pool disposed"));
      for (const worker of workers) worker.terminate();
      workers.length = 0;
    },
  };

  function sendShard(workerIndex: number, worker: BrowserWorker, jobs: BrainEvaluationJob[], batchStats: BrainEvaluationRunnerBatchStats) {
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise<BrainEvaluationResult[]>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Brain evaluation worker timed out"));
      }, config.timeoutMs);
      const shardStarted = nowMs();
      const prepared = protocol === "compact" ? compactShardRequest(workerIndex, requestId, jobs, batchStats) : objectShardRequest(workerIndex, requestId, jobs, batchStats);
      batchStats.requestPayloadKb += proxyPayloadKb(prepared.request);
      const finish = (message: BrainEvalWorkerResponse) => {
        batchStats.responsePayloadKb += proxyPayloadKb(message);
        batchStats.workerComputeMs += message.computeMs ?? 0;
        const materializeStarted = nowMs();
        const results = prepared.materialize(message);
        batchStats.resultMaterializationMs += nowMs() - materializeStarted;
        batchStats.estimatedTransportAndWaitMs += Math.max(0, nowMs() - shardStarted - (message.computeMs ?? 0));
        resolve(results);
      };
      pending.set(requestId, { finish, reject, timeoutId });
      const postStarted = nowMs();
      worker.postMessage(prepared.request);
      batchStats.requestPostMs += nowMs() - postStarted;
    });
  }

  function objectShardRequest(
    workerIndex: number,
    requestId: number,
    jobs: BrainEvaluationJob[],
    batchStats: BrainEvaluationRunnerBatchStats,
  ): { request: BrainEvalWorkerRequest; materialize: (message: BrainEvalWorkerResponse) => BrainEvaluationResult[] } {
    return {
      request: {
        type: "evaluateBrainShard",
        requestId,
        cacheLimit,
        protocol: "object",
        jobs: cacheGenomePayloads(workerIndex, jobs, batchStats),
      },
      materialize: (message) => message.results,
    };
  }

  function compactShardRequest(
    workerIndex: number,
    requestId: number,
    jobs: BrainEvaluationJob[],
    batchStats: BrainEvaluationRunnerBatchStats,
  ): { request: BrainEvalWorkerRequest; materialize: (message: BrainEvalWorkerResponse) => BrainEvaluationResult[] } {
    const planByJobIndex = new Map<number, CompiledBrainPlan>();
    return {
      request: {
        type: "evaluateBrainShard",
        requestId,
        cacheLimit,
        protocol: "compact",
        compactJobs: cacheCompactGenomePayloads(workerIndex, jobs, planByJobIndex, batchStats),
      },
      materialize: (message) => materializeCompactBrainEvaluationResults(message.compactResults ?? [], jobs, planByJobIndex),
    };
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
    for (const sentKeys of sentCompactGenomeKeysByWorker) sentKeys.clear();
  }

  function failAllPending(error: Error) {
    for (const [requestId, shard] of pending) {
      pending.delete(requestId);
      clearTimeout(shard.timeoutId);
      shard.reject(error);
    }
  }

  function cacheGenomePayloads(workerIndex: number, jobs: BrainEvaluationJob[], stats: BrainEvaluationRunnerBatchStats) {
    return jobs.map((job) => {
      if (!job.genome) return job;
      const genomeKey = `${job.sessionId}:${job.runGeneration}:${job.spawnerId}:${brainGenomeCacheSignature(job.genome)}`;
      const sentKeys = sentGenomeKeysByWorker[workerIndex];
      if (!sentKeys) {
        stats.objectGenomeSends += 1;
        return { ...job, genomeKey };
      }
      if (sentKeys.get(genomeKey)) {
        stats.objectGenomeCacheHits += 1;
        return { ...job, genomeKey, genome: undefined };
      }
      sentKeys.set(genomeKey, true);
      stats.objectGenomeSends += 1;
      return { ...job, genomeKey };
    });
  }

  function cacheCompactGenomePayloads(
    workerIndex: number,
    jobs: BrainEvaluationJob[],
    planByJobIndex: Map<number, CompiledBrainPlan>,
    stats: BrainEvaluationRunnerBatchStats,
  ) {
    return jobs.map((job) => {
      if (!job.genome) throw new Error(`Missing genome for compact brain evaluation job ${job.spawnerId}`);
      const plan = compileBrainPlan(job.genome);
      planByJobIndex.set(job.index, plan);
      const genomeKey = compactGenomeKey(job);
      const sentKeys = sentCompactGenomeKeysByWorker[workerIndex];
      if (!sentKeys) {
        stats.compactGenomeSends += 1;
        return compactJobFromBrainEvaluationJob(job, { genomeKey, plan });
      }
      if (sentKeys.get(genomeKey)) {
        stats.compactGenomeCacheHits += 1;
        return compactJobFromBrainEvaluationJob(job, { genomeKey, plan, includeGenome: false, includeGenomePayload: false });
      }
      sentKeys.set(genomeKey, true);
      stats.compactGenomeSends += 1;
      return compactJobFromBrainEvaluationJob(job, { genomeKey, plan });
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

function createEmptyBatchStats(protocol: "object" | "compact"): BrainEvaluationRunnerBatchStats {
  return {
    protocol,
    jobs: 0,
    shards: 0,
    batchWallMs: 0,
    requestPayloadKb: 0,
    responsePayloadKb: 0,
    requestPostMs: 0,
    workerComputeMs: 0,
    resultMaterializationMs: 0,
    estimatedTransportAndWaitMs: 0,
    objectGenomeSends: 0,
    objectGenomeCacheHits: 0,
    compactGenomeSends: 0,
    compactGenomeCacheHits: 0,
  };
}

function resetBatchStats(target: BrainEvaluationRunnerBatchStats, protocol: "object" | "compact") {
  Object.assign(target, createEmptyBatchStats(protocol));
}

function addBatchStats(target: BrainEvaluationRunnerBatchStats, source: BrainEvaluationRunnerBatchStats) {
  target.jobs += source.jobs;
  target.shards += source.shards;
  target.batchWallMs += source.batchWallMs;
  target.requestPayloadKb += source.requestPayloadKb;
  target.responsePayloadKb += source.responsePayloadKb;
  target.requestPostMs += source.requestPostMs;
  target.workerComputeMs += source.workerComputeMs;
  target.resultMaterializationMs += source.resultMaterializationMs;
  target.estimatedTransportAndWaitMs += source.estimatedTransportAndWaitMs;
  target.objectGenomeSends += source.objectGenomeSends;
  target.objectGenomeCacheHits += source.objectGenomeCacheHits;
  target.compactGenomeSends += source.compactGenomeSends;
  target.compactGenomeCacheHits += source.compactGenomeCacheHits;
}

function cloneBatchStats(stats: BrainEvaluationRunnerBatchStats): BrainEvaluationRunnerBatchStats {
  return { ...stats };
}

function proxyPayloadKb(value: unknown) {
  try {
    return JSON.stringify(value).length / 1024;
  } catch {
    return 0;
  }
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
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
