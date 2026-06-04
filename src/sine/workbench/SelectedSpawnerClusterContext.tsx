import { formatSignedPercent } from "../charts/format";
import type { StrategyMapWindow } from "../marketWorkerProtocol";
import { Metric } from "../SineMetric";
import { LAB_METRIC_HELP } from "../sineMetricHelp";
import { AgentScore, MetricBar, payoffTone, signedAmount } from "./WorkbenchPanelShared";

export type SelectedAgentClusterContext =
  | { status: "missing"; label: string }
  | {
      status: "ready";
      tick: number;
      clusterId: number;
      clusterSize: number;
      clusterDistance: number;
      clusterPercentile: number;
      clusterAvgPayoff: number;
      clusterHitRate: number;
    };

export function createSelectedAgentClusterContext(strategyMap: StrategyMapWindow | null, spawnerId: number): SelectedAgentClusterContext {
  if (!strategyMap) return { status: "missing", label: "waiting for strategy map sample" };
  if (strategyMap.status === "skipped") return { status: "missing", label: "strategy map paused above population limit" };
  if (strategyMap.status !== "ready") return { status: "missing", label: "waiting for strategy map sample" };
  const point = strategyMap.points.find((entry) => entry.spawnerId === spawnerId);
  if (!point) return { status: "missing", label: "selected agent not in latest strategy map" };
  const cluster = strategyMap.clusters.find((entry) => entry.clusterId === point.clusterId);
  if (!cluster) return { status: "missing", label: "cluster summary unavailable" };
  return {
    status: "ready",
    tick: strategyMap.tick,
    clusterId: point.clusterId,
    clusterSize: cluster.size,
    clusterDistance: point.clusterDistance,
    clusterPercentile: point.clusterPercentile,
    clusterAvgPayoff: cluster.avgPayoff,
    clusterHitRate: cluster.hitRate,
  };
}

export function ClusterContextView({ context }: { context: SelectedAgentClusterContext | null }) {
  if (!context || context.status !== "ready") {
    return <div className="selected-spawner-empty">{context?.label ?? "waiting for strategy map sample"}</div>;
  }
  return (
    <>
      <div className="selected-spawner-grid">
        <Metric label="Cluster" value={`#${context.clusterId}`} />
        <Metric label="Cluster size" value={context.clusterSize.toLocaleString()} />
        <Metric label="Map tick" value={context.tick.toLocaleString()} />
        <Metric label="Center distance" value={context.clusterDistance.toFixed(3)} help={LAB_METRIC_HELP.clusterDistance} />
      </div>
      <MetricBar
        label="Within-cluster percentile"
        value={`${Math.round(context.clusterPercentile * 100)}%`}
        amount={context.clusterPercentile}
        tone="purple"
        help={LAB_METRIC_HELP.clusterPercentile}
      />
      <div className="selected-spawner-performance-strip">
        <AgentScore label="Cluster hit" value={`${Math.round(context.clusterHitRate * 100)}%`} amount={context.clusterHitRate} help={LAB_METRIC_HELP.clusterHit} />
        <AgentScore
          label="Cluster avg"
          value={formatSignedPercent(context.clusterAvgPayoff)}
          amount={signedAmount(context.clusterAvgPayoff)}
          tone={payoffTone(context.clusterAvgPayoff)}
          help={LAB_METRIC_HELP.clusterAveragePayoff}
        />
      </div>
    </>
  );
}
