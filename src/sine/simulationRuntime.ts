import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline, type MarketCandle, type MarketTimeline } from "./marketTimeline";
import {
  advanceSpawnerWorldToTimeline,
  advanceSpawnerWorldToTimelineAsync,
  createSpawnerWorld,
  type SpawnerEvent,
  type SpawnerAdvanceOptions,
  type SpawnerWorld,
} from "./spawnerSimulation";
import type { WaveSettings } from "./marketSignal";
import { isBtcSource, sanitizeMarketRuntimeConfig, type MarketRuntimeConfig } from "./marketRuntimeConfig";
import type { SpawnerConfig } from "./spawnerSimulation";

export const MAX_SIMULATION_TICKS_PER_FRAME = 100;

export type MarketSimulationState = {
  timeline: MarketTimeline;
  world: SpawnerWorld;
  marketConfig: MarketRuntimeConfig;
};

export type SimulationRuntimeOptions = {
  seed?: number;
};

export function createSimulationState(
  settings: WaveSettings | MarketRuntimeConfig,
  spawnerConfig?: SpawnerConfig,
  options: SimulationRuntimeOptions = {},
): MarketSimulationState {
  const marketConfig = sanitizeMarketRuntimeConfig(isRuntimeConfig(settings) ? settings : { generated: settings });
  const world = createSpawnerWorld(options.seed, spawnerConfig);
  const timeline = createMarketTimeline(marketConfig.generated);
  return { timeline, world, marketConfig: { ...marketConfig, source: "generated" } };
}

export function createCandleSimulationState({
  marketConfig,
  spawnerConfig,
  candles,
  snappedStartTimestamp,
  snappedStartDatetime,
  seed,
}: {
  marketConfig: MarketRuntimeConfig;
  spawnerConfig?: SpawnerConfig;
  candles: MarketCandle[];
  snappedStartTimestamp?: number;
  snappedStartDatetime?: string;
  seed?: number;
}): MarketSimulationState {
  const sanitized = sanitizeMarketRuntimeConfig(marketConfig);
  if (!isBtcSource(sanitized.source)) return createSimulationState(sanitized, spawnerConfig, { seed });
  const world = createSpawnerWorld(seed, spawnerConfig);
  const timeline = createCandleMarketTimeline({
    candles,
    source: sanitized.source,
    settings: sanitized.generated,
    snappedStartTimestamp,
    snappedStartDatetime,
  });
  return { timeline, world, marketConfig: sanitized };
}

export function advanceSimulationToTarget(
  simulation: MarketSimulationState,
  targetTick: number,
  maxTicks = MAX_SIMULATION_TICKS_PER_FRAME,
) {
  const marketResult = advanceMarketTimeline(simulation.timeline, targetTick, maxTicks);
  const spawnerResult = advanceSpawnerWorldToTimeline(simulation.world, simulation.timeline, maxTicks);
  return {
    processedTicks: spawnerResult.processedTicks,
    remainingTicks: marketResult.ended ? 0 : marketResult.remainingTicks + spawnerResult.remainingTicks,
    ended: marketResult.ended,
  };
}

export async function advanceSimulationToTargetAsync(
  simulation: MarketSimulationState,
  targetTick: number,
  maxTicks = MAX_SIMULATION_TICKS_PER_FRAME,
  options: SpawnerAdvanceOptions = {},
) {
  const transaction = shouldUseAsyncAdvanceTransaction(options) ? beginAsyncAdvanceTransaction(simulation) : null;
  try {
    const marketResult = advanceMarketTimeline(simulation.timeline, targetTick, maxTicks);
    const spawnerResult = await advanceSpawnerWorldToTimelineAsync(simulation.world, simulation.timeline, maxTicks, options);
    const result = {
      processedTicks: spawnerResult.processedTicks,
      remainingTicks: marketResult.ended ? 0 : marketResult.remainingTicks + spawnerResult.remainingTicks,
      ended: marketResult.ended,
    };
    transaction?.commit();
    return result;
  } catch (error) {
    transaction?.rollback();
    throw error;
  }
}

function isRuntimeConfig(settings: WaveSettings | MarketRuntimeConfig): settings is MarketRuntimeConfig {
  return "generated" in settings && "playback" in settings;
}

type SimulationAdvanceSnapshot = {
  timeline: MarketTimeline;
  world: {
    seed: number;
    rngState: number;
    tick: number;
    nextEventId: number;
    nextSpawnerId: number;
    nextLineageId: number;
    nextFoodId: number;
    spawners: SpawnerWorld["spawners"];
    foods: SpawnerWorld["foods"];
    recentEvents: SpawnerWorld["recentEvents"];
    lineages: SpawnerWorld["lineages"];
    cumulativeLoss: number;
    cumulativeNetPayoff: number;
    totalResolved: number;
    totalLosses: number;
    recentResolvedPayoffs: number[];
    telemetry: SpawnerWorld["telemetry"];
    innovations: SpawnerWorld["innovations"];
  };
};

function shouldUseAsyncAdvanceTransaction(options: SpawnerAdvanceOptions) {
  const runner = options.brainEvaluationRunner;
  if (!runner) return false;
  return (runner.currentMode?.() ?? runner.mode ?? "parallel") !== "sync";
}

function beginAsyncAdvanceTransaction(simulation: MarketSimulationState) {
  const snapshot = captureSimulationAdvanceSnapshot(simulation);
  const world = simulation.world;
  const eventSink = world.eventSink;
  const bufferedEvents: SpawnerEvent[] = [];
  let closed = false;
  world.eventSink = (event) => bufferedEvents.push(event);
  return {
    commit() {
      if (closed) return;
      closed = true;
      world.eventSink = eventSink;
      for (const event of bufferedEvents) eventSink?.(event);
    },
    rollback() {
      if (closed) return;
      closed = true;
      restoreSimulationAdvanceSnapshot(simulation, snapshot);
      simulation.world.eventSink = eventSink;
    },
  };
}

function captureSimulationAdvanceSnapshot(simulation: MarketSimulationState): SimulationAdvanceSnapshot {
  const world = simulation.world;
  return {
    timeline: clonePlain(simulation.timeline),
    world: {
      seed: world.seed,
      rngState: world.rng.snapshot(),
      tick: world.tick,
      nextEventId: world.nextEventId,
      nextSpawnerId: world.nextSpawnerId,
      nextLineageId: world.nextLineageId,
      nextFoodId: world.nextFoodId,
      spawners: clonePlain(world.spawners),
      foods: clonePlain(world.foods),
      recentEvents: clonePlain(world.recentEvents),
      lineages: clonePlain(world.lineages),
      cumulativeLoss: world.cumulativeLoss,
      cumulativeNetPayoff: world.cumulativeNetPayoff,
      totalResolved: world.totalResolved,
      totalLosses: world.totalLosses,
      recentResolvedPayoffs: [...world.recentResolvedPayoffs],
      telemetry: clonePlain(world.telemetry),
      innovations: clonePlain(world.innovations),
    },
  };
}

function restoreSimulationAdvanceSnapshot(simulation: MarketSimulationState, snapshot: SimulationAdvanceSnapshot) {
  Object.assign(simulation.timeline, clonePlain(snapshot.timeline));
  const world = simulation.world;
  world.seed = snapshot.world.seed;
  world.rng.restore(snapshot.world.rngState);
  world.tick = snapshot.world.tick;
  world.nextEventId = snapshot.world.nextEventId;
  world.nextSpawnerId = snapshot.world.nextSpawnerId;
  world.nextLineageId = snapshot.world.nextLineageId;
  world.nextFoodId = snapshot.world.nextFoodId;
  world.spawners = clonePlain(snapshot.world.spawners);
  world.foods = clonePlain(snapshot.world.foods);
  world.recentEvents = clonePlain(snapshot.world.recentEvents);
  world.lineages = clonePlain(snapshot.world.lineages);
  world.cumulativeLoss = snapshot.world.cumulativeLoss;
  world.cumulativeNetPayoff = snapshot.world.cumulativeNetPayoff;
  world.totalResolved = snapshot.world.totalResolved;
  world.totalLosses = snapshot.world.totalLosses;
  world.recentResolvedPayoffs = [...snapshot.world.recentResolvedPayoffs];
  world.telemetry = clonePlain(snapshot.world.telemetry);
  world.innovations = clonePlain(snapshot.world.innovations);
}

function clonePlain<T>(value: T): T {
  return structuredClone(value);
}
