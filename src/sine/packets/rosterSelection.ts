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
  const addBucket = (bucket: SpawnerAgent[]) => {
    for (const spawner of bucket) add(spawner);
  };

  add(selected);
  addBucket(selectTop(spawners, founderQuota, (left, right) => left.id - right.id));
  addBucket(
    selectTop(spawners, generationQuota, (left, right) => right.generation - left.generation || right.id - left.id),
  );
  addBucket(
    selectTop(
      spawners,
      recentQuota,
      (left, right) => (pendingCounts.get(right.id) ?? 0) - (pendingCounts.get(left.id) ?? 0) || right.birthTick - left.birthTick || right.id - left.id,
      (spawner) => spawner.lastAction !== "wait" || (pendingCounts.get(spawner.id) ?? 0) > 0,
    ),
  );
  addBucket(selectTop(spawners, newestQuota, (left, right) => right.birthTick - left.birthTick || right.id - left.id));

  if (selectedById.size < boundedLimit) {
    addBucket(
      selectTop(spawners, boundedLimit, (left, right) => right.birthTick - left.birthTick || right.generation - left.generation || right.id - left.id),
    );
  }

  return [...selectedById.values()].sort((left, right) => left.id - right.id);
}

function selectTop(
  spawners: SpawnerAgent[],
  limit: number,
  compare: (left: SpawnerAgent, right: SpawnerAgent) => number,
  accept: (spawner: SpawnerAgent) => boolean = () => true,
) {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0) return [];
  const selected: SpawnerAgent[] = [];
  for (const spawner of spawners) {
    if (!accept(spawner)) continue;
    insertSorted(selected, spawner, compare);
    if (selected.length > boundedLimit) selected.pop();
  }
  return selected;
}

function insertSorted(selected: SpawnerAgent[], spawner: SpawnerAgent, compare: (left: SpawnerAgent, right: SpawnerAgent) => number) {
  let index = selected.length;
  while (index > 0 && compare(spawner, selected[index - 1]!) < 0) index -= 1;
  selected.splice(index, 0, spawner);
}
