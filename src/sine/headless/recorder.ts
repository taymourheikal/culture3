import { foodEventToPersistenceFood } from "../persistence/sinePersistenceDtos";
import { createSpawnerSnapshot } from "../spawner/snapshots";
import type { SpawnerAgent, SpawnerEvent, SpawnerFood } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import { datetimeFromUnixSeconds } from "../sourceTime";
import {
  createHeadlessAgentAccumulator,
  headlessAgentRecord,
  headlessMetricsRecord,
  recordHeadlessAgentChild,
  recordHeadlessAgentDeath,
  recordHeadlessAgentResolvedTrade,
  summarizeHeadlessAgents,
  type HeadlessAgentAccumulator,
} from "./agentAccumulator";
import {
  bufferHeadlessSnapshot,
  bufferHeadlessTrade,
  createHeadlessEligibilityPolicy,
  dropIneligibleHeadlessBuffersIfDone,
  maybeMarkHeadlessAgentEligible,
  type HeadlessEligibilityFlush,
} from "./eligibilityBuffer";
import { nullableNumber, sourcePointForTick, type HeadlessSourcePoint } from "./sourcePoint";
import {
  DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL,
  HEADLESS_SNAPSHOT_SCHEMA_VERSION,
  type HeadlessAgentEventRecord,
  type HeadlessAgentSnapshotRecord,
  type HeadlessRecordSink,
  type HeadlessSnapshotReason,
  type HeadlessTradeRecord,
} from "./types";

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
  resolvedTradeSnapshotInterval = DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL,
  sink,
  timing,
}: {
  runId: string;
  simulation: MarketSimulationState;
  minimumResolvedTrades: number;
  resolvedTradeSnapshotInterval?: number;
  sink: HeadlessRecordSink;
  timing?: HeadlessRecorderTiming;
}) {
  const eligibilityPolicy = createHeadlessEligibilityPolicy(runId, minimumResolvedTrades);
  const snapshotPolicy = {
    resolvedTradeSnapshotInterval: sanitizeResolvedTradeSnapshotInterval(resolvedTradeSnapshotInterval),
  };
  const agents = new Map<number, HeadlessAgentAccumulator>();
  const pendingTradeSnapshotTicks = new Map<number, number>();
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
      captureFinalSnapshots();
      for (const agent of agents.values()) {
        if (agent.eligible) sink.writeMetrics(headlessMetricsRecord(agent, simulation.world.tick));
      }
      timing?.finalize(nowMs() - started);
    },
    capturePendingSnapshotsAfterTick() {
      capturePendingTradeSnapshots();
    },
    summary() {
      return summarizeHeadlessAgents(agents.values());
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
    const agent = createHeadlessAgentAccumulator({ runId, spawner, parentSpawnerId: parentId, birthPoint: point });
    agents.set(spawner.id, agent);
    sink.writeAgent(headlessAgentRecord(agent, spawner));
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
      recordHeadlessAgentChild(parent);
      sink.writeAgentEvent(lifecycleEvent(event, "reproduction", point));
      if (event.spawnerSnapshot) bufferSnapshot(parent, snapshotRecord(event.spawnerSnapshot, "reproduction", event.tick));
      if (parent.eligible) sink.writeMetrics(headlessMetricsRecord(parent, event.tick));
    }
    if (event.childSpawnerSnapshot) {
      recordAgentBirth(event.childSpawnerSnapshot, event.spawnerId, event.id);
    }
  }

  function recordDeath(event: SpawnerEvent) {
    const point = sourcePointForTick(simulation.timeline, event.tick);
    const agent = ensureAgent(event.spawnerId, event.spawnerSnapshot);
    if (!agent) return;
    recordHeadlessAgentDeath(agent, event.tick, point);
    sink.markAgentDead({
      runId,
      spawnerId: agent.spawnerId,
      deathTick: event.tick,
      deathSourceTimestamp: point.sourceTimestamp,
      deathSourceDatetime: point.sourceDatetime,
    });
    sink.writeAgentEvent(lifecycleEvent(event, "death", point));
    if (event.spawnerSnapshot) bufferSnapshot(agent, snapshotRecord(event.spawnerSnapshot, "death", event.tick));
    if (agent.eligible) sink.writeMetrics(headlessMetricsRecord(agent, event.tick));
    dropIneligibleHeadlessBuffersIfDone(agent);
  }

  function recordTradeEvent(event: SpawnerEvent) {
    const food = foodEventToPersistenceFood(event);
    const agent = ensureAgent(food.creatorSpawnerId, undefined);
    if (!agent) return;
    const trade = tradeRecord(food);
    if (event.kind === "spawn") {
      agent.openTrades.add(food.id);
      const writeNow = bufferHeadlessTrade(agent, trade);
      sink.writeCoreTrade?.(trade);
      if (writeNow) sink.writeTrade(writeNow);
      return;
    }

    agent.openTrades.delete(food.id);
    const writeNow = bufferHeadlessTrade(agent, trade);
    sink.writeCoreTrade?.(trade);
    const priorResolvedTrades = agent.resolvedTrades;
    recordHeadlessAgentResolvedTrade(agent, food);
    maybeQueueTradeIntervalSnapshot(agent, priorResolvedTrades, event.tick);
    maybeMarkEligible(agent, event.tick);
    if (agent.eligible) {
      sink.writeTrade(writeNow ?? trade);
      sink.writeMetrics(headlessMetricsRecord(agent, event.tick));
    }
    dropIneligibleHeadlessBuffersIfDone(agent);
  }

  function ensureAgent(spawnerId: number, snapshot?: SpawnerAgent) {
    const existing = agents.get(spawnerId);
    if (existing) return existing;
    if (!snapshot) return null;
    recordAgentBirth(snapshot, snapshot.parentSpawnerId ?? null, null);
    return agents.get(spawnerId) ?? null;
  }

  function bufferSnapshot(agent: HeadlessAgentAccumulator, snapshot: HeadlessAgentSnapshotRecord) {
    const writeNow = bufferHeadlessSnapshot(agent, snapshot);
    if (writeNow) sink.writeSnapshot(writeNow);
  }

  function maybeMarkEligible(agent: HeadlessAgentAccumulator, tick: number) {
    const flush = maybeMarkHeadlessAgentEligible(agent, eligibilityPolicy, tick);
    if (flush) writeEligibilityFlush(flush, tick);
  }

  function writeEligibilityFlush(flush: HeadlessEligibilityFlush, tick: number) {
    sink.markAgentEligible(flush.eligibility);
    for (const snapshot of flush.snapshots) sink.writeSnapshot(snapshot);
    for (const trade of flush.trades) sink.writeTrade(trade);
    const agent = agents.get(flush.eligibility.spawnerId);
    if (agent) sink.writeMetrics(headlessMetricsRecord(agent, tick));
  }

  function maybeQueueTradeIntervalSnapshot(agent: HeadlessAgentAccumulator, priorResolvedTrades: number, tick: number) {
    const interval = snapshotPolicy.resolvedTradeSnapshotInterval;
    if (interval <= 0 || agent.deathTick !== null) return;
    const priorBucket = Math.floor(Math.max(0, priorResolvedTrades) / interval);
    const nextBucket = Math.floor(Math.max(0, agent.resolvedTrades) / interval);
    if (nextBucket <= priorBucket) return;
    const pendingTick = pendingTradeSnapshotTicks.get(agent.spawnerId);
    pendingTradeSnapshotTicks.set(agent.spawnerId, pendingTick === undefined ? tick : Math.min(pendingTick, tick));
  }

  function capturePendingTradeSnapshots() {
    if (pendingTradeSnapshotTicks.size === 0) return;
    const spawnersById = liveSpawnerMap();
    for (const [spawnerId, tick] of pendingTradeSnapshotTicks) {
      const agent = agents.get(spawnerId);
      const spawner = spawnersById.get(spawnerId);
      if (agent && spawner && agent.deathTick === null) {
        bufferSnapshot(agent, snapshotRecord(spawner, "trade_interval", tick));
      }
    }
    pendingTradeSnapshotTicks.clear();
  }

  function captureFinalSnapshots() {
    capturePendingTradeSnapshots();
    const spawnersById = liveSpawnerMap();
    for (const agent of agents.values()) {
      if (!agent.eligible || agent.deathTick !== null) continue;
      const spawner = spawnersById.get(agent.spawnerId);
      if (spawner) bufferSnapshot(agent, snapshotRecord(spawner, "final", simulation.world.tick));
    }
  }

  function liveSpawnerMap() {
    return new Map(simulation.world.spawners.map((spawner) => [spawner.id, spawner]));
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
      sourceDatetime: datetimeFromUnixSeconds(food.sourceTimestamp),
      exitSourceTimestamp: nullableNumber(food.exitSourceTimestamp),
      exitSourceDatetime: datetimeFromUnixSeconds(food.exitSourceTimestamp),
      status: food.status,
      payoff: nullableNumber(food.payoff),
      food,
    };
  }
}

function sanitizeResolvedTradeSnapshotInterval(value: number | undefined) {
  const interval = Math.floor(Number(value));
  if (!Number.isFinite(interval) || interval <= 0) return 0;
  return interval;
}

function nowMs() {
  return performance.now();
}
