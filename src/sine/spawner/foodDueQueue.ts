import type { SpawnerFood, SpawnerWorld } from "./types";

type PendingFoodEntry = {
  food: SpawnerFood;
  order: number;
};

type FoodDueQueueState = {
  foods: SpawnerFood[];
  nextScanIndex: number;
  nextOrder: number;
  earliestDueTick: number | undefined;
  pendingIds: Set<number>;
  bucketsByResolveTick: Map<number, PendingFoodEntry[]>;
};

const foodDueQueues = new WeakMap<SpawnerWorld, FoodDueQueueState>();

export function registerPendingFood(world: SpawnerWorld, food: SpawnerFood) {
  if (food.status !== "pending") return;
  const state = ensureFoodDueQueue(world);
  if (state.pendingIds.has(food.id)) return;
  enqueuePendingFood(state, food);
}

export function duePendingFoods(world: SpawnerWorld) {
  const state = ensureFoodDueQueue(world);
  if (state.earliestDueTick === undefined || state.earliestDueTick > world.tick) return [];
  const due: PendingFoodEntry[] = [];
  let dueBucketCount = 0;
  for (const [resolveTick, entries] of state.bucketsByResolveTick) {
    if (resolveTick > world.tick) continue;
    dueBucketCount += 1;
    due.push(...entries);
    state.bucketsByResolveTick.delete(resolveTick);
    for (const entry of entries) {
      state.pendingIds.delete(entry.food.id);
    }
  }
  state.earliestDueTick = earliestResolveTick(state.bucketsByResolveTick);
  if (dueBucketCount > 1) due.sort((left, right) => left.order - right.order);
  return due.map((entry) => entry.food);
}

export function trimResolvedFoodHistory(world: SpawnerWorld, minTick: number) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < world.foods.length; readIndex += 1) {
    const food = world.foods[readIndex];
    if (!food) continue;
    if (food.status === "pending" || food.resolveTick >= minTick) {
      world.foods[writeIndex] = food;
      writeIndex += 1;
    }
  }
  world.foods.length = writeIndex;
  const state = foodDueQueues.get(world);
  if (state?.foods === world.foods) state.nextScanIndex = world.foods.length;
}

function ensureFoodDueQueue(world: SpawnerWorld) {
  let state = foodDueQueues.get(world);
  if (!state || state.foods !== world.foods || state.nextScanIndex > world.foods.length) {
    state = rebuildFoodDueQueue(world);
    foodDueQueues.set(world, state);
    return state;
  }
  scanNewFoods(world, state);
  return state;
}

function rebuildFoodDueQueue(world: SpawnerWorld): FoodDueQueueState {
  const state: FoodDueQueueState = {
    foods: world.foods,
    nextScanIndex: 0,
    nextOrder: 0,
    earliestDueTick: undefined,
    pendingIds: new Set(),
    bucketsByResolveTick: new Map(),
  };
  scanNewFoods(world, state);
  return state;
}

function scanNewFoods(world: SpawnerWorld, state: FoodDueQueueState) {
  for (let index = state.nextScanIndex; index < world.foods.length; index += 1) {
    const food = world.foods[index];
    if (food?.status === "pending" && !state.pendingIds.has(food.id)) {
      enqueuePendingFood(state, food);
    }
  }
  state.nextScanIndex = world.foods.length;
}

function enqueuePendingFood(state: FoodDueQueueState, food: SpawnerFood) {
  const entry = { food, order: state.nextOrder };
  state.nextOrder += 1;
  state.pendingIds.add(food.id);
  state.earliestDueTick = state.earliestDueTick === undefined ? food.resolveTick : Math.min(state.earliestDueTick, food.resolveTick);
  const bucket = state.bucketsByResolveTick.get(food.resolveTick);
  if (bucket) bucket.push(entry);
  else state.bucketsByResolveTick.set(food.resolveTick, [entry]);
}

function earliestResolveTick(bucketsByResolveTick: Map<number, PendingFoodEntry[]>) {
  let earliest: number | undefined;
  for (const resolveTick of bucketsByResolveTick.keys()) {
    earliest = earliest === undefined ? resolveTick : Math.min(earliest, resolveTick);
  }
  return earliest;
}
