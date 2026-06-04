import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { SpawnerAgent, SpawnerConfig, SpawnerFood } from "../spawnerSimulation";
import { getSineJson, postSineJson } from "../sineApi";
import type { HeadlessRunCheckpointRecord, HeadlessRunTerminationReason, HeadlessSnapshotReason, HeadlessTimingSnapshot } from "./types";

export type SineHeadlessJobStatus = "running" | "cancel_requested" | "completed" | "cancelled" | "failed";

export type SineHeadlessJob = {
  runId: string;
  status: SineHeadlessJobStatus;
  targetTicks: number;
  tick: number;
  checkpointIntervalTicks: number;
  minimumResolvedTrades: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelRequested: boolean;
  latestCheckpoint: HeadlessRunCheckpointRecord | null;
  population: number | null;
  error: string | null;
  terminationReason: HeadlessRunTerminationReason | null;
  timing?: HeadlessTimingSnapshot;
  active: boolean;
};

export type SineHeadlessRunRequest = {
  runId?: string;
  ticks: number;
  seed: number;
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  minimumResolvedTrades: number;
  checkpointIntervalTicks: number;
};

export type SineHeadlessRunRow = {
  id: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  seed: number;
  tick: number;
  target_ticks: number | null;
  checkpoint_interval_ticks: number | null;
  market_source: string;
  minimum_resolved_trades: number;
  termination_reason: HeadlessRunTerminationReason | null;
  error: string | null;
};

export type SineHeadlessCounts = {
  runs: number;
  agents: number;
  events: number;
  trades: number;
  snapshots: number;
  metrics: number;
  checkpoints: number;
};

export const SINE_HEADLESS_AGENT_SORT_KEYS = [
  "spawnerId",
  "lineageId",
  "generation",
  "birthTick",
  "deathTick",
  "lifespanTicks",
  "children",
  "resolvedTrades",
  "hitRate",
  "cumulativePayoff",
  "averagePayoff",
  "payoffStdDev",
  "averageHorizonTicks",
  "averageStrength",
] as const;

export const SINE_HEADLESS_LINEAGE_SORT_KEYS = [
  "lineageId",
  "totalAgents",
  "eligibleAgents",
  "aliveAgents",
  "maxGeneration",
  "children",
  "resolvedTrades",
  "hitRate",
  "cumulativePayoff",
  "averagePayoff",
  "bestAveragePayoff",
] as const;

export type SineHeadlessAgentSortKey = (typeof SINE_HEADLESS_AGENT_SORT_KEYS)[number];

export type SineHeadlessLineageSortKey = (typeof SINE_HEADLESS_LINEAGE_SORT_KEYS)[number];

export type SineHeadlessSortDirection = "asc" | "desc";
export type SineHeadlessAliveFilter = "all" | "alive" | "dead";

export type SineHeadlessAgentMetrics = {
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
  snapshotCount: number;
};

export type SineHeadlessAgentEvent = {
  id: number;
  runId: string;
  eventId: number | null;
  kind: "birth" | "reproduction" | "death";
  spawnerId: number;
  lineageId: number;
  tick: number;
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
  childSpawnerId?: number | null;
  parentSpawnerId?: number | null;
  event: Record<string, unknown> | null;
};

export type SineHeadlessAgentSnapshot = {
  runId: string;
  spawnerId: number;
  lineageId: number;
  generation: number;
  tick: number;
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
  reason: HeadlessSnapshotReason;
  schemaVersion: number;
  snapshot: SpawnerAgent | null;
};

export type SineHeadlessTradeRow = {
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
  food: SpawnerFood | null;
};

export type SineHeadlessAgentLeaderboardResponse = {
  ok: true;
  rows: SineHeadlessAgentMetrics[];
  total: number;
  limit: number;
  offset: number;
};

export type SineHeadlessAgentDetailResponse = {
  ok: true;
  metrics: SineHeadlessAgentMetrics;
  events: SineHeadlessAgentEvent[];
  snapshots: SineHeadlessAgentSnapshot[];
  trades: {
    rows: SineHeadlessTradeRow[];
    total: number;
    limit: number;
    offset: number;
  };
};

export type SineHeadlessLineageRow = {
  lineageId: number;
  totalAgents: number;
  aliveAgents: number;
  eligibleAgents: number;
  aliveEligibleAgents: number;
  maxGeneration: number;
  children: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  hitRate: number;
  cumulativePayoff: number;
  averagePayoff: number;
  bestSpawnerId: number | null;
  bestAveragePayoff: number;
  bestCumulativePayoff: number;
  bestHitRate: number;
  bestResolvedTrades: number;
};

export type SineHeadlessEventBucket = {
  bucketStartTick: number;
  bucketEndTick: number;
  events: number;
  births: number;
  deaths: number;
  reproductions: number;
  netPopulationChange: number;
  includesFounderBirths: boolean;
};

export type SineHeadlessTradeAggregate = {
  bucket?: string;
  direction?: SpawnerFood["direction"];
  trades: number;
  wins?: number;
  losses?: number;
  hitRate?: number;
  averagePayoff: number;
  cumulativePayoff: number;
};

export type SineHeadlessTradeBreakdownResponse = {
  ok: true;
  byDirection: SineHeadlessTradeAggregate[];
  byHorizon: SineHeadlessTradeAggregate[];
  byStrength: SineHeadlessTradeAggregate[];
  payoffBins: SineHeadlessTradeAggregate[];
};

export function startSineHeadlessRun(request: SineHeadlessRunRequest) {
  return postSineJson<{ ok: true; job: SineHeadlessJob }>("/api/sine/headless/runs", request);
}

export function getActiveSineHeadlessRun() {
  return getSineJson<{ ok: true; job: SineHeadlessJob | null }>("/api/sine/headless/runs/active");
}

export function getSineHeadlessRun(runId: string) {
  return getSineJson<{
    ok: true;
    job?: SineHeadlessJob;
    run?: SineHeadlessRunRow;
    checkpoints?: HeadlessRunCheckpointRecord[];
    counts?: SineHeadlessCounts;
    active: boolean;
  }>(`/api/sine/headless/runs/${encodeURIComponent(runId)}`);
}

export function getLatestSineHeadlessRun() {
  return getSineJson<{
    ok: true;
    run: SineHeadlessRunRow | null;
    checkpoints: HeadlessRunCheckpointRecord[];
    counts: SineHeadlessCounts | null;
    active: false;
  }>("/api/sine/headless/runs/latest");
}

export function cancelSineHeadlessRun(runId: string) {
  return postSineJson<{ ok: true; job: SineHeadlessJob }>(`/api/sine/headless/runs/${encodeURIComponent(runId)}/cancel`, {});
}

export function getSineHeadlessAgentLeaderboard(
  runId: string,
  params: {
    sortKey?: SineHeadlessAgentSortKey;
    sortDirection?: SineHeadlessSortDirection;
    limit?: number;
    offset?: number;
    minResolvedTrades?: number;
    alive?: SineHeadlessAliveFilter;
    lineageId?: number | null;
  } = {},
) {
  return getSineJson<SineHeadlessAgentLeaderboardResponse>(`${analysisPath(runId, "agents")}?${queryParams(params)}`);
}

export function getSineHeadlessAgentDetail(runId: string, spawnerId: number, params: { tradeLimit?: number; tradeOffset?: number } = {}) {
  return getSineJson<SineHeadlessAgentDetailResponse>(
    `${analysisPath(runId, `agents/${encodeURIComponent(String(spawnerId))}`)}?${queryParams(params)}`,
  );
}

export function getSineHeadlessLineages(
  runId: string,
  params: {
    sortKey?: SineHeadlessLineageSortKey;
    sortDirection?: SineHeadlessSortDirection;
    limit?: number;
    offset?: number;
  } = {},
) {
  return getSineJson<{ ok: true; rows: SineHeadlessLineageRow[]; total: number; limit: number; offset: number }>(
    `${analysisPath(runId, "lineages")}?${queryParams(params)}`,
  );
}

export function getSineHeadlessEventTimeline(runId: string, params: { interval?: number } = {}) {
  return getSineJson<{ ok: true; rows: SineHeadlessEventBucket[] }>(`${analysisPath(runId, "events")}?${queryParams(params)}`);
}

export function getSineHeadlessTradeBreakdown(runId: string) {
  return getSineJson<SineHeadlessTradeBreakdownResponse>(analysisPath(runId, "trades"));
}

function analysisPath(runId: string, suffix: string) {
  return `/api/sine/headless/runs/${encodeURIComponent(runId)}/analysis/${suffix}`;
}

function queryParams(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    search.set(key, String(value));
  }
  return search.toString();
}
