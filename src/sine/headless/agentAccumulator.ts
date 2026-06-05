import { createSpawnerSnapshot } from "../spawner/snapshots";
import type { SpawnerAgent, SpawnerFood } from "../spawnerSimulation";
import { finiteNumber, type HeadlessSourcePoint } from "./sourcePoint";
import type { HeadlessAgentMetricsRecord, HeadlessAgentRecord, HeadlessAgentSnapshotRecord, HeadlessTradeRecord } from "./types";

export type HeadlessAgentAccumulator = {
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
  eligible: boolean;
  openTrades: Set<number>;
  bufferedTrades: Map<number, HeadlessTradeRecord>;
  bufferedSnapshots: HeadlessAgentSnapshotRecord[];
  resolvedTrades: number;
  wins: number;
  losses: number;
  payoffSum: number;
  payoffSquareSum: number;
  winPayoffSum: number;
  lossPayoffSum: number;
  longTrades: number;
  shortTrades: number;
  longPayoffSum: number;
  shortPayoffSum: number;
  horizonSum: number;
  strengthSum: number;
  children: number;
  lastResolvedTick: number | null;
};

export function createHeadlessAgentAccumulator({
  runId,
  spawner,
  parentSpawnerId,
  birthPoint,
}: {
  runId: string;
  spawner: SpawnerAgent;
  parentSpawnerId: number | null;
  birthPoint: HeadlessSourcePoint;
}): HeadlessAgentAccumulator {
  return {
    runId,
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    generation: spawner.generation,
    parentSpawnerId,
    birthTick: spawner.birthTick,
    birthSourceTimestamp: birthPoint.sourceTimestamp,
    birthSourceDatetime: birthPoint.sourceDatetime,
    deathTick: null,
    deathSourceTimestamp: null,
    deathSourceDatetime: null,
    eligible: false,
    openTrades: new Set(),
    bufferedTrades: new Map(),
    bufferedSnapshots: [],
    resolvedTrades: 0,
    wins: 0,
    losses: 0,
    payoffSum: 0,
    payoffSquareSum: 0,
    winPayoffSum: 0,
    lossPayoffSum: 0,
    longTrades: 0,
    shortTrades: 0,
    longPayoffSum: 0,
    shortPayoffSum: 0,
    horizonSum: 0,
    strengthSum: 0,
    children: 0,
    lastResolvedTick: null,
  };
}

export function recordHeadlessAgentDeath(agent: HeadlessAgentAccumulator, tick: number, deathPoint: HeadlessSourcePoint) {
  agent.deathTick = tick;
  agent.deathSourceTimestamp = deathPoint.sourceTimestamp;
  agent.deathSourceDatetime = deathPoint.sourceDatetime;
}

export function recordHeadlessAgentChild(agent: HeadlessAgentAccumulator) {
  agent.children += 1;
}

export function recordHeadlessAgentResolvedTrade(agent: HeadlessAgentAccumulator, food: SpawnerFood) {
  const payoff = finiteNumber(food.payoff, 0);
  agent.resolvedTrades += 1;
  agent.payoffSum += payoff;
  agent.payoffSquareSum += payoff * payoff;
  agent.horizonSum += finiteNumber(food.horizonTicks, 0);
  agent.strengthSum += finiteNumber(food.strength, 0);
  agent.lastResolvedTick = food.resolveTick;
  if (food.status === "win" || payoff > 0) {
    agent.wins += 1;
    agent.winPayoffSum += payoff;
  } else {
    agent.losses += 1;
    agent.lossPayoffSum += payoff;
  }
  if (food.direction === "long") {
    agent.longTrades += 1;
    agent.longPayoffSum += payoff;
  } else {
    agent.shortTrades += 1;
    agent.shortPayoffSum += payoff;
  }
}

export function summarizeHeadlessAgents(agents: Iterable<HeadlessAgentAccumulator>) {
  let resolvedTrades = 0;
  let wins = 0;
  let losses = 0;
  let cumulativePayoff = 0;
  let eligibleAgents = 0;
  for (const agent of agents) {
    resolvedTrades += agent.resolvedTrades;
    wins += agent.wins;
    losses += agent.losses;
    cumulativePayoff += agent.payoffSum;
    if (agent.eligible) eligibleAgents += 1;
  }
  return {
    eligibleAgents,
    resolvedTrades,
    wins,
    losses,
    hitRate: resolvedTrades > 0 ? wins / resolvedTrades : 0,
    cumulativePayoff,
    averagePayoff: resolvedTrades > 0 ? cumulativePayoff / resolvedTrades : 0,
  };
}

export function headlessAgentRecord(agent: HeadlessAgentAccumulator, spawner: SpawnerAgent): HeadlessAgentRecord {
  return {
    runId: agent.runId,
    spawnerId: agent.spawnerId,
    lineageId: agent.lineageId,
    generation: agent.generation,
    parentSpawnerId: agent.parentSpawnerId,
    birthTick: agent.birthTick,
    birthSourceTimestamp: agent.birthSourceTimestamp,
    birthSourceDatetime: agent.birthSourceDatetime,
    eligible: agent.eligible,
    spawner: createSpawnerSnapshot(spawner, { includeLearnedState: false }),
  };
}

export function headlessMetricsRecord(agent: HeadlessAgentAccumulator, currentTick: number): HeadlessAgentMetricsRecord {
  const resolved = Math.max(0, agent.resolvedTrades);
  const mean = resolved > 0 ? agent.payoffSum / resolved : 0;
  const variance = resolved > 0 ? Math.max(0, agent.payoffSquareSum / resolved - mean * mean) : 0;
  return {
    runId: agent.runId,
    spawnerId: agent.spawnerId,
    lineageId: agent.lineageId,
    generation: agent.generation,
    parentSpawnerId: agent.parentSpawnerId,
    birthTick: agent.birthTick,
    birthSourceTimestamp: agent.birthSourceTimestamp,
    birthSourceDatetime: agent.birthSourceDatetime,
    deathTick: agent.deathTick,
    deathSourceTimestamp: agent.deathSourceTimestamp,
    deathSourceDatetime: agent.deathSourceDatetime,
    lifespanTicks: agent.deathTick === null ? null : Math.max(0, agent.deathTick - agent.birthTick),
    children: agent.children,
    resolvedTrades: resolved,
    wins: agent.wins,
    losses: agent.losses,
    hitRate: resolved > 0 ? agent.wins / resolved : 0,
    cumulativePayoff: agent.payoffSum,
    averagePayoff: mean,
    averageWin: agent.wins > 0 ? agent.winPayoffSum / agent.wins : 0,
    averageLoss: agent.losses > 0 ? agent.lossPayoffSum / agent.losses : 0,
    payoffStdDev: Math.sqrt(variance),
    longTrades: agent.longTrades,
    shortTrades: agent.shortTrades,
    longAveragePayoff: agent.longTrades > 0 ? agent.longPayoffSum / agent.longTrades : 0,
    shortAveragePayoff: agent.shortTrades > 0 ? agent.shortPayoffSum / agent.shortTrades : 0,
    averageHorizonTicks: resolved > 0 ? agent.horizonSum / resolved : 0,
    averageStrength: resolved > 0 ? agent.strengthSum / resolved : 0,
    lastResolvedTick: agent.lastResolvedTick ?? (resolved > 0 ? currentTick : null),
  };
}
