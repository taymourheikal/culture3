import { finiteZero, percentileRank } from "../stats";
import { summarizeSpawnerPerformance } from "./performance";
import type { PreparedPopulationFeatureSpace } from "./populationFeatureSpace";

export type StrategyClusterPoint = {
  spawnerId: number;
  clusterId: number;
  clusterDistance: number;
  clusterPercentile: number;
};

export type StrategyClusterSummary = {
  clusterId: number;
  size: number;
  centroid: number[];
  radius: number;
  avgPayoff: number;
  hitRate: number;
  avgGeneration: number;
  dominantLineageId: number | null;
};

export type StrategyClusterState = {
  nextClusterId: number;
  clusters: Array<{ clusterId: number; centroid: number[]; radius: number }>;
};

export type StrategyClusteringResult = {
  points: StrategyClusterPoint[];
  clusters: StrategyClusterSummary[];
  state: StrategyClusterState;
};

const MAX_CLUSTERS = 8;
const ITERATIONS = 18;
const EPSILON = 1e-9;

export function clusterPopulationStrategySpace(
  featureSpace: PreparedPopulationFeatureSpace,
  previousState: StrategyClusterState | null = null,
): StrategyClusteringResult {
  const rows = featureSpace.spawners.map((spawner) => ({
    spawner,
    row: featureSpace.normalizedRows.get(spawner.id) ?? [],
  }));
  if (rows.length === 0) return { points: [], clusters: [], state: { nextClusterId: previousState?.nextClusterId ?? 1, clusters: [] } };
  const width = rows[0]?.row.length ?? 0;
  const k = chooseClusterCount(rows.map((entry) => entry.row), width);
  const centroids = runKMeans(rows.map((entry) => entry.row), k, width);
  const assignments = rows.map((entry) => nearestCentroid(entry.row, centroids));
  const distances = rows.map((entry, index) => euclidean(entry.row, centroids[assignments[index] ?? 0] ?? []));
  const clusterRadii = centroids.map((_, clusterIndex) => clusterRadius(assignments, distances, clusterIndex));
  const remap = remapClusterIds(centroids, clusterRadii, previousState);
  const points = rows.map((entry, index) => {
    const clusterIndex = assignments[index] ?? 0;
    const clusterDistances = distances.filter((_, distanceIndex) => assignments[distanceIndex] === clusterIndex);
    const distance = finiteZero(distances[index] ?? 0);
    return {
      spawnerId: entry.spawner.id,
      clusterId: remap.ids[clusterIndex] ?? 0,
      clusterDistance: distance,
      clusterPercentile: clusterDistances.length <= 1 ? 0 : percentileRank(distance, clusterDistances),
    };
  });
  const clusters = centroids.map((centroid, clusterIndex) =>
    summarizeCluster(remap.ids[clusterIndex] ?? 0, centroid, rows, assignments, distances, clusterIndex),
  ).filter((cluster) => cluster.size > 0);
  return {
    points,
    clusters,
    state: {
      nextClusterId: remap.nextClusterId,
      clusters: clusters.map((cluster) => ({ clusterId: cluster.clusterId, centroid: cluster.centroid, radius: cluster.radius })),
    },
  };
}

function chooseClusterCount(rows: number[][], width: number) {
  if (rows.length < 4 || width === 0 || allRowsIdentical(rows)) return 1;
  return Math.max(1, Math.min(MAX_CLUSTERS, Math.floor(Math.sqrt(rows.length / 2)) + 1, rows.length));
}

function allRowsIdentical(rows: number[][]) {
  const first = rows[0] ?? [];
  return rows.every((row) => euclidean(row, first) <= EPSILON);
}

function runKMeans(rows: number[][], k: number, width: number) {
  if (k <= 1 || rows.length === 0 || width === 0) return [centroid(rows, width)];
  let centroids = initialCentroids(rows, k, width);
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const groups = centroids.map(() => [] as number[][]);
    for (const row of rows) groups[nearestCentroid(row, centroids)]?.push(row);
    const next = groups.map((group, index) => (group.length > 0 ? centroid(group, width) : centroids[index] ?? zero(width)));
    if (centroids.every((item, index) => euclidean(item, next[index] ?? []) <= EPSILON)) break;
    centroids = next;
  }
  return centroids;
}

function initialCentroids(rows: number[][], k: number, width: number) {
  const centroids = [rows[0] ?? zero(width)];
  while (centroids.length < k) {
    let candidate = rows[0] ?? zero(width);
    let candidateDistance = -1;
    for (const row of rows) {
      const distance = Math.min(...centroids.map((centroidRow) => euclidean(row, centroidRow)));
      if (distance > candidateDistance + EPSILON) {
        candidate = row;
        candidateDistance = distance;
      }
    }
    if (candidateDistance <= EPSILON) break;
    centroids.push(candidate);
  }
  return centroids.map((row) => row.map(finiteZero));
}

function nearestCentroid(row: number[], centroids: number[][]) {
  let selected = 0;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centroids.length; index += 1) {
    const distance = euclidean(row, centroids[index] ?? []);
    if (distance < selectedDistance - EPSILON) {
      selected = index;
      selectedDistance = distance;
    }
  }
  return selected;
}

function centroid(rows: number[][], width: number) {
  if (rows.length === 0) return zero(width);
  return Array.from({ length: width }, (_, index) => finiteZero(rows.reduce((sum, row) => sum + (row[index] ?? 0), 0) / rows.length));
}

const CLUSTER_REUSE_RADIUS_MULTIPLIER = 2.5;
const CLUSTER_REUSE_DISTANCE_FLOOR = 0.35;

function remapClusterIds(centroids: number[][], radii: number[], previousState: StrategyClusterState | null) {
  const ids = Array.from({ length: centroids.length }, () => 0);
  let nextClusterId = previousState?.nextClusterId ?? 1;
  const available = [...(previousState?.clusters ?? [])];
  for (let index = 0; index < centroids.length; index += 1) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let previousIndex = 0; previousIndex < available.length; previousIndex += 1) {
      const distance = euclidean(centroids[index] ?? [], available[previousIndex]?.centroid ?? []);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = previousIndex;
      }
    }
    const previous = bestIndex >= 0 ? available[bestIndex] : undefined;
    if (previous && bestDistance <= clusterReuseThreshold(previous.radius, radii[index] ?? 0)) {
      ids[index] = previous.clusterId;
      available.splice(bestIndex, 1);
    } else {
      ids[index] = nextClusterId;
      nextClusterId += 1;
    }
  }
  return { ids, nextClusterId };
}

function clusterReuseThreshold(previousRadius: number, currentRadius: number) {
  return Math.max(CLUSTER_REUSE_DISTANCE_FLOOR, finiteZero(previousRadius), finiteZero(currentRadius)) * CLUSTER_REUSE_RADIUS_MULTIPLIER;
}

function clusterRadius(assignments: number[], distances: number[], clusterIndex: number) {
  const memberDistances = distances.filter((_, index) => assignments[index] === clusterIndex);
  return finiteZero(Math.max(0, ...memberDistances));
}

function summarizeCluster(
  clusterId: number,
  centroidRow: number[],
  rows: Array<{ spawner: PreparedPopulationFeatureSpace["spawners"][number]; row: number[] }>,
  assignments: number[],
  distances: number[],
  clusterIndex: number,
): StrategyClusterSummary {
  const members = rows.filter((_, index) => assignments[index] === clusterIndex);
  const memberDistances = distances.filter((_, index) => assignments[index] === clusterIndex);
  const lineageCounts = new Map<number, number>();
  let totalPayoff = 0;
  let totalResolved = 0;
  let totalWins = 0;
  let totalGeneration = 0;
  for (const member of members) {
    const performance = summarizeSpawnerPerformance(member.spawner);
    totalPayoff += performance.totalPayoff;
    totalResolved += performance.resolvedCount;
    totalWins += performance.wins;
    totalGeneration += member.spawner.generation;
    lineageCounts.set(member.spawner.lineageId, (lineageCounts.get(member.spawner.lineageId) ?? 0) + 1);
  }
  const size = Math.max(1, members.length);
  return {
    clusterId,
    size: members.length,
    centroid: centroidRow.map(finiteZero),
    radius: finiteZero(Math.max(0, ...memberDistances)),
    avgPayoff: totalResolved > 0 ? finiteZero(totalPayoff / totalResolved) : 0,
    hitRate: totalResolved > 0 ? finiteZero(totalWins / totalResolved) : 0,
    avgGeneration: finiteZero(totalGeneration / size),
    dominantLineageId: dominantLineage(lineageCounts),
  };
}

function dominantLineage(counts: Map<number, number>) {
  let selected: number | null = null;
  let selectedCount = -1;
  for (const [lineageId, count] of counts) {
    if (count > selectedCount || (count === selectedCount && selected !== null && lineageId < selected)) {
      selected = lineageId;
      selectedCount = count;
    }
  }
  return selected;
}

function euclidean(left: number[], right: number[]) {
  const width = Math.max(left.length, right.length);
  let squared = 0;
  for (let index = 0; index < width; index += 1) squared += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  return finiteZero(Math.sqrt(Math.max(0, squared)));
}

function zero(width: number) {
  return Array.from({ length: width }, () => 0);
}
