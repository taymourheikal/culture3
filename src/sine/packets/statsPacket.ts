import { getTimelineSampleAtRenderTick } from "../marketTimeline";
import type { MarketStatsPacket, MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import { INITIAL_MARKET_RUNTIME_CONFIG, sanitizeMarketRuntimeConfig } from "../marketRuntimeConfig";
import type { SpawnerConfig } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import { createFoodRuntimeIndex } from "../spawner/runtimeIndex";
import { currentReproductionCost, currentReproductionEnergyRequirement, populationRoomRatio, reproductionCostMultiplier } from "../spawner/reproductionPressure";

export function createMarketStatsPacket({
  sessionId,
  simulation,
  settings,
  marketConfig = INITIAL_MARKET_RUNTIME_CONFIG,
  pendingMarketConfig,
  spawnerConfig,
  pendingSpawnerConfig,
  playing,
  runState = playing ? "running" : "paused",
  persistentSessionId = null,
  version,
  backlogTicks,
  packetSizesKb,
  brainEvalMode = "sync",
}: {
  sessionId: MarketWorkerSessionId;
  simulation: MarketSimulationState;
  settings: WaveSettings;
  marketConfig?: MarketRuntimeConfig;
  pendingMarketConfig?: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  pendingSpawnerConfig?: SpawnerConfig;
  playing: boolean;
  runState?: MarketStatsPacket["runState"];
  persistentSessionId?: string | null;
  version: number;
  backlogTicks: number;
  packetSizesKb: MarketStatsPacket["packetSizesKb"];
  brainEvalMode?: MarketStatsPacket["brainEvalMode"];
}): MarketStatsPacket {
  const renderTick = Math.min(simulation.timeline.tick, simulation.world.tick);
  const current = getTimelineSampleAtRenderTick(simulation.timeline, renderTick);
  const foodIndex = createFoodRuntimeIndex(simulation.world.foods);
  const livingPopulation = simulation.world.spawners.length;
  const activeWorldConfig = simulation.world.config;
  return {
    sessionId,
    version,
    playing,
    runState,
    persistentSessionId,
    tick: simulation.timeline.tick,
    renderTick,
    currentSignal: current.signal,
    currentNoise: current.noise,
    backlogTicks,
    spawnerCount: livingPopulation,
    populationRoomRatio: populationRoomRatio(livingPopulation, activeWorldConfig.maxSpawners),
    reproductionCostMultiplier: reproductionCostMultiplier(activeWorldConfig, livingPopulation),
    currentReproductionCost: currentReproductionCost(activeWorldConfig, livingPopulation),
    currentReproductionEnergyRequirement: currentReproductionEnergyRequirement(activeWorldConfig, livingPopulation),
    pendingFoods: foodIndex.pendingCount,
    resolvedFoods: foodIndex.resolvedCount,
    totalWins: simulation.world.totalResolved - simulation.world.totalLosses,
    totalLosses: simulation.world.totalLosses,
    brainEvalMode,
    settings: { ...settings },
    marketConfig: sanitizeMarketRuntimeConfig(pendingMarketConfig ?? marketConfig),
    activeMarketConfig: sanitizeMarketRuntimeConfig(marketConfig),
    pendingMarketConfig: sanitizeMarketRuntimeConfig(pendingMarketConfig ?? marketConfig),
    spawnerConfig: { ...(pendingSpawnerConfig ?? spawnerConfig) },
    activeSpawnerConfig: { ...spawnerConfig },
    pendingSpawnerConfig: { ...(pendingSpawnerConfig ?? spawnerConfig) },
    packetSizesKb,
  };
}
