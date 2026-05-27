import type { SpawnerAgent, SpawnerConfig, SpawnerFood } from "./types";

export type SpawnerRuntimeIndex = {
  byId: Map<number, SpawnerAgent>;
  livingIds: Set<number>;
};

export type FoodRuntimeIndex = {
  pendingCount: number;
  resolvedCount: number;
  pendingByCreatorId: Map<number, number>;
};

export function isSpawnerAlive(spawner: SpawnerAgent, config: SpawnerConfig) {
  return spawner.energy > config.deathEnergy && spawner.health > config.deathHealth;
}

export function createSpawnerRuntimeIndex(spawners: SpawnerAgent[], config: SpawnerConfig): SpawnerRuntimeIndex {
  const byId = new Map<number, SpawnerAgent>();
  const livingIds = new Set<number>();
  for (const spawner of spawners) {
    byId.set(spawner.id, spawner);
    if (isSpawnerAlive(spawner, config)) livingIds.add(spawner.id);
  }
  return { byId, livingIds };
}

export function getLivingSpawner(index: SpawnerRuntimeIndex, spawnerId: number) {
  return index.livingIds.has(spawnerId) ? index.byId.get(spawnerId) ?? null : null;
}

export function createFoodRuntimeIndex(foods: SpawnerFood[]): FoodRuntimeIndex {
  const pendingByCreatorId = new Map<number, number>();
  let pendingCount = 0;
  let resolvedCount = 0;
  for (const food of foods) {
    if (food.status === "pending") {
      pendingCount += 1;
      pendingByCreatorId.set(food.creatorSpawnerId, (pendingByCreatorId.get(food.creatorSpawnerId) ?? 0) + 1);
    } else {
      resolvedCount += 1;
    }
  }
  return { pendingCount, resolvedCount, pendingByCreatorId };
}

export function pendingFoodCountForCreator(index: FoodRuntimeIndex, spawnerId: number) {
  return index.pendingByCreatorId.get(spawnerId) ?? 0;
}
