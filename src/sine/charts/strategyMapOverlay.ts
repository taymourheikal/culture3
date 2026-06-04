import type { StrategyMapClusterPacket, StrategyMapPointPacket } from "../marketWorkerProtocol";

export type StrategyMapOverlayCluster = Pick<StrategyMapClusterPacket, "clusterId"> & {
  centroidX: number;
  centroidY: number;
  radius: number;
};

export function visibleClusterOverlays(
  visiblePoints: StrategyMapPointPacket[],
  clusters: StrategyMapClusterPacket[],
): StrategyMapOverlayCluster[] {
  return clusters.flatMap((cluster) => {
    const members = visiblePoints.filter((point) => point.clusterId === cluster.clusterId);
    if (members.length === 0) return [];
    const centroidX = average(members.map((point) => point.x));
    const centroidY = average(members.map((point) => point.y));
    return [{
      clusterId: cluster.clusterId,
      centroidX,
      centroidY,
      radius: finiteDistanceRadius(members, centroidX, centroidY),
    }];
  });
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function finiteDistanceRadius(points: StrategyMapPointPacket[], centroidX: number, centroidY: number) {
  return Math.max(0, ...points.map((point) => Math.hypot(point.x - centroidX, point.y - centroidY)).filter(Number.isFinite));
}
