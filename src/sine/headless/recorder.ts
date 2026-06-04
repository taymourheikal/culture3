import { foodEventToPersistenceFood } from "../persistence/sinePersistenceDtos";
import { createSpawnerSnapshot } from "../spawner/snapshots";
import type { SpawnerAgent, SpawnerEvent, SpawnerFood } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import { datetimeFromTimestamp, finiteNumber, nullableNumber, sourcePointForTick, type HeadlessSourcePoint } from "./sourcePoint";
import {
  HEADLESS_SNAPSHOT_SCHEMA_VERSION,
  type HeadlessAgentEventRecord,
  type HeadlessAgentMetricsRecord,
  type HeadlessAgentRecord,
  type HeadlessAgentSnapshotRecord,
  type HeadlessRecordSink,
  type HeadlessSnapshotReason,
  type HeadlessTradeRecord,
} from "./types";

type AgentAccumulator = {
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

export type HeadlessRecorderTiming = {
  recordFounders(ms: number): void;
  recordEvent(ms: number): void;
  finalize(ms: number): void;
};

export type HeadlessRecorder = ReturnType<typeof createHeadlessRecorder>;

export function createHeadlessRecorder({
  runId,
  simulation,
  minimumResolvedTrades,
  sink,
  timing,
}: {
  runId: string;
  simulation: MarketSimulationState;
  minimumResolvedTrades: number;
  sink: HeadlessRecordSink;
  timing?: HeadlessRecorderTiming;
}) {
  const threshold = Math.max(0, Math.floor(minimumResolvedTrades));
  const agents = new Map<number, AgentAccumulator>();
  const priorEventSink = simulation.world.eventSink;

  const recorder = {
    attach() {
      simulation.world.eventSink = (event) => {
        priorEventSink?.(event);
        const started = nowMs();
        recorder.recordEvent(event);
        timing?.recordEvent(nowMs() - started);
      };
    },
    recordFounders() {
      const started = nowMs();
      for (const spawner of simulation.world.spawners) {
        recordAgentBirth(spawner, null, null);
      }
      timing?.recordFounders(nowMs() - started);
    },
    recordEvent(event: SpawnerEvent) {
      if (event.kind === "spawn" || event.kind === "resolve") {
        recordTradeEvent(event);
        return;
      }
      if (event.kind === "reproduction") {
        recordReproduction(event);
        return;
      }
      if (event.kind === "death") {
        recordDeath(event);
      }
    },
    finalize() {
      const started = nowMs();
      for (const agent of agents.values()) {
        if (agent.eligible) sink.writeMetrics(metricsRecord(agent, simulation.world.tick));
      }
      timing?.finalize(nowMs() - started);
    },
    summary() {
      let resolvedTrades = 0;
      let wins = 0;
      let losses = 0;
      let cumulativePayoff = 0;
      let eligibleAgents = 0;
      for (const agent of agents.values()) {
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
    },
    agentState(spawnerId: number) {
      return agents.get(spawnerId);
    },
    eligibleAgentIds() {
      return [...agents.values()].filter((agent) => agent.eligible).map((agent) => agent.spawnerId);
    },
  };

  return recorder;

  function recordAgentBirth(spawner: SpawnerAgent, parentSpawnerId: number | null, eventId: number | null) {
    const point = sourcePointForTick(simulation.timeline, spawner.birthTick);
    const parentId = parentSpawnerId ?? spawner.parentSpawnerId ?? null;
    const agent: AgentAccumulator = {
      runId,
      spawnerId: spawner.id,
      lineageId: spawner.lineageId,
      generation: spawner.generation,
      parentSpawnerId: parentId,
      birthTick: spawner.birthTick,
      birthSourceTimestamp: point.sourceTimestamp,
      birthSourceDatetime: point.sourceDatetime,
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
    agents.set(spawner.id, agent);
    sink.writeAgent(agentRecord(agent));
    sink.writeAgentEvent({
      runId,
      eventId,
      kind: "birth",
      spawnerId: spawner.id,
      lineageId: spawner.lineageId,
      tick: spawner.birthTick,
      sourceTimestamp: point.sourceTimestamp,
      sourceDatetime: point.sourceDatetime,
      parentSpawnerId: parentId ?? undefined,
      event: { kind: "birth", spawnerId: spawner.id, lineageId: spawner.lineageId, parentSpawnerId: parentId },
    });
    bufferSnapshot(agent, snapshotRecord(spawner, "birth", spawner.birthTick));
    maybeMarkEligible(agent, spawner.birthTick);
  }

  function recordReproduction(event: SpawnerEvent) {
    const point = sourcePointForTick(simulation.timeline, event.tick);
    const parent = ensureAgent(event.spawnerId, event.spawnerSnapshot);
    if (parent) {
      parent.children += 1;
      sink.writeAgentEvent(lifecycleEvent(event, "reproduction", point));
      if (event.spawnerSnapshot) bufferSnapshot(parent, snapshotRecord(event.spawnerSnapshot, "reproduction", event.tick));
      if (parent.eligible) sink.writeMetrics(metricsRecord(parent, event.tick));
    }
    if (event.childSpawnerSnapshot) {
      recordAgentBirth(event.childSpawnerSnapshot, event.spawnerId, event.id);
    }
  }

  function recordDeath(event: SpawnerEvent) {
    const point = sourcePointForTick(simulation.timeline, event.tick);
    const agent = ensureAgent(event.spawnerId, event.spawnerSnapshot);
    if (!agent) return;
    agent.deathTick = event.tick;
    agent.deathSourceTimestamp = point.sourceTimestamp;
    agent.deathSourceDatetime = point.sourceDatetime;
    sink.markAgentDead({
      runId,
      spawnerId: agent.spawnerId,
      deathTick: event.tick,
      deathSourceTimestamp: point.sourceTimestamp,
      deathSourceDatetime: point.sourceDatetime,
    });
    sink.writeAgentEvent(lifecycleEvent(event, "death", point));
    if (event.spawnerSnapshot) bufferSnapshot(agent, snapshotRecord(event.spawnerSnapshot, "death", event.tick));
    if (agent.eligible) sink.writeMetrics(metricsRecord(agent, event.tick));
    dropIneligibleBuffersIfDone(agent);
  }

  function recordTradeEvent(event: SpawnerEvent) {
    const food = foodEventToPersistenceFood(event);
    const agent = ensureAgent(food.creatorSpawnerId, undefined);
    if (!agent) return;
    const trade = tradeRecord(food);
    if (event.kind === "spawn") {
      agent.openTrades.add(food.id);
      agent.bufferedTrades.set(food.id, trade);
      if (agent.eligible) sink.writeTrade(trade);
      return;
    }

    agent.openTrades.delete(food.id);
    agent.bufferedTrades.set(food.id, trade);
    applyResolvedTrade(agent, food);
    maybeMarkEligible(agent, event.tick);
    if (agent.eligible) {
      sink.writeTrade(trade);
      sink.writeMetrics(metricsRecord(agent, event.tick));
    }
    dropIneligibleBuffersIfDone(agent);
  }

  function ensureAgent(spawnerId: number, snapshot?: SpawnerAgent) {
    const existing = agents.get(spawnerId);
    if (existing) return existing;
    if (!snapshot) return null;
    recordAgentBirth(snapshot, snapshot.parentSpawnerId ?? null, null);
    return agents.get(spawnerId) ?? null;
  }

  function bufferSnapshot(agent: AgentAccumulator, snapshot: HeadlessAgentSnapshotRecord) {
    agent.bufferedSnapshots.push(snapshot);
    if (agent.eligible) sink.writeSnapshot(snapshot);
  }

  function maybeMarkEligible(agent: AgentAccumulator, tick: number) {
    if (agent.eligible || agent.resolvedTrades < threshold) return;
    agent.eligible = true;
    sink.markAgentEligible({ runId, spawnerId: agent.spawnerId, eligible: true, eligibleTick: tick });
    for (const snapshot of agent.bufferedSnapshots) sink.writeSnapshot(snapshot);
    for (const trade of agent.bufferedTrades.values()) sink.writeTrade(trade);
    sink.writeMetrics(metricsRecord(agent, tick));
  }

  function dropIneligibleBuffersIfDone(agent: AgentAccumulator) {
    if (agent.eligible || agent.deathTick === null || agent.openTrades.size > 0) return;
    agent.bufferedSnapshots = [];
    agent.bufferedTrades.clear();
  }

  function applyResolvedTrade(agent: AgentAccumulator, food: SpawnerFood) {
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

  function lifecycleEvent(event: SpawnerEvent, kind: "reproduction" | "death", point: HeadlessSourcePoint): HeadlessAgentEventRecord {
    return {
      runId,
      eventId: event.id,
      kind,
      spawnerId: event.spawnerId,
      lineageId: event.lineageId,
      tick: event.tick,
      sourceTimestamp: point.sourceTimestamp,
      sourceDatetime: point.sourceDatetime,
      childSpawnerId: event.childSpawnerId,
      event: structuredClone(event) as unknown as Record<string, unknown>,
    };
  }

  function snapshotRecord(spawner: SpawnerAgent, reason: HeadlessSnapshotReason, tick: number): HeadlessAgentSnapshotRecord {
    const point = sourcePointForTick(simulation.timeline, tick);
    return {
      runId,
      spawnerId: spawner.id,
      lineageId: spawner.lineageId,
      generation: spawner.generation,
      tick,
      sourceTimestamp: point.sourceTimestamp,
      sourceDatetime: point.sourceDatetime,
      reason,
      schemaVersion: HEADLESS_SNAPSHOT_SCHEMA_VERSION,
      snapshot: createSpawnerSnapshot(spawner),
    };
  }

  function tradeRecord(food: SpawnerFood): HeadlessTradeRecord {
    return {
      runId,
      spawnerId: food.creatorSpawnerId,
      lineageId: food.creatorLineageId,
      foodId: food.id,
      spawnTick: food.spawnTick,
      resolveTick: food.resolveTick,
      direction: food.direction,
      strength: food.strength,
      horizonTicks: food.horizonTicks,
      entrySignal: food.entrySignal,
      exitSignal: nullableNumber(food.exitSignal),
      entryPayoffScale: nullableNumber(food.entryPayoffScale),
      entryPrice: nullableNumber(food.entryPrice),
      exitPrice: nullableNumber(food.exitPrice),
      sourceTimestamp: nullableNumber(food.sourceTimestamp),
      sourceDatetime: datetimeFromTimestamp(food.sourceTimestamp),
      exitSourceTimestamp: nullableNumber(food.exitSourceTimestamp),
      exitSourceDatetime: datetimeFromTimestamp(food.exitSourceTimestamp),
      status: food.status,
      payoff: nullableNumber(food.payoff),
      food,
    };
  }
}

function agentRecord(agent: AgentAccumulator): HeadlessAgentRecord {
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
  };
}

function metricsRecord(agent: AgentAccumulator, currentTick: number): HeadlessAgentMetricsRecord {
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

function nowMs() {
  return performance.now();
}
