import type { SignalSample, WaveSettings } from "./marketSignal";
import type { MarketDataSource, MarketRuntimeConfig } from "./marketRuntimeConfig";
import type {
  SpawnerAgent,
  SpawnerConfig,
  SpawnerDirection,
  SpawnerEvent,
  SpawnerFood,
  SpawnerTelemetrySample,
  SpawnerUniquenessScore,
} from "./spawnerSimulation";

export type MarketWorkerSessionId = number;
export type MarketRunState = "idle" | "running" | "paused" | "stopped";

export type LeanSignalSample = Pick<SignalSample, "tick" | "signal" | "noise" | "parameters" | "price" | "sourceTimestamp" | "sourceDatetime">;

export type LeanPriceSample = {
  tick: number;
  price: number;
  sourceTimestamp?: number;
  sourceDatetime?: string;
};

export type ChartFoodMarker = {
  id: number;
  creatorSpawnerId: number;
  creatorLineageId: number;
  spawnTick: number;
  resolveTick: number;
  direction: SpawnerDirection;
  strength: number;
  horizonTicks: number;
  entrySignal: number;
  exitSignal?: number;
  payoff?: number;
  status: "pending" | "win" | "loss";
};

export type LeanTelemetrySample = Pick<SpawnerTelemetrySample, "tick" | "population" | "rollingLoss">;

export type LeanUniquenessTelemetrySample = {
  tick: number;
  medianRawDistance: number;
  p25RawDistance: number;
  p75RawDistance: number;
};

export type LeanSelectedUniquenessSample = {
  tick: number;
  rawDistance: number;
};

export type MarketChartPacket = {
  sessionId: MarketWorkerSessionId;
  version: number;
  renderTick: number;
  marketSource: MarketDataSource;
  currentSignal: number;
  currentNoise: number;
  currentPrice?: number;
  sourceTimestamp?: number;
  sourceDatetime?: string;
  ticksVisible: number;
  signalSamples: LeanSignalSample[];
  priceSamples?: LeanPriceSample[];
  visibleFoods: ChartFoodMarker[];
  telemetrySamples: LeanTelemetrySample[];
  telemetryStartTick: number;
  telemetryEndTick: number;
  telemetryPopulationMax: number;
  telemetryLossMax: number;
  uniquenessSamples: LeanUniquenessTelemetrySample[];
  selectedSpawnerUniquenessSamples: LeanSelectedUniquenessSample[];
  uniquenessStartTick: number;
  uniquenessEndTick: number;
  uniquenessRawDistanceMax: number;
  uniquenessSkippedReason?: "population_limit";
};

export type RosterSpawnerSummary = {
  id: number;
  lineageId: number;
  generation: number;
  birthTick: number;
  cooldownTicks: number;
  energy: number;
  health: number;
  pendingFoodCount: number;
  hitRate: number;
  recentAveragePayoff: number;
  lastAction: "long" | "short" | "wait";
  spawnedCount: number;
  resolvedCount: number;
  children: number;
  averagePayoff: number;
  activeUnits: number;
  activeLayers: number;
  activeConnections: number;
  disabledUnits: number;
  disabledConnections: number;
  recurrentConnections: number;
  skipConnections: number;
  averagePerceptionLag: number;
  longestPerceptionWindow: number;
  pendingDensityScale: number;
  topologyMutationRate: number;
  weightMutationActivity: number;
  biasMutationActivity: number;
  perceptionMutationRate: number;
  mutationProfileDrift: number;
  uniqueness: number | null;
  uniquenessComparisonTick: number | null;
};

export type MarketRosterPacket = {
  sessionId: MarketWorkerSessionId;
  version: number;
  tick: number;
  spawners: RosterSpawnerSummary[];
  recentDeathEvents: Array<{ id: number; spawnerId: number }>;
};

export type MarketStatsPacket = {
  sessionId: MarketWorkerSessionId;
  version: number;
  playing: boolean;
  runState: MarketRunState;
  persistentSessionId: string | null;
  tick: number;
  renderTick: number;
  currentSignal: number;
  currentNoise: number;
  backlogTicks: number;
  spawnerCount: number;
  pendingFoods: number;
  resolvedFoods: number;
  totalWins: number;
  totalLosses: number;
  settings: WaveSettings;
  marketConfig: MarketRuntimeConfig;
  activeMarketConfig: MarketRuntimeConfig;
  pendingMarketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  activeSpawnerConfig: SpawnerConfig;
  pendingSpawnerConfig: SpawnerConfig;
  packetSizesKb: Partial<Record<"chart" | "roster" | "stats" | "architecture" | "inspection" | "uniqueness" | "persistence", number>>;
};

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
  metrics: ReturnType<typeof import("./spawnerSimulation").architectureMetrics>;
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
  error?: "not_found" | "timeout";
  packetSizeKb?: number;
};

export type SineSpawnerStateSnapshot = {
  spawnerId: number;
  lineageId: number;
  generation: number;
  tick: number;
  energy: number;
  health: number;
  age: number;
  cooldown: number;
  hiddenState: SpawnerAgent["hiddenState"];
  lastAction: SpawnerAgent["lastAction"];
  spawnedCount: number;
  resolvedCount: number;
  wins: number;
  losses: number;
  totalPayoff: number;
  children: number;
  recentPayoffs: number[];
};

export type SineSpawnerUniquenessSnapshot = SpawnerUniquenessScore & {
  spawnerId: number;
};

export type SinePersistencePacket = {
  sessionId: MarketWorkerSessionId;
  persistentSessionId: string;
  status: Exclude<MarketRunState, "idle">;
  tick: number;
  settings: WaveSettings;
  marketConfig?: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  births: Array<{ tick: number; spawner: SpawnerAgent; parentSpawnerId?: number }>;
  deaths: Array<{ tick: number; spawner: SpawnerAgent }>;
  genomeSnapshots: Array<{ tick: number; reason: "initial" | "birth" | "manual"; spawner: SpawnerAgent }>;
  stateSnapshots: SineSpawnerStateSnapshot[];
  uniquenessSnapshots: SineSpawnerUniquenessSnapshot[];
  foodEvents: Array<{ tick: number; kind: "spawn" | "resolve"; food: SpawnerFood }>;
  events: SpawnerEvent[];
};

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

export type MarketWorkerMessage =
  | { type: "chart"; packet: MarketChartPacket }
  | { type: "roster"; packet: MarketRosterPacket }
  | { type: "stats"; packet: MarketStatsPacket }
  | { type: "architecture"; packet: SpawnerArchitecturePacket }
  | { type: "spawnerInspection"; packet: SpawnerInspectionPacket }
  | { type: "uniquenessDetail"; packet: SpawnerUniquenessDetailPacket }
  | { type: "persistence"; persistencePacketId: number; packet: SinePersistencePacket }
  | { type: "error"; sessionId: MarketWorkerSessionId; message: string };
