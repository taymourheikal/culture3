import type { WaveSettings } from "../marketSignal";
import type { MarketDataSource, MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { SpawnerConfig } from "../spawnerSimulation";

export type MarketWorkerSessionId = number;
export type MarketRunState = "idle" | "running" | "paused" | "stopped";

export const MARKET_WORKER_COMMAND_TYPES = [
  "start",
  "pause",
  "stop",
  "reset",
  "setSettings",
  "setMarketConfig",
  "setPlaybackSettings",
  "setMarketSource",
  "setSpawnerConfig",
  "replaceSpawnerConfig",
  "requestPackets",
  "requestSpawnerArchitecture",
  "requestSpawnerInspection",
  "requestUniquenessDetail",
  "setSelectedSpawnerForCharts",
  "persistenceAck",
] as const;

export type MarketWorkerCommand =
  | { type: "start"; sessionId: MarketWorkerSessionId }
  | { type: "pause"; sessionId: MarketWorkerSessionId }
  | { type: "stop"; sessionId: MarketWorkerSessionId }
  | { type: "reset"; sessionId: MarketWorkerSessionId; marketConfig: MarketRuntimeConfig; spawnerConfig: SpawnerConfig }
  | { type: "setSettings"; sessionId: MarketWorkerSessionId; patch: Partial<WaveSettings> }
  | { type: "setMarketConfig"; sessionId: MarketWorkerSessionId; patch: Partial<MarketRuntimeConfig> }
  | { type: "setPlaybackSettings"; sessionId: MarketWorkerSessionId; patch: Partial<MarketRuntimeConfig["playback"]> }
  | { type: "setMarketSource"; sessionId: MarketWorkerSessionId; source: MarketDataSource }
  | { type: "setSpawnerConfig"; sessionId: MarketWorkerSessionId; patch: Partial<SpawnerConfig> }
  | { type: "replaceSpawnerConfig"; sessionId: MarketWorkerSessionId; spawnerConfig: SpawnerConfig }
  | { type: "requestPackets"; sessionId: MarketWorkerSessionId }
  | { type: "requestSpawnerArchitecture"; sessionId: MarketWorkerSessionId; spawnerId: number }
  | { type: "requestSpawnerInspection"; sessionId: MarketWorkerSessionId; requestId: number; spawnerId: number }
  | { type: "requestUniquenessDetail"; sessionId: MarketWorkerSessionId; spawnerId: number }
  | { type: "setSelectedSpawnerForCharts"; sessionId: MarketWorkerSessionId; spawnerId: number | null }
  | { type: "persistenceAck"; sessionId: MarketWorkerSessionId; persistencePacketId: number; ok: boolean };

export type ListedMarketWorkerCommandType = (typeof MARKET_WORKER_COMMAND_TYPES)[number];
export type MarketWorkerCommandTypeParity =
  MarketWorkerCommand["type"] extends ListedMarketWorkerCommandType
    ? ListedMarketWorkerCommandType extends MarketWorkerCommand["type"]
      ? true
      : never
    : never;
