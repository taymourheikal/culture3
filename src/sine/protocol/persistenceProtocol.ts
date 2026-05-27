import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type {
  SpawnerAgent,
  SpawnerConfig,
  SpawnerEvent,
  SpawnerFood,
  SpawnerLearnedState,
  SpawnerPlasticityProfile,
  SpawnerUniquenessScore,
} from "../spawnerSimulation";
import type { MarketRunState, MarketWorkerSessionId } from "./workerCommandProtocol";

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
  learnedState: SpawnerLearnedState;
  learnedDeltaNorm: number;
  recentLearningSignal: number;
  learningUpdateCount: number;
  reproductionLearningCount: number;
  plasticityLearningRateMean: number;
  plasticityDecayRate: number;
  plasticityMaxLearnedDelta: number;
  plasticityProfile: SpawnerPlasticityProfile;
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
