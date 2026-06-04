import type { RosterSpawnerSummary } from "./marketWorkerProtocol";

export type RosterSortKey =
  | "id"
  | "generation"
  | "energy"
  | "health"
  | "pendingFoodCount"
  | "hitRate"
  | "averagePayoff"
  | "recentAveragePayoff"
  | "children"
  | "activeConnections"
  | "uniqueness";

export type RosterSortDirection = "asc" | "desc";
export type RosterActionFilter = "all" | RosterSpawnerSummary["lastAction"];

export type RosterViewFilters = {
  search: string;
  action: RosterActionFilter;
  minResolvedTrades: string;
  minAgeTicks: string;
};

export type RosterViewOptions = {
  sortKey: RosterSortKey;
  sortDirection: RosterSortDirection;
  filters: RosterViewFilters;
  tick: number;
};

export type VisiblePopulationComposition = {
  totalVisible: number;
  actionCounts: Record<RosterSpawnerSummary["lastAction"], number>;
  generationBuckets: Array<{ label: string; count: number }>;
  lineageCount: number;
  pendingFoodAgents: number;
  newbornAgents: number;
  uniquenessSampled: number;
  uniquenessMissing: number;
};

export const DEFAULT_ROSTER_FILTERS: RosterViewFilters = {
  search: "",
  action: "all",
  minResolvedTrades: "",
  minAgeTicks: "",
};

export function viewRosterSpawners(spawners: RosterSpawnerSummary[], options: RosterViewOptions) {
  return sortRosterSpawners(filterRosterSpawners(spawners, options), options.sortKey, options.sortDirection);
}

export function filterRosterSpawners(spawners: RosterSpawnerSummary[], options: Pick<RosterViewOptions, "filters" | "tick">) {
  const search = options.filters.search.trim().toLowerCase();
  const minResolvedTrades = parseMinimumFilter(options.filters.minResolvedTrades);
  const minAgeTicks = parseMinimumFilter(options.filters.minAgeTicks);
  return spawners.filter((spawner) => {
    if (options.filters.action !== "all" && spawner.lastAction !== options.filters.action) return false;
    if (minResolvedTrades !== null && spawner.resolvedCount < minResolvedTrades) return false;
    if (minAgeTicks !== null && spawnerAgeTicks(spawner, options.tick) < minAgeTicks) return false;
    if (search && !matchesSpawnerSearch(spawner, search)) return false;
    return true;
  });
}

export function sortRosterSpawners(spawners: RosterSpawnerSummary[], sortKey: RosterSortKey, direction: RosterSortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return spawners
    .map((spawner, index) => ({ spawner, index }))
    .sort((left, right) => {
      const compared = compareRosterValues(rosterSortValue(left.spawner, sortKey), rosterSortValue(right.spawner, sortKey), multiplier);
      return compared === 0 ? left.index - right.index : compared * multiplier;
    })
    .map(({ spawner }) => spawner);
}

export function createVisiblePopulationComposition(spawners: RosterSpawnerSummary[], tick: number): VisiblePopulationComposition {
  const actionCounts: VisiblePopulationComposition["actionCounts"] = { long: 0, short: 0, wait: 0 };
  const generationBuckets = [
    { label: "gen 0", count: 0 },
    { label: "gen 1", count: 0 },
    { label: "gen 2", count: 0 },
    { label: "gen 3-5", count: 0 },
    { label: "gen 6+", count: 0 },
  ];
  const lineages = new Set<number>();
  let pendingFoodAgents = 0;
  let newbornAgents = 0;
  let uniquenessSampled = 0;

  for (const spawner of spawners) {
    actionCounts[spawner.lastAction] += 1;
    lineages.add(spawner.lineageId);
    if (spawner.pendingFoodCount > 0) pendingFoodAgents += 1;
    if (isNewbornSpawner(spawner, tick)) newbornAgents += 1;
    if (spawner.uniqueness !== null) uniquenessSampled += 1;
    const bucket = generationBuckets[generationBucketIndex(spawner.generation)];
    if (bucket) bucket.count += 1;
  }

  return {
    totalVisible: spawners.length,
    actionCounts,
    generationBuckets,
    lineageCount: lineages.size,
    pendingFoodAgents,
    newbornAgents,
    uniquenessSampled,
    uniquenessMissing: Math.max(0, spawners.length - uniquenessSampled),
  };
}

export function isNewbornSpawner(spawner: Pick<RosterSpawnerSummary, "birthTick">, tick: number) {
  return spawnerAgeTicks(spawner, tick) <= 7;
}

export function spawnerAgeTicks(spawner: Pick<RosterSpawnerSummary, "birthTick">, tick: number) {
  return Math.max(0, Math.floor(tick - spawner.birthTick));
}

function parseMinimumFilter(value: string) {
  if (value.trim() === "") return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function matchesSpawnerSearch(spawner: RosterSpawnerSummary, search: string) {
  return String(spawner.id).includes(search) || String(spawner.lineageId).includes(search) || `l${spawner.lineageId}`.includes(search);
}

function rosterSortValue(spawner: RosterSpawnerSummary, sortKey: RosterSortKey) {
  return spawner[sortKey];
}

function compareRosterValues(left: number | null, right: number | null, multiplier: number) {
  if (left === null && right === null) return 0;
  if (left === null) return 1 * multiplier;
  if (right === null) return -1 * multiplier;
  return left - right;
}

function generationBucketIndex(generation: number) {
  if (generation <= 0) return 0;
  if (generation === 1) return 1;
  if (generation === 2) return 2;
  if (generation <= 5) return 3;
  return 4;
}
