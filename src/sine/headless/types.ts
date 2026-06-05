import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { SpawnerAgent, SpawnerConfig, SpawnerFood } from "../spawnerSimulation";

export const HEADLESS_SNAPSHOT_SCHEMA_VERSION = 1;
export const DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL = 25;

export type HeadlessLifecycleKind = "birth" | "reproduction" | "death";
export type HeadlessSnapshotReason = "birth" | "reproduction" | "death" | "trade_interval" | "final";
export type HeadlessRunStatus = "running" | "completed" | "cancelled" | "failed";
export type HeadlessRunTerminationReason = "target" | "market_end" | "population_extinct" | "cancelled" | "error" | "interrupted";

export type HeadlessSinkMethod =
  | "writeRunStart"
  | "writeRunCompletion"
  | "writeRunCheckpoint"
  | "writeAgent"
  | "markAgentEligible"
  | "markAgentDead"
  | "writeAgentEvent"
  | "writeCoreTrade"
  | "writeTrade"
  | "writeSnapshot"
  | "writeMetrics";

export type HeadlessTimingBucket = {
  calls: number;
  ms: number;
};

export type HeadlessTimingChunk = {
  startTick: number;
  endTick: number;
  processedTicks: number;
  population: number;
  chunkMs: number;
  advanceTotalMs: number;
  recorderEventMs: number;
  sinkWriteMs: number;
  sinkEnqueueMs: number;
  sinkFlushMs: number;
  sinkBufferedRows: number;
  simulationCoreEstimateMs: number;
  ticksPerSecond: number;
};

export type HeadlessTimingSnapshot = {
  runMs: number;
  chunks: number;
  simulatedTicks: number;
  advanceTotalMs: number;
  recorderEventMs: number;
  recorderEventCount: number;
  recorderFounderMs: number;
  recorderFinalizeMs: number;
  checkpointMs: number;
  candleLoadMs: number;
  sinkWriteMs: number;
  sinkWrites: number;
  sinkEnqueueMs: number;
  sinkEnqueues: number;
  sinkFlushMs: number;
  sinkFlushes: number;
  sinkBufferedRows: number;
  sinkMethods: Partial<Record<HeadlessSinkMethod, HeadlessTimingBucket>>;
  topSinkMethod: (HeadlessTimingBucket & { method: HeadlessSinkMethod }) | null;
  latestChunk: HeadlessTimingChunk | null;
};

export type HeadlessRunRecord = {
  id: string;
  createdAt: string;
  status: HeadlessRunStatus;
  seed: number;
  tick: number;
  targetTicks?: number;
  checkpointIntervalTicks?: number;
  marketSource: MarketRuntimeConfig["source"];
  minimumResolvedTrades: number;
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
};

export type HeadlessRunCompletionRecord = {
  id: string;
  completedAt: string;
  status: Exclude<HeadlessRunStatus, "running">;
  tick: number;
  terminationReason: HeadlessRunTerminationReason;
  error?: string;
};

export type HeadlessRunCheckpointRecord = {
  runId: string;
  tick: number;
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
  population: number;
  eligibleAgents: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  hitRate: number;
  cumulativePayoff: number;
  averagePayoff: number;
  tradesWritten: number;
  snapshotsWritten: number;
  createdAt: string;
};

export type HeadlessRunProgressRecord = {
  runId: string;
  tick: number;
  population: number;
  createdAt: string;
  timing?: HeadlessTimingSnapshot;
};

export type HeadlessAgentRecord = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  generation: number;
  parentSpawnerId: number | null;
  birthTick: number;
  birthSourceTimestamp: number | null;
  birthSourceDatetime: string | null;
  eligible: boolean;
  spawner: SpawnerAgent;
};

export type HeadlessAgentDeathRecord = {
  runId: string;
  spawnerId: number;
  deathTick: number;
  deathSourceTimestamp: number | null;
  deathSourceDatetime: string | null;
};

export type HeadlessAgentEligibilityRecord = {
  runId: string;
  spawnerId: number;
  eligible: boolean;
  eligibleTick: number;
  resolvedTrades?: number;
};

export type HeadlessAgentEventRecord = {
  runId: string;
  eventId: number | null;
  kind: HeadlessLifecycleKind;
  spawnerId: number;
  lineageId: number;
  tick: number;
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
  childSpawnerId?: number;
  parentSpawnerId?: number;
  event: Record<string, unknown>;
};

export type HeadlessTradeRecord = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  foodId: number;
  spawnTick: number;
  resolveTick: number;
  direction: SpawnerFood["direction"];
  strength: number;
  horizonTicks: number;
  entrySignal: number;
  exitSignal: number | null;
  entryPayoffScale: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
  exitSourceTimestamp: number | null;
  exitSourceDatetime: string | null;
  status: SpawnerFood["status"];
  payoff: number | null;
  food: SpawnerFood;
};

export type HeadlessAgentSnapshotRecord = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  generation: number;
  tick: number;
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
  reason: HeadlessSnapshotReason;
  schemaVersion: number;
  snapshot: SpawnerAgent;
};

export type HeadlessAgentMetricsRecord = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  generation: number;
  parentSpawnerId: number | null;
  birthTick: number;
  birthSourceTimestamp: number | null;
  birthSourceDatetime: string | null;
  deathTick: number | null;
  deathSourceTimestamp: number | null;
  deathSourceDatetime: string | null;
  lifespanTicks: number | null;
  children: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  hitRate: number;
  cumulativePayoff: number;
  averagePayoff: number;
  averageWin: number;
  averageLoss: number;
  payoffStdDev: number;
  longTrades: number;
  shortTrades: number;
  longAveragePayoff: number;
  shortAveragePayoff: number;
  averageHorizonTicks: number;
  averageStrength: number;
  lastResolvedTick: number | null;
};

export type HeadlessRecordSink = {
  writeRunStart(record: HeadlessRunRecord): void;
  writeRunCompletion(record: HeadlessRunCompletionRecord): void;
  writeRunCheckpoint?(record: HeadlessRunCheckpointRecord): void;
  writeAgent(record: HeadlessAgentRecord): void;
  markAgentEligible(record: HeadlessAgentEligibilityRecord): void;
  markAgentDead(record: HeadlessAgentDeathRecord): void;
  writeAgentEvent(record: HeadlessAgentEventRecord): void;
  writeCoreTrade?(record: HeadlessTradeRecord): void;
  writeTrade(record: HeadlessTradeRecord): void;
  writeSnapshot(record: HeadlessAgentSnapshotRecord): void;
  // Transient compatibility record. Unified DB sinks intentionally derive stats from core rows instead of storing these permanently.
  writeMetrics(record: HeadlessAgentMetricsRecord): void;
};

export type HeadlessRecordBatch = {
  runStarts: HeadlessRunRecord[];
  runCompletions: HeadlessRunCompletionRecord[];
  runCheckpoints: HeadlessRunCheckpointRecord[];
  agents: HeadlessAgentRecord[];
  agentEligibilities: HeadlessAgentEligibilityRecord[];
  agentDeaths: HeadlessAgentDeathRecord[];
  agentEvents: HeadlessAgentEventRecord[];
  coreTrades: HeadlessTradeRecord[];
  trades: HeadlessTradeRecord[];
  snapshots: HeadlessAgentSnapshotRecord[];
  // Transient compatibility records for memory sinks and legacy API shape.
  metrics: HeadlessAgentMetricsRecord[];
};

export type HeadlessBatchRecordSink = HeadlessRecordSink & {
  writeBatch?: (batch: HeadlessRecordBatch) => void;
};
