import type { SpawnerAgent, SpawnerEvent, SpawnerFood, SpawnerUniquenessScore } from "../spawnerSimulation";
import type { MarketWorkerSessionId } from "./workerCommandProtocol";

export type SpawnerArchitecturePacket = {
  sessionId: MarketWorkerSessionId;
  spawnerId: number;
  spawner: SpawnerAgent | null;
  packetSizeKb?: number;
};

export type SpawnerUniquenessDetailPacket = {
  sessionId: MarketWorkerSessionId;
  spawnerId: number;
  score: SpawnerUniquenessScore | null;
  skippedReason?: "population_limit";
  packetSizeKb?: number;
};

export type SpawnerInspectionPayload = {
  source: "live" | "historical";
  sessionId: string;
  workerSessionId?: MarketWorkerSessionId;
  spawnerId: number;
  tick: number;
  requestedTick?: number;
  stateSnapshotTick?: number;
  genomeSnapshotTick?: number;
  exact: boolean;
  status: "alive" | "dead" | "historical";
  spawner: SpawnerAgent;
  genome: SpawnerAgent["genome"];
  hiddenState: SpawnerAgent["hiddenState"];
  metrics: ReturnType<typeof import("../spawnerSimulation").architectureMetrics>;
  uniqueness: SpawnerUniquenessScore | null;
  recentPayoffs: number[];
  recentFoods: SpawnerFood[];
  recentEvents: SpawnerEvent[];
};

export type SpawnerInspectionPacket = {
  sessionId: MarketWorkerSessionId;
  requestId: number;
  spawnerId: number;
  ok: boolean;
  payload: SpawnerInspectionPayload | null;
  error?: "not_found" | "timeout" | "cancelled";
  packetSizeKb?: number;
};
