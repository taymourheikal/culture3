import type { SeededRng } from "./rng";

export type SpawnerDirection = "long" | "short";
export type FoodStatus = "pending" | "win" | "loss";
export type GateType = "update" | "reset" | "candidate";
export type OutputName = "long" | "short" | "strength" | "horizon" | "cooldown";

export type ConnectionSource =
  | { kind: "input"; index: number }
  | { kind: "hidden"; unitId: number; mode: "current" | "previous" };

export type ConnectionTarget =
  | { kind: "hidden"; unitId: number; gate: GateType }
  | { kind: "output"; index: number };

export type SpawnerConfig = {
  initialSpawners: number;
  tickSeconds: number;
  maxSpawners: number;
  foodHistorySeconds: number;
  initialEnergyMin: number;
  initialEnergyMax: number;
  initialHealth: number;
  initialCooldownMax: number;
  spawnThreshold: number;
  spawnCost: number;
  minimumSpawnEnergySurplus: number;
  minSignalStrength: number;
  pendingDensityDivisor: number;
  metabolism: number;
  rewardScale: number;
  lossHealthScale: number;
  healthGainScale: number;
  recentResolvedPayoffWindow: number;
  agentRecentPayoffWindow: number;
  reproductionEnergy: number;
  reproductionCost: number;
  reproductionMinResolved: number;
  reproductionMinAveragePayoff: number;
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
  cooldownOutputMultiplier: number;
  baseMutationStdDev: number;
  mutationStdDevMutationStdDev: number;
  mutationStdDevMin: number;
  mutationStdDevMax: number;
  thresholdBiasInitialStdDev: number;
  thresholdBiasMutationStdDev: number;
  thresholdBiasMin: number;
  thresholdBiasMax: number;
  initialMinHorizonMin: number;
  initialMinHorizonMax: number;
  initialMaxHorizonMin: number;
  initialMaxHorizonMax: number;
  minHorizonMutationStdDev: number;
  maxHorizonMutationStdDev: number;
  minHorizonClampMin: number;
  minHorizonClampMax: number;
  maxHorizonClampMin: number;
  maxHorizonClampMax: number;
  cooldownBaseInitialMin: number;
  cooldownBaseInitialMax: number;
  cooldownBaseMutationStdDev: number;
  cooldownBaseClampMin: number;
  cooldownBaseClampMax: number;
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
  minHorizon: number;
  maxHorizon: number;
  cooldownBase: number;
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
  age: number;
  cooldown: number;
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
  time: number;
  spawnerId: number;
  lineageId: number;
  foodId?: number;
  childSpawnerId?: number;
  status?: FoodStatus;
  payoff?: number;
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
  spawnTime: number;
  resolveTime: number;
  direction: SpawnerDirection;
  strength: number;
  horizon: number;
  entrySignal: number;
  exitSignal?: number;
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
  time: number;
  nextEventId: number;
  nextSpawnerId: number;
  nextLineageId: number;
  nextFoodId: number;
  spawners: SpawnerAgent[];
  foods: SpawnerFood[];
  recentEvents: SpawnerEvent[];
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
