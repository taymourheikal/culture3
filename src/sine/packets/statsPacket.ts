import { getTimelineSampleAtRenderTick } from "../marketTimeline";
import type { MarketStatsPacket, MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import { INITIAL_MARKET_RUNTIME_CONFIG, sanitizeMarketRuntimeConfig } from "../marketRuntimeConfig";
import type { SpawnerConfig } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import { createFoodRuntimeIndex, type FoodRuntimeIndex } from "../spawner/runtimeIndex";
import { currentReproductionCost, currentReproductionEnergyRequirement, populationRoomRatio, reproductionCostMultiplier } from "../spawner/reproductionPressure";
import type { PersistenceOutboxDiagnostics } from "../protocol/statsProtocol";

const EMPTY_PERSISTENCE_OUTBOX_DIAGNOSTICS: PersistenceOutboxDiagnostics = {
  pendingEvents: 0,
  pendingUniquenessSnapshots: 0,
  hasInFlight: false,
  inFlightPacketKb: null,
  pendingStatus: null,
  retryPending: false,
};

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
  persistenceOutbox = EMPTY_PERSISTENCE_OUTBOX_DIAGNOSTICS,
  brainEvalMode = "sync",
  renderTick,
  currentSample,
  foodIndex,
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
  persistenceOutbox?: PersistenceOutboxDiagnostics;
  brainEvalMode?: MarketStatsPacket["brainEvalMode"];
  renderTick?: number;
  currentSample?: ReturnType<typeof getTimelineSampleAtRenderTick>;
  foodIndex?: FoodRuntimeIndex;
}): MarketStatsPacket {
  const activeRenderTick = renderTick ?? Math.min(simulation.timeline.tick, simulation.world.tick);
  const current = currentSample ?? getTimelineSampleAtRenderTick(simulation.timeline, activeRenderTick);
  const runtimeFoodIndex = foodIndex ?? createFoodRuntimeIndex(simulation.world.foods);
  const livingPopulation = simulation.world.spawners.length;
  const activeWorldConfig = simulation.world.config;
  return {
    sessionId,
    version,
    playing,
    runState,
    persistentSessionId,
    tick: simulation.timeline.tick,
    marketTick: simulation.timeline.tick,
    worldTick: simulation.world.tick,
    renderTick: activeRenderTick,
    currentSignal: current.signal,
    currentNoise: current.noise,
    backlogTicks,
    spawnerCount: livingPopulation,
    populationRoomRatio: populationRoomRatio(livingPopulation, activeWorldConfig.maxSpawners),
    reproductionCostMultiplier: reproductionCostMultiplier(activeWorldConfig, livingPopulation),
    currentReproductionCost: currentReproductionCost(activeWorldConfig, livingPopulation),
    currentReproductionEnergyRequirement: currentReproductionEnergyRequirement(activeWorldConfig, livingPopulation),
    pendingFoods: runtimeFoodIndex.pendingCount,
    resolvedFoods: runtimeFoodIndex.resolvedCount,
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
    persistenceOutbox,
  };
}
