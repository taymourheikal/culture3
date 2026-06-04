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

export type CompactCompiledBrainPlanPayload = {
  signature: string;
  unitIds: number[];
  activeConnectionIds: number[];
  activeUnitCount: number;
  activeConnectionCount: number;
  activeLayerCount: number;
};

export type CompactBrainGenomePayload = {
  genomeKey: string;
  planSignature: string;
  structuralPlan: CompactCompiledBrainPlanPayload;
  baseConnectionWeights: number[];
  outputBiases: number[];
  updateGateBiases: number[];
  resetGateBiases: number[];
  candidateGateBiases: number[];
  maxLearnedDelta: number;
};

export type CompactLearnedStatePayload = {
  connectionDeltasByPlanIndex: number[];
  outputBiasDeltas: number[];
  updateGateBiasDeltasByUnitIndex: number[];
  resetGateBiasDeltasByUnitIndex: number[];
  candidateGateBiasDeltasByUnitIndex: number[];
  recentLearningSignal: number;
  learningUpdateCount: number;
  reproductionLearningCount: number;
};

export type CompactBrainTraceStatePayload = {
  previousState: number[];
  inputs: number[];
};

export type CompactBrainEvaluationJob = BrainEvaluationBatchIdentity & {
  index: number;
  spawnerId: number;
  genomeKey: string;
  genome?: SpawnerGenome;
  genomePayload?: CompactBrainGenomePayload;
  learnedState: CompactLearnedStatePayload;
  hiddenState: number[];
  inputs: number[];
  includeActivations?: boolean;
  includePreviousState?: boolean;
};

export type CompactBrainEvaluationPayload = {
  outputs: number[];
  currentState: number[];
  previousState?: number[];
  activeConnectionIds?: number[];
  connectionActivations?: BrainEvaluation["connectionActivations"];
  runtimeTraceState?: CompactBrainTraceStatePayload;
};

export type CompactBrainEvaluationResult = BrainEvaluationBatchIdentity & {
  index: number;
  spawnerId: number;
  evaluation?: CompactBrainEvaluationPayload;
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

export type BrainEvaluationRunnerBatchStats = {
  protocol: "object" | "compact";
  jobs: number;
  shards: number;
  batchWallMs: number;
  requestPayloadKb: number;
  responsePayloadKb: number;
  requestPostMs: number;
  workerComputeMs: number;
  resultMaterializationMs: number;
  estimatedTransportAndWaitMs: number;
  objectGenomeSends: number;
  objectGenomeCacheHits: number;
  compactGenomeSends: number;
  compactGenomeCacheHits: number;
};

export type BrainEvaluationRunnerStats = {
  parallelBatches: number;
  syncFallbackBatches: number;
  disabledBatches: number;
  transport?: BrainEvaluationRunnerBatchStats;
  lastBatch?: BrainEvaluationRunnerBatchStats;
};

export type BrainEvalWorkerRequest = {
  type: "evaluateBrainShard";
  requestId: number;
  cacheLimit?: number;
  protocol?: "object" | "compact";
  jobs?: BrainEvaluationJob[];
  compactJobs?: CompactBrainEvaluationJob[];
};

export type BrainEvalWorkerResponse = {
  type: "brainShardResult";
  requestId: number;
  protocol?: "object" | "compact";
  results: BrainEvaluationResult[];
  compactResults?: CompactBrainEvaluationResult[];
  computeMs?: number;
  error?: string;
};
