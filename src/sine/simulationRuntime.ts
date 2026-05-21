import { advanceMarketTimeline, createMarketTimeline, type MarketTimeline } from "./marketTimeline";
import { advanceSpawnerWorldToTimeline, createSpawnerWorld, type SpawnerWorld } from "./spawnerSimulation";
import type { WaveSettings } from "./marketSignal";
import type { SpawnerConfig } from "./spawnerSimulation";

export const MAX_SIMULATION_TICKS_PER_FRAME = 100;

export type MarketSimulationState = {
  timeline: MarketTimeline;
  world: SpawnerWorld;
};

export function createSimulationState(settings: WaveSettings, spawnerConfig?: SpawnerConfig): MarketSimulationState {
  const world = createSpawnerWorld(undefined, spawnerConfig);
  const timeline = createMarketTimeline(settings, world.config.tickSeconds);
  return { timeline, world };
}

export function advanceSimulationToTarget(
  simulation: MarketSimulationState,
  targetTime: number,
  maxTicks = MAX_SIMULATION_TICKS_PER_FRAME,
) {
  const marketResult = advanceMarketTimeline(simulation.timeline, targetTime, maxTicks);
  const spawnerResult = advanceSpawnerWorldToTimeline(simulation.world, simulation.timeline, maxTicks);
  return {
    processedTicks: marketResult.processedTicks + spawnerResult.processedTicks,
    remainingTicks: marketResult.remainingTicks + spawnerResult.remainingTicks,
  };
}
