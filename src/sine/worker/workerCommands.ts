import type { WaveSettings } from "../marketSignal";
import type { MarketDataSource, MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketWorkerCommand, MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { SpawnerConfig } from "../spawnerSimulation";

export const workerCommands = {
  start: (sessionId: MarketWorkerSessionId): MarketWorkerCommand => ({ type: "start", sessionId }),
  pause: (sessionId: MarketWorkerSessionId): MarketWorkerCommand => ({ type: "pause", sessionId }),
  stop: (sessionId: MarketWorkerSessionId): MarketWorkerCommand => ({ type: "stop", sessionId }),
  reset: (sessionId: MarketWorkerSessionId, marketConfig: MarketRuntimeConfig, spawnerConfig: SpawnerConfig): MarketWorkerCommand => ({
    type: "reset",
    sessionId,
    marketConfig,
    spawnerConfig,
  }),
  setSettings: (sessionId: MarketWorkerSessionId, patch: Partial<WaveSettings>): MarketWorkerCommand => ({
    type: "setSettings",
    sessionId,
    patch,
  }),
  setPlaybackSettings: (sessionId: MarketWorkerSessionId, patch: Partial<MarketRuntimeConfig["playback"]>): MarketWorkerCommand => ({
    type: "setPlaybackSettings",
    sessionId,
    patch,
  }),
  setMarketSource: (sessionId: MarketWorkerSessionId, source: MarketDataSource): MarketWorkerCommand => ({
    type: "setMarketSource",
    sessionId,
    source,
  }),
  setMarketConfig: (sessionId: MarketWorkerSessionId, patch: Partial<MarketRuntimeConfig>): MarketWorkerCommand => ({
    type: "setMarketConfig",
    sessionId,
    patch,
  }),
  setSpawnerConfig: (sessionId: MarketWorkerSessionId, patch: Partial<SpawnerConfig>): MarketWorkerCommand => ({
    type: "setSpawnerConfig",
    sessionId,
    patch,
  }),
  replaceSpawnerConfig: (sessionId: MarketWorkerSessionId, spawnerConfig: SpawnerConfig): MarketWorkerCommand => ({
    type: "replaceSpawnerConfig",
    sessionId,
    spawnerConfig,
  }),
  requestPackets: (sessionId: MarketWorkerSessionId): MarketWorkerCommand => ({
    type: "requestPackets",
    sessionId,
  }),
  requestSpawnerArchitecture: (sessionId: MarketWorkerSessionId, spawnerId: number): MarketWorkerCommand => ({
    type: "requestSpawnerArchitecture",
    sessionId,
    spawnerId,
  }),
  requestSpawnerInspection: (sessionId: MarketWorkerSessionId, requestId: number, spawnerId: number): MarketWorkerCommand => ({
    type: "requestSpawnerInspection",
    sessionId,
    requestId,
    spawnerId,
  }),
  requestUniquenessDetail: (sessionId: MarketWorkerSessionId, spawnerId: number): MarketWorkerCommand => ({
    type: "requestUniquenessDetail",
    sessionId,
    spawnerId,
  }),
  setSelectedSpawnerForCharts: (sessionId: MarketWorkerSessionId, spawnerId: number | null): MarketWorkerCommand => ({
    type: "setSelectedSpawnerForCharts",
    sessionId,
    spawnerId,
  }),
  persistenceAck: (sessionId: MarketWorkerSessionId, persistencePacketId: number, ok: boolean): MarketWorkerCommand => ({
    type: "persistenceAck",
    sessionId,
    persistencePacketId,
    ok,
  }),
};
