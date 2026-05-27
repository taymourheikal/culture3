import type { BrainEvaluation } from "../spawner/brain";
import type { SpawnerGenome, SpawnerLearnedState } from "../spawner/types";

export type BrainEvaluationRunGeneration = number;

export type BrainEvaluationBatchIdentity = {
  sessionId: number;
  runGeneration: BrainEvaluationRunGeneration;
  advanceEpoch?: number;
  batchId: number;
  tick: number;
};

export type BrainEvaluationJob = BrainEvaluationBatchIdentity & {
  index: number;
  spawnerId: number;
  genome?: SpawnerGenome;
  genomeKey?: string;
  learnedState: SpawnerLearnedState;
  hiddenState: Record<number, number>;
  inputs: number[];
  includeActivations?: boolean;
  includePreviousState?: boolean;
};

export type BrainEvaluationResult = BrainEvaluationBatchIdentity & {
  index: number;
  spawnerId: number;
  evaluation?: BrainEvaluation;
  error?: string;
};

export type BrainEvaluationRunner = {
  mode?: BrainEvaluationMode;
  currentMode?: () => BrainEvaluationMode;
  stats?: () => BrainEvaluationRunnerStats;
  evaluateBatch: (jobs: BrainEvaluationJob[]) => BrainEvaluationResult[] | Promise<BrainEvaluationResult[]>;
  reset?: () => void;
  dispose?: () => void;
};

export type BrainEvaluationMode = "sync" | "parallel";

export type BrainEvaluationRunnerStats = {
  parallelBatches: number;
  syncFallbackBatches: number;
  disabledBatches: number;
};

export type BrainEvalWorkerRequest = {
  type: "evaluateBrainShard";
  requestId: number;
  cacheLimit?: number;
  jobs: BrainEvaluationJob[];
};

export type BrainEvalWorkerResponse = {
  type: "brainShardResult";
  requestId: number;
  results: BrainEvaluationResult[];
  error?: string;
};
