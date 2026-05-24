import { getTimelineSampleAtRenderTick } from "../marketTimeline";
import type { MarketStatsPacket, MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import { INITIAL_MARKET_RUNTIME_CONFIG, sanitizeMarketRuntimeConfig } from "../marketRuntimeConfig";
import type { SpawnerConfig } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";

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
}): MarketStatsPacket {
  const renderTick = Math.min(simulation.timeline.tick, simulation.world.tick);
  const current = getTimelineSampleAtRenderTick(simulation.timeline, renderTick);
  const pendingFoods = simulation.world.foods.filter((food) => food.status === "pending").length;
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
    spawnerCount: simulation.world.spawners.length,
    pendingFoods,
    resolvedFoods: simulation.world.foods.length - pendingFoods,
    totalWins: simulation.world.totalResolved - simulation.world.totalLosses,
    totalLosses: simulation.world.totalLosses,
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
