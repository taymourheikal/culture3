import { evaluateBrainJob, type BrainPlanCache } from "../spawner/brainEvaluationRunner";
import type { CompiledBrainPlan } from "../spawner/brainPlan";
import { BRAIN_EVAL_CACHE_LIMIT } from "./brainEvalConfig";
import { BoundedCache } from "./boundedCache";
import type { BrainEvalWorkerRequest, BrainEvalWorkerResponse, BrainEvaluationJob } from "../protocol/brainEvalProtocol";
import type { SpawnerGenome } from "../spawner/types";

let cacheLimit = BRAIN_EVAL_CACHE_LIMIT;
let planCache: BrainPlanCache = new BoundedCache<string, CompiledBrainPlan>(cacheLimit);
let genomeCache = new BoundedCache<string, SpawnerGenome>(cacheLimit);

const ctx = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<BrainEvalWorkerRequest>) => void) => void;
  postMessage: (message: BrainEvalWorkerResponse) => void;
};

ctx.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type !== "evaluateBrainShard") return;
  try {
    applyCacheLimit(message.cacheLimit);
    ctx.postMessage({
      type: "brainShardResult",
      requestId: message.requestId,
      results: message.jobs.map((job) => evaluateBrainJob(resolveGenome(job), planCache)),
    });
  } catch (error) {
    ctx.postMessage({
      type: "brainShardResult",
      requestId: message.requestId,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

function applyCacheLimit(nextLimit: number | undefined) {
  if (!Number.isFinite(nextLimit) || nextLimit === undefined) return;
  const sanitized = Math.max(0, Math.floor(nextLimit));
  if (sanitized === cacheLimit) return;
  cacheLimit = sanitized;
  planCache = new BoundedCache<string, CompiledBrainPlan>(cacheLimit);
  genomeCache = new BoundedCache<string, SpawnerGenome>(cacheLimit);
}

function resolveGenome(job: BrainEvaluationJob): BrainEvaluationJob {
  if (job.genomeKey && job.genome) genomeCache.set(job.genomeKey, job.genome);
  if (job.genome) return job;
  const genome = job.genomeKey ? genomeCache.get(job.genomeKey) : undefined;
  return genome ? { ...job, genome } : job;
}
