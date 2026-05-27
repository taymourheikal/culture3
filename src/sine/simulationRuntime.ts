import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline, type MarketCandle, type MarketTimeline } from "./marketTimeline";
import {
  advanceSpawnerWorldToTimeline,
  advanceSpawnerWorldToTimelineAsync,
  createSpawnerWorld,
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

export function createSimulationState(settings: WaveSettings | MarketRuntimeConfig, spawnerConfig?: SpawnerConfig): MarketSimulationState {
  const marketConfig = sanitizeMarketRuntimeConfig(isRuntimeConfig(settings) ? settings : { generated: settings });
  const world = createSpawnerWorld(undefined, spawnerConfig);
  const timeline = createMarketTimeline(marketConfig.generated);
  return { timeline, world, marketConfig: { ...marketConfig, source: "generated" } };
}

export function createCandleSimulationState({
  marketConfig,
  spawnerConfig,
  candles,
  snappedStartTimestamp,
  snappedStartDatetime,
}: {
  marketConfig: MarketRuntimeConfig;
  spawnerConfig?: SpawnerConfig;
  candles: MarketCandle[];
  snappedStartTimestamp?: number;
  snappedStartDatetime?: string;
}): MarketSimulationState {
  const sanitized = sanitizeMarketRuntimeConfig(marketConfig);
  if (!isBtcSource(sanitized.source)) return createSimulationState(sanitized, spawnerConfig);
  const world = createSpawnerWorld(undefined, spawnerConfig);
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
  const marketResult = advanceMarketTimeline(simulation.timeline, targetTick, maxTicks);
  const spawnerResult = await advanceSpawnerWorldToTimelineAsync(simulation.world, simulation.timeline, maxTicks, options);
  return {
    processedTicks: spawnerResult.processedTicks,
    remainingTicks: marketResult.ended ? 0 : marketResult.remainingTicks + spawnerResult.remainingTicks,
    ended: marketResult.ended,
  };
}

function isRuntimeConfig(settings: WaveSettings | MarketRuntimeConfig): settings is MarketRuntimeConfig {
  return "generated" in settings && "playback" in settings;
}
