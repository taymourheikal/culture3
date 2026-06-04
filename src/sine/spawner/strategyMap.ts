import { finiteZero, percentileRank } from "../stats";
import { summarizeSpawnerPerformance } from "./performance";
import type { PreparedPopulationFeatureSpace } from "./populationFeatureSpace";
import { clusterPopulationStrategySpace, type StrategyClusterState } from "./strategyClustering";
import { projectPopulationStrategySpace } from "./strategyProjection";

export type StrategyMapPoint = {
  spawnerId: number;
  x: number;
  y: number;
  clusterId: number;
  clusterDistance: number;
  clusterPercentile: number;
  energy: number;
  generation: number;
  lineageId: number;
  hitRate: number;
  averagePayoff: number;
  resolvedCount: number;
};

export type StrategyMapCluster = {
  clusterId: number;
  size: number;
  centroidX: number;
  centroidY: number;
  radius: number;
  avgPayoff: number;
  hitRate: number;
  avgGeneration: number;
  dominantLineageId: number | null;
};

export type StrategyMapResult = {
  points: StrategyMapPoint[];
  clusters: StrategyMapCluster[];
  state: StrategyClusterState;
};

export function buildPopulationStrategyMap(
  featureSpace: PreparedPopulationFeatureSpace,
  previousState: StrategyClusterState | null = null,
): StrategyMapResult {
  const projections = new Map(projectPopulationStrategySpace(featureSpace).map((point) => [point.spawnerId, point]));
  const clustering = clusterPopulationStrategySpace(featureSpace, previousState);
  const clusterPoints = new Map(clustering.points.map((point) => [point.spawnerId, point]));
  const points = featureSpace.spawners.map((spawner) => {
    const projection = projections.get(spawner.id);
    const cluster = clusterPoints.get(spawner.id);
    const performance = summarizeSpawnerPerformance(spawner);
    return {
      spawnerId: spawner.id,
      x: finiteZero(projection?.x ?? 0),
      y: finiteZero(projection?.y ?? 0),
      clusterId: cluster?.clusterId ?? 0,
      clusterDistance: finiteZero(cluster?.clusterDistance ?? 0),
      clusterPercentile: finiteZero(cluster?.clusterPercentile ?? 0),
      energy: finiteZero(spawner.energy),
      generation: Math.max(0, Math.round(finiteZero(spawner.generation))),
      lineageId: Math.max(0, Math.round(finiteZero(spawner.lineageId))),
      hitRate: finiteZero(performance.hitRate),
      averagePayoff: finiteZero(performance.averagePayoff),
      resolvedCount: Math.max(0, Math.round(finiteZero(performance.resolvedCount))),
    };
  });
  const pointsByClusterId = groupStrategyMapPointsByCluster(points);
  const clusters = clustering.clusters.map((cluster) => {
    const members = pointsByClusterId.get(cluster.clusterId) ?? [];
    const centroidX = average(members.map((point) => point.x));
    const centroidY = average(members.map((point) => point.y));
    return {
      clusterId: cluster.clusterId,
      size: cluster.size,
      centroidX,
      centroidY,
      radius: finiteZero(Math.max(0, ...members.map((point) => distance2d(point.x, point.y, centroidX, centroidY)))),
      avgPayoff: finiteZero(cluster.avgPayoff),
      hitRate: finiteZero(cluster.hitRate),
      avgGeneration: finiteZero(cluster.avgGeneration),
      dominantLineageId: cluster.dominantLineageId,
    };
  });
  return {
    points: withClusterPercentiles(points, pointsByClusterId),
    clusters,
    state: clustering.state,
  };
}

export function groupStrategyMapPointsByCluster(points: StrategyMapPoint[]) {
  const grouped = new Map<number, StrategyMapPoint[]>();
  for (const point of points) {
    const members = grouped.get(point.clusterId);
    if (members) members.push(point);
    else grouped.set(point.clusterId, [point]);
  }
  return grouped;
}

function withClusterPercentiles(points: StrategyMapPoint[], pointsByClusterId: Map<number, StrategyMapPoint[]>) {
  const distancesByClusterId = new Map<number, number[]>();
  for (const [clusterId, members] of pointsByClusterId) {
    distancesByClusterId.set(clusterId, members.map((candidate) => candidate.clusterDistance));
  }
  return points.map((point) => {
    const clusterDistances = distancesByClusterId.get(point.clusterId) ?? [];
    return {
      ...point,
      clusterPercentile: clusterDistances.length <= 1 ? 0 : finiteZero(percentileRank(point.clusterDistance, clusterDistances)),
    };
  });
}

function average(values: number[]) {
  return values.length > 0 ? finiteZero(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function distance2d(x: number, y: number, centerX: number, centerY: number) {
  return finiteZero(Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2));
}
