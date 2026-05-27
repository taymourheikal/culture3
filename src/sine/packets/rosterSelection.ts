import type { SpawnerAgent, SpawnerFood } from "../spawnerSimulation";
import { createFoodRuntimeIndex } from "../spawner/runtimeIndex";

export const ROSTER_AGENT_LIMIT = 160;

export function buildPendingFoodCountMap(foods: SpawnerFood[]) {
  return createFoodRuntimeIndex(foods).pendingByCreatorId;
}

export function selectRosterSpawners({
  spawners,
  foods = [],
  pendingFoodCounts,
  selectedSpawnerId = null,
  limit = ROSTER_AGENT_LIMIT,
}: {
  spawners: SpawnerAgent[];
  foods?: SpawnerFood[];
  pendingFoodCounts?: Map<number, number>;
  selectedSpawnerId?: number | null;
  limit?: number;
}) {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0) return [];
  if (spawners.length <= boundedLimit) return [...spawners];

  const pendingCounts = pendingFoodCounts ?? buildPendingFoodCountMap(foods);
  const selected = selectedSpawnerId === null ? undefined : spawners.find((spawner) => spawner.id === selectedSpawnerId);
  const selectedReserve = selected ? 1 : 0;
  const quotaBase = Math.max(1, boundedLimit - selectedReserve);
  const founderQuota = Math.min(20, Math.max(1, Math.ceil(quotaBase * 0.15)));
  const recentQuota = Math.min(40, Math.max(1, Math.ceil(quotaBase * 0.25)));
  const generationQuota = Math.min(50, Math.max(1, Math.ceil(quotaBase * 0.3)));
  const newestQuota = Math.max(1, quotaBase - founderQuota - recentQuota - generationQuota);
  const selectedById = new Map<number, SpawnerAgent>();

  const add = (spawner: SpawnerAgent | undefined) => {
    if (!spawner || selectedById.size >= boundedLimit) return;
    selectedById.set(spawner.id, spawner);
  };
  const addBucket = (bucket: SpawnerAgent[], quota: number) => {
    for (const spawner of bucket.slice(0, Math.max(0, quota))) add(spawner);
  };

  add(selected);
  addBucket([...spawners].sort((left, right) => left.id - right.id), founderQuota);
  addBucket(
    [...spawners].sort((left, right) => right.generation - left.generation || right.id - left.id),
    generationQuota,
  );
  addBucket(
    spawners
      .filter((spawner) => spawner.lastAction !== "wait" || (pendingCounts.get(spawner.id) ?? 0) > 0)
      .sort((left, right) => (pendingCounts.get(right.id) ?? 0) - (pendingCounts.get(left.id) ?? 0) || right.birthTick - left.birthTick || right.id - left.id),
    recentQuota,
  );
  addBucket([...spawners].sort((left, right) => right.birthTick - left.birthTick || right.id - left.id), newestQuota);

  if (selectedById.size < boundedLimit) {
    addBucket([...spawners].sort((left, right) => right.birthTick - left.birthTick || right.generation - left.generation || right.id - left.id), boundedLimit);
  }

  return [...selectedById.values()].sort((left, right) => left.id - right.id);
}
