import type { MarketStatsPacket } from "./marketWorkerProtocol";
import { Metric } from "./SineMetric";
import { LAB_METRIC_HELP } from "./sineMetricHelp";
import { SineWorkbenchModal } from "./SineWorkbenchModal";

export function RuntimeDiagnosticsModal({
  stats,
  backlogTicks,
  persistenceStatus,
  persistentSessionId,
  onClose,
}: {
  stats: MarketStatsPacket;
  backlogTicks: number;
  persistenceStatus: "unknown" | "online" | "offline";
  persistentSessionId: string | null;
  onClose: () => void;
}) {
  return (
    <SineWorkbenchModal title="Runtime Diagnostics" eyebrow="Worker Health" onClose={onClose}>
      <div className="sine-modal-metric-grid">
        <Metric label="Run state" value={stats.runState} />
        <Metric label="Brain eval" value={stats.brainEvalMode} />
        <Metric label="Backlog" value={`${backlogTicks} ticks`} help={LAB_METRIC_HELP.backlog} />
        <Metric label="Persistence" value={persistenceStatus} />
        <Metric label="Session" value={persistentSessionId ? persistentSessionId.slice(0, 8) : "not persisted"} />
        <Metric label="Population" value={`${stats.spawnerCount} / ${stats.activeSpawnerConfig.maxSpawners}`} />
        <Metric label="Pending food" value={String(stats.pendingFoods)} />
        <Metric label="Resolved food" value={String(stats.resolvedFoods)} />
        <Metric label="Chart packet" value={`${stats.packetSizesKb.chart?.toFixed(1) ?? "0.0"} KB`} />
        <Metric label="Roster packet" value={`${stats.packetSizesKb.roster?.toFixed(1) ?? "0.0"} KB`} />
        <Metric label="Stats packet" value={`${stats.packetSizesKb.stats?.toFixed(1) ?? "0.0"} KB`} />
        <Metric label="Persistence packet" value={`${stats.packetSizesKb.persistence?.toFixed(1) ?? "0.0"} KB`} />
        <Metric label="Pending events" value={String(stats.persistenceOutbox.pendingEvents)} />
        <Metric label="Pending uniqueness" value={String(stats.persistenceOutbox.pendingUniquenessSnapshots)} />
        <Metric label="In-flight write" value={stats.persistenceOutbox.hasInFlight ? "yes" : "no"} />
        <Metric label="In-flight size" value={stats.persistenceOutbox.inFlightPacketKb === null ? "0.0 KB" : `${stats.persistenceOutbox.inFlightPacketKb.toFixed(1)} KB`} />
        <Metric label="Pending status" value={stats.persistenceOutbox.pendingStatus ?? "none"} />
        <Metric label="Retry pending" value={stats.persistenceOutbox.retryPending ? "yes" : "no"} />
      </div>
    </SineWorkbenchModal>
  );
}
