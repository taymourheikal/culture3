import type { SpawnerAgent } from "./agentTypes";

export type SpawnerDirection = "long" | "short";
export type FoodStatus = "pending" | "win" | "loss";

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
  entryPayoffScale?: number;
  payoffScaleWindowTicks?: number;
  payoffScaleSampleStepTicks?: number;
  entryPrice?: number;
  exitPrice?: number;
  sourceTimestamp?: number;
  exitSourceTimestamp?: number;
  traceId?: number;
  payoff?: number;
  status: FoodStatus;
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
  foodEvent?: SpawnerFoodEventSnapshot;
};

export type SpawnerFoodEventSnapshot = {
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
  entryPayoffScale?: number;
  payoffScaleWindowTicks?: number;
  payoffScaleSampleStepTicks?: number;
  entryPrice?: number;
  exitPrice?: number;
  sourceTimestamp?: number;
  exitSourceTimestamp?: number;
  traceId?: number;
  payoff?: number;
  status: FoodStatus;
};

export type SpawnerLineage = {
  id: number;
  totalBorn: number;
  totalDeaths: number;
};
