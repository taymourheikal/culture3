import { evaluateBrainJob, type BrainPlanCache } from "../spawner/brainEvaluationRunner";
import { evaluateCompactBrainJob } from "../spawner/compactBrainEvaluation";
import type { CompiledBrainPlan } from "../spawner/brainPlan";
import { BRAIN_EVAL_CACHE_LIMIT } from "./brainEvalConfig";
import { BoundedCache } from "./boundedCache";
import type {
  BrainEvalWorkerRequest,
  BrainEvalWorkerResponse,
  BrainEvaluationJob,
  CompactBrainEvaluationJob,
  CompactBrainGenomePayload,
} from "../protocol/brainEvalProtocol";
import type { SpawnerGenome } from "../spawner/types";

let cacheLimit = BRAIN_EVAL_CACHE_LIMIT;
let planCache: BrainPlanCache = new BoundedCache<string, CompiledBrainPlan>(cacheLimit);
let genomeCache = new BoundedCache<string, SpawnerGenome>(cacheLimit);
let compactGenomeCache = new BoundedCache<string, SpawnerGenome>(cacheLimit);
let compactGenomePayloadCache = new BoundedCache<string, CompactBrainGenomePayload>(cacheLimit);

const ctx = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<BrainEvalWorkerRequest>) => void) => void;
  postMessage: (message: BrainEvalWorkerResponse) => void;
};

ctx.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type !== "evaluateBrainShard") return;
  try {
    applyCacheLimit(message.cacheLimit);
    if (message.protocol === "compact") {
      const started = nowMs();
      const compactResults = (message.compactJobs ?? []).map((job) => evaluateCompactBrainJob(resolveCompactGenome(job), undefined, planCache));
      ctx.postMessage({
        type: "brainShardResult",
        requestId: message.requestId,
        protocol: "compact",
        results: [],
        compactResults,
        computeMs: nowMs() - started,
      });
      return;
    }
    const started = nowMs();
    const results = (message.jobs ?? []).map((job) => evaluateBrainJob(resolveGenome(job), planCache));
    ctx.postMessage({
      type: "brainShardResult",
      requestId: message.requestId,
      results,
      computeMs: nowMs() - started,
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
  compactGenomeCache = new BoundedCache<string, SpawnerGenome>(cacheLimit);
  compactGenomePayloadCache = new BoundedCache<string, CompactBrainGenomePayload>(cacheLimit);
}

function resolveGenome(job: BrainEvaluationJob): BrainEvaluationJob {
  if (job.genomeKey && job.genome) genomeCache.set(job.genomeKey, job.genome);
  if (job.genome) return job;
  const genome = job.genomeKey ? genomeCache.get(job.genomeKey) : undefined;
  return genome ? { ...job, genome } : job;
}

function resolveCompactGenome(job: CompactBrainEvaluationJob): CompactBrainEvaluationJob {
  if (job.genomePayload) compactGenomePayloadCache.set(job.genomeKey, job.genomePayload);
  if (job.genomeKey && job.genome) compactGenomeCache.set(job.genomeKey, job.genome);
  if (job.genome) return job;
  const genome = compactGenomeCache.get(job.genomeKey);
  return genome ? { ...job, genome } : job;
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
