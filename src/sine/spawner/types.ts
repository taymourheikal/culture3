import type { SeededRng } from "./rng";

export type SpawnerDirection = "long" | "short";
export type FoodStatus = "pending" | "win" | "loss";
export type GateType = "update" | "reset" | "candidate";
export type OutputName = "long" | "short" | "strength" | "horizon" | "cooldown" | "reproduce";

export type ConnectionSource =
  | { kind: "input"; index: number }
  | { kind: "hidden"; unitId: number; mode: "current" | "previous" };

export type ConnectionTarget =
  | { kind: "hidden"; unitId: number; gate: GateType }
  | { kind: "output"; index: number };

export type SpawnerConfig = {
  initialSpawners: number;
  maxSpawners: number;
  foodHistoryTicks: number;
  initialEnergyMin: number;
  initialEnergyMax: number;
  initialHealth: number;
  initialCooldownMaxTicks: number;
  spawnThreshold: number;
  spawnCost: number;
  minimumSpawnEnergySurplus: number;
  minSignalStrength: number;
  defaultDeltaLag1FromTicks: number;
  defaultDeltaLag1ToTicks: number;
  defaultDeltaLag2FromTicks: number;
  defaultDeltaLag2ToTicks: number;
  defaultDeltaLag3FromTicks: number;
  defaultDeltaLag3ToTicks: number;
  defaultDeltaLag4FromTicks: number;
  defaultDeltaLag4ToTicks: number;
  defaultDeltaLag5FromTicks: number;
  defaultDeltaLag5ToTicks: number;
  defaultRollingWindowTicks: number;
  defaultLocalScaleWindowTicks: number;
  defaultLocalScaleSampleStepTicks: number;
  defaultTrendWindowTicks: number;
  defaultCycleWindowTicks: number;
  defaultRoughnessSensitivity: number;
  defaultPendingDensityScale: number;
  founderPerceptionRandomizationTicks: number;
  perceptionMutationRate: number;
  perceptionLagMutationStdDev: number;
  perceptionWindowMutationStdDev: number;
  perceptionSensitivityMutationStdDev: number;
  perceptionDensityScaleMutationStdDev: number;
  mutationProfileMutationStdDev: number;
  energyDrainPerTick: number;
  rewardScale: number;
  lossHealthScale: number;
  healthGainScale: number;
  recentResolvedPayoffWindow: number;
  agentRecentPayoffWindow: number;
  uniquenessPopulationLimit: number;
  reproductionEnergy: number;
  reproductionCost: number;
  initialReproductionOutputBias: number;
  deathEnergy: number;
  deathHealth: number;
  transactionCost: number;
  initialHiddenUnitsMin: number;
  initialHiddenUnitsMax: number;
  initialInputConnectionsPerUnit: number;
  initialRecurrentConnectionsPerUnit: number;
  initialOutputConnectionsPerOutput: number;
  newUnitInitialConnections: number;
  newUnitExistingLayerChance: number;
  newUnitNewLayerChance: number;
  addUnitRate: number;
  disableUnitRate: number;
  reenableUnitRate: number;
  addConnectionRate: number;
  disableConnectionRate: number;
  reenableConnectionRate: number;
  allowSkipConnections: number;
  allowInputToOutputConnections: number;
  weightMutationRate: number;
  weightMutationStdDev: number;
  weightReplaceRate: number;
  newConnectionWeightStdDev: number;
  biasMutationRate: number;
  biasMutationStdDev: number;
  gateBiasStdDev: number;
  outputBiasStdDev: number;
  brainEnergyCostPerActiveUnit: number;
  brainEnergyCostPerActiveConnection: number;
  brainEnergyCostPerActiveLayer: number;
  cooldownOutputMultiplierTicks: number;
  thresholdBiasInitialStdDev: number;
  thresholdBiasMutationStdDev: number;
  thresholdBiasMin: number;
  thresholdBiasMax: number;
  initialMinHorizonTicksMin: number;
  initialMinHorizonTicksMax: number;
  initialMaxHorizonTicksMin: number;
  initialMaxHorizonTicksMax: number;
  minHorizonTicksMutationStdDev: number;
  maxHorizonTicksMutationStdDev: number;
  minHorizonTicksClampMin: number;
  minHorizonTicksClampMax: number;
  maxHorizonTicksClampMin: number;
  maxHorizonTicksClampMax: number;
  cooldownBaseTicksInitialMin: number;
  cooldownBaseTicksInitialMax: number;
  cooldownBaseTicksMutationStdDev: number;
  cooldownBaseTicksClampMin: number;
  cooldownBaseTicksClampMax: number;
};

export type HiddenUnitGene = {
  unitId: number;
  innovationId: number;
  layerIndex: number;
  enabled: boolean;
  updateBias: number;
  resetBias: number;
  candidateBias: number;
};

export type ConnectionGene = {
  innovationId: number;
  source: ConnectionSource;
  target: ConnectionTarget;
  weight: number;
  enabled: boolean;
};

export type SpawnerPerceptionLagPair = {
  fromTicks: number;
  toTicks: number;
};

export type SpawnerPerception = {
  deltaLagPairs: SpawnerPerceptionLagPair[];
  rollingWindowTicks: number;
  localScaleWindowTicks: number;
  localScaleSampleStepTicks: number;
  trendWindowTicks: number;
  cycleWindowTicks: number;
  roughnessSensitivity: number;
  pendingDensityScale: number;
};

export type SpawnerMutationProfile = {
  addUnitRate: number;
  disableUnitRate: number;
  reenableUnitRate: number;
  addConnectionRate: number;
  disableConnectionRate: number;
  reenableConnectionRate: number;
  weightMutationRate: number;
  weightMutationStdDev: number;
  weightReplaceRate: number;
  newConnectionWeightStdDev: number;
  gateBiasMutationRate: number;
  gateBiasMutationStdDev: number;
  outputBiasMutationRate: number;
  outputBiasMutationStdDev: number;
  perceptionMutationRate: number;
  perceptionLagMutationStdDev: number;
  perceptionWindowMutationStdDev: number;
  perceptionSensitivityMutationStdDev: number;
  perceptionDensityScaleMutationStdDev: number;
  thresholdBiasMutationStdDev: number;
  minHorizonTicksMutationStdDev: number;
  maxHorizonTicksMutationStdDev: number;
  cooldownBaseTicksMutationStdDev: number;
  mutationProfileMutationStdDev: number;
};

export type InnovationRegistry = {
  nextInnovationId: number;
  connectionInnovations: Record<string, number>;
};

export type SpawnerGenome = {
  units: HiddenUnitGene[];
  connections: ConnectionGene[];
  outputBias: number[];
  nextUnitId: number;
  mutationStd: number;
  thresholdBias: number;
  minHorizonTicks: number;
  maxHorizonTicks: number;
  cooldownBaseTicks: number;
  perception: SpawnerPerception;
  mutationProfile: SpawnerMutationProfile;
};

export type SpawnerAgent = {
  id: number;
  lineageId: number;
  generation: number;
  birthTick: number;
  parentSpawnerId?: number;
  genome: SpawnerGenome;
  hiddenState: Record<number, number>;
  energy: number;
  health: number;
  ageTicks: number;
  cooldownTicks: number;
  spawnedCount: number;
  resolvedCount: number;
  wins: number;
  losses: number;
  totalPayoff: number;
  children: number;
  lastAction: "long" | "short" | "wait";
  recentPayoffs: number[];
};

export type SpawnerEvent = {
  id: number;
  kind: "spawn" | "resolve" | "reproduction" | "death";
  tick: number;
  spawnerId: number;
  lineageId: number;
  foodId?: number;
  childSpawnerId?: number;
  status?: FoodStatus;
  payoff?: number;
  spawnerSnapshot?: SpawnerAgent;
  childSpawnerSnapshot?: SpawnerAgent;
  foodSnapshot?: SpawnerFood;
};

export type SpawnerLineage = {
  id: number;
  totalBorn: number;
  totalDeaths: number;
};

export type SpawnerFood = {
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
  entryPrice?: number;
  exitPrice?: number;
  sourceTimestamp?: number;
  exitSourceTimestamp?: number;
  payoff?: number;
  status: FoodStatus;
};

export type SpawnerTelemetrySample = {
  tick: number;
  population: number;
  rollingLoss: number;
  lossRate: number;
  cumulativeLoss: number;
  cumulativeNetPayoff: number;
  averageActiveUnits: number;
  averageActiveConnections: number;
  averageActiveLayers: number;
};

export type SpawnerWorld = {
  seed: number;
  rng: SeededRng;
  tick: number;
  nextEventId: number;
  nextSpawnerId: number;
  nextLineageId: number;
  nextFoodId: number;
  spawners: SpawnerAgent[];
  foods: SpawnerFood[];
  recentEvents: SpawnerEvent[];
  eventSink?: (event: SpawnerEvent) => void;
  lineages: Record<number, SpawnerLineage>;
  cumulativeLoss: number;
  cumulativeNetPayoff: number;
  totalResolved: number;
  totalLosses: number;
  recentResolvedPayoffs: number[];
  telemetry: SpawnerTelemetrySample[];
  config: SpawnerConfig;
  innovations: InnovationRegistry;
};
