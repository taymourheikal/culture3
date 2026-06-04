import type { CSSProperties } from "react";
import { formatSignedPercent } from "../charts/format";
import type { RosterSpawnerSummary, SelectedSpawnerTimeline, StrategyMapWindow } from "../marketWorkerProtocol";
import { createSelectedSpawnerPanelModel } from "../selectedSpawnerPanelModel";
import { Metric } from "../SineMetric";
import { LAB_METRIC_HELP } from "../sineMetricHelp";
import { ClusterContextView, createSelectedAgentClusterContext } from "./SelectedSpawnerClusterContext";
import {
  selectedSpawnerBrainMetrics,
  selectedSpawnerLearningMetrics,
  selectedSpawnerStateMetrics,
  type LabMetricDescriptor,
} from "./selectedSpawnerMetricDescriptors";
import {
  AgentBadge,
  AgentMeter,
  AgentScore,
  AgentSection,
  clampedPercent,
  MetricBar,
  payoffTone,
  signedAmount,
} from "./WorkbenchPanelShared";

export function SelectedSpawnerPanel({
  selectedSpawner,
  selectedSpawnerId,
  selectedSpawnerTimeline,
  strategyMap,
  worldTick,
  rosterTick,
  energyMax,
  healthMax,
  onInspect,
  onOpenUniqueness,
}: {
  selectedSpawner: RosterSpawnerSummary | null;
  selectedSpawnerId: number | null;
  selectedSpawnerTimeline: SelectedSpawnerTimeline | null;
  strategyMap: StrategyMapWindow | null;
  worldTick: number;
  rosterTick: number | null;
  energyMax: number;
  healthMax: number;
  onInspect: (id: number) => void;
  onOpenUniqueness: (id: number) => void;
}) {
  const model = createSelectedSpawnerPanelModel({
    selectedSpawner,
    selectedSpawnerId,
    worldTick,
    rosterTick,
    timeline: selectedSpawnerTimeline,
  });
  const clusterContext = selectedSpawnerId !== null ? createSelectedAgentClusterContext(strategyMap, selectedSpawnerId) : null;
  if (model.status === "none") {
    return null;
  }

  const id = model.id;
  return (
    <section className="sine-workbench-panel selected-spawner-panel">
      <div className="sine-workbench-panel-head">
        <div>
          <span className="sine-eyebrow">Selected Agent</span>
          <h2>Spawner #{id}</h2>
          {selectedSpawner ? (
            <div className="selected-spawner-badge-row">
              <AgentBadge label={`L${selectedSpawner.lineageId} / gen ${selectedSpawner.generation}`} tone="amber" />
              <AgentBadge label={`${model.ageTicks?.toLocaleString() ?? "--"} ticks old`} />
              <AgentBadge label={selectedSpawner.lastAction} tone={selectedSpawner.lastAction} />
            </div>
          ) : null}
        </div>
        <div className="sine-workbench-actions">
          <button type="button" onClick={() => onInspect(id)}>
            RNN
          </button>
          <button type="button" onClick={() => onOpenUniqueness(id)}>
            Unique
          </button>
        </div>
      </div>
      <ClockFreshnessStrip model={model} />
      {model.status === "missing" ? (
        <>
          <AgentSection title="Last Known Runtime State">
            <MetricGrid
              metrics={[
                { label: "Runtime status", value: "no longer live" },
                { label: "Timeline", value: model.sampleCount > 0 ? `${model.sampleCount} last-known samples` : "no samples yet" },
              ]}
            />
            <RecentBehavior sample={model.latestSample} sampleCount={model.sampleCount} missing />
          </AgentSection>
          <AgentSection title="Strategy Cluster">
            <ClusterContextView context={clusterContext} />
          </AgentSection>
        </>
      ) : selectedSpawner ? (
        <>
          <AgentSection title="State">
            <div className="selected-spawner-state-grid">
              <AgentMeter label="Energy" value={selectedSpawner.energy} max={energyMax} valueLabel={selectedSpawner.energy.toFixed(1)} tone="accent" />
              <AgentMeter label="Health" value={selectedSpawner.health} max={healthMax} valueLabel={selectedSpawner.health.toFixed(1)} tone="positive" />
            </div>
            <MetricGrid metrics={selectedSpawnerStateMetrics(selectedSpawner, model)} />
          </AgentSection>

          <AgentSection title="Performance">
            <div className="selected-spawner-performance-strip">
              <AgentScore label="Lifetime hit" value={`${Math.round(selectedSpawner.hitRate * 100)}%`} amount={selectedSpawner.hitRate} tone="accent" help={LAB_METRIC_HELP.lifetimeHit} />
              <AgentScore
                label="Lifetime avg"
                value={formatSignedPercent(selectedSpawner.averagePayoff)}
                amount={signedAmount(selectedSpawner.averagePayoff)}
                tone={payoffTone(selectedSpawner.averagePayoff)}
                help={LAB_METRIC_HELP.lifetimeAveragePayoff}
              />
              <AgentScore
                label="Recent avg"
                value={formatSignedPercent(selectedSpawner.recentAveragePayoff)}
                amount={signedAmount(selectedSpawner.recentAveragePayoff)}
                tone={payoffTone(selectedSpawner.recentAveragePayoff)}
                help={LAB_METRIC_HELP.recentAveragePayoff}
              />
            </div>
            <div className="selected-spawner-funnel">
              <span>
                <b>{selectedSpawner.spawnedCount}</b>
                spawned
              </span>
              <i style={{ "--meter-value": `${Math.round(model.spawnedResolvedRatio * 100)}%` } as CSSProperties} />
              <span>
                <b>{selectedSpawner.resolvedCount}</b>
                resolved
              </span>
              <span>
                <b>{selectedSpawner.children}</b>
                children
              </span>
            </div>
          </AgentSection>

          <AgentSection title="Recent Behavior">
            <RecentBehavior sample={model.latestSample} sampleCount={model.sampleCount} />
          </AgentSection>

          <AgentSection title="Strategy Cluster">
            <ClusterContextView context={clusterContext} />
          </AgentSection>

          <AgentSection title="Brain">
            <div className="selected-spawner-architecture-mini" aria-label="Selected agent brain architecture summary">
              <span className="architecture-stack">
                <i />
                <i />
                <i />
              </span>
              <MetricGrid metrics={selectedSpawnerBrainMetrics(selectedSpawner)} />
            </div>
          </AgentSection>

          <AgentSection title="Perception">
            <MetricBar label="Avg perception lag" value={`${selectedSpawner.averagePerceptionLag.toFixed(1)} ticks`} amount={selectedSpawner.averagePerceptionLag / Math.max(1, selectedSpawner.longestPerceptionWindow)} help={LAB_METRIC_HELP.averagePerceptionLag} />
            <MetricBar label="Longest window" value={`${Math.round(selectedSpawner.longestPerceptionWindow)} ticks`} amount={1} tone="amber" help={LAB_METRIC_HELP.longestPerceptionWindow} />
            <MetricBar label="Pending density scale" value={`${Math.round(selectedSpawner.pendingDensityScale)} ticks`} amount={selectedSpawner.pendingDensityScale / Math.max(1, selectedSpawner.longestPerceptionWindow)} tone="purple" help={LAB_METRIC_HELP.pendingDensityScale} />
          </AgentSection>

          <AgentSection title="Mutation">
            <MetricBar label="Topology mutation" value={selectedSpawner.topologyMutationRate.toFixed(3)} amount={selectedSpawner.topologyMutationRate} tone="amber" help={LAB_METRIC_HELP.topologyMutation} />
            <MetricBar label="Weight mutation" value={selectedSpawner.weightMutationActivity.toFixed(3)} amount={selectedSpawner.weightMutationActivity} help={LAB_METRIC_HELP.weightMutation} />
            <MetricBar label="Bias mutation" value={selectedSpawner.biasMutationActivity.toFixed(3)} amount={selectedSpawner.biasMutationActivity} tone="positive" help={LAB_METRIC_HELP.biasMutation} />
            <MetricBar label="Perception mutation" value={selectedSpawner.perceptionMutationRate.toFixed(3)} amount={selectedSpawner.perceptionMutationRate} tone="purple" help={LAB_METRIC_HELP.perceptionMutation} />
            <MetricBar label="Profile drift" value={selectedSpawner.mutationProfileDrift.toFixed(3)} amount={selectedSpawner.mutationProfileDrift} tone="negative" help={LAB_METRIC_HELP.profileDrift} />
          </AgentSection>

          <AgentSection title="Learning">
            <MetricGrid metrics={selectedSpawnerLearningMetrics(selectedSpawner)} />
            <MetricBar label="Learning rate" value={selectedSpawner.plasticityLearningRateMean.toFixed(3)} amount={selectedSpawner.plasticityLearningRateMean} help={LAB_METRIC_HELP.learningRate} />
            <MetricBar label="Learning decay" value={selectedSpawner.plasticityDecayRate.toFixed(3)} amount={selectedSpawner.plasticityDecayRate} tone="amber" help={LAB_METRIC_HELP.learningDecay} />
            <MetricBar label="Max learned delta" value={selectedSpawner.plasticityMaxLearnedDelta.toFixed(2)} amount={selectedSpawner.plasticityMaxLearnedDelta / 5} tone="positive" help={LAB_METRIC_HELP.maxLearnedDelta} />
            <MetricBar label="Plasticity drift" value={selectedSpawner.plasticityMutationStdDev.toFixed(3)} amount={selectedSpawner.plasticityMutationStdDev} tone="purple" help={LAB_METRIC_HELP.plasticityDrift} />
          </AgentSection>

          <button type="button" className="uniqueness-open-card" onClick={() => onOpenUniqueness(selectedSpawner.id)}>
            <span>Uniqueness percentile</span>
            <strong>{selectedSpawner.uniqueness !== null ? `${Math.round(selectedSpawner.uniqueness * 100)}%` : "not sampled"}</strong>
            {selectedSpawner.uniquenessComparisonTick !== null ? <small>tick {selectedSpawner.uniquenessComparisonTick}</small> : null}
          </button>
        </>
      ) : (
        <>
          <AgentSection title="Runtime State">
            <MetricGrid
              metrics={[
                { label: "Roster", value: model.status === "outside_roster_packet" ? "outside current roster packet" : "waiting for roster snapshot" },
                { label: "Timeline", value: model.sampleCount > 0 ? `${model.sampleCount} samples` : "no samples yet" },
              ]}
            />
            <RecentBehavior sample={model.latestSample} sampleCount={model.sampleCount} />
          </AgentSection>
          <AgentSection title="Strategy Cluster">
            <ClusterContextView context={clusterContext} />
          </AgentSection>
        </>
      )}
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: LabMetricDescriptor[] }) {
  return (
    <div className="selected-spawner-grid">
      {metrics.map((metric) => (
        <Metric key={metric.label} label={metric.label} value={metric.value} help={metric.help} />
      ))}
    </div>
  );
}

function ClockFreshnessStrip({ model }: { model: ReturnType<typeof createSelectedSpawnerPanelModel> }) {
  return (
    <div className="selected-spawner-clock-strip" aria-label="Selected agent data freshness">
      <span>Agent tick {model.worldTick.toLocaleString()}</span>
      <span>Roster {model.rosterTick === null ? "none" : model.rosterTick.toLocaleString()}</span>
      <span>Recent {model.latestSampleTick === null ? "none" : model.latestSampleTick.toLocaleString()}</span>
    </div>
  );
}

function RecentBehavior({
  sample,
  sampleCount,
  missing = false,
}: {
  sample: SelectedSpawnerTimeline["samples"][number] | null;
  sampleCount: number;
  missing?: boolean;
}) {
  if (!sample) {
    return <div className="selected-spawner-empty">{missing ? "No last-known behavior samples." : "Waiting for recent behavior samples."}</div>;
  }
  return (
    <div className="selected-spawner-recent">
      <div className="selected-spawner-performance-strip">
        <AgentScore label="Rolling hit" value={`${Math.round(sample.rollingHitRate * 100)}%`} amount={sample.rollingHitRate} help={LAB_METRIC_HELP.rollingHit} />
        <AgentScore
          label="Rolling avg"
          value={formatSignedPercent(sample.rollingAveragePayoff)}
          amount={signedAmount(sample.rollingAveragePayoff)}
          tone={payoffTone(sample.rollingAveragePayoff)}
          help={LAB_METRIC_HELP.rollingAveragePayoff}
        />
        <AgentScore label="Rolling loss" value={formatSignedPercent(-sample.rollingLoss)} amount={signedAmount(sample.rollingLoss)} tone="negative" help={LAB_METRIC_HELP.rollingLoss} />
      </div>
      <div className="selected-spawner-action-mix" aria-label="Recent selected agent action mix">
        <span className="long" style={{ "--mix-value": `${clampedPercent(sample.longRate)}%` } as CSSProperties}>
          long
        </span>
        <span className="short" style={{ "--mix-value": `${clampedPercent(sample.shortRate)}%` } as CSSProperties}>
          short
        </span>
        <span className="wait" style={{ "--mix-value": `${clampedPercent(sample.waitRate)}%` } as CSSProperties}>
          wait
        </span>
      </div>
      <MetricGrid
        metrics={[
          { label: "Open trend", value: `${sample.openTrades} open` },
          { label: "Learned norm", value: sample.learnedDeltaNorm.toFixed(3), help: LAB_METRIC_HELP.learnedDeltaNorm },
          { label: "Samples", value: String(sampleCount) },
        ]}
      />
    </div>
  );
}
