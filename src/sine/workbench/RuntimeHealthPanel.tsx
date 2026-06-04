import type { MarketStatsPacket } from "../marketWorkerProtocol";
import { Metric } from "../SineMetric";
import { LAB_METRIC_HELP } from "../sineMetricHelp";

export function RuntimeHealthPanel({
  stats,
  backlogTicks,
  persistenceStatus,
  onOpenDiagnostics,
}: {
  stats: MarketStatsPacket;
  backlogTicks: number;
  persistenceStatus: "unknown" | "online" | "offline";
  onOpenDiagnostics?: () => void;
}) {
  return (
    <section className="sine-workbench-panel">
      <div className="sine-workbench-panel-head">
        <div>
          <span className="sine-eyebrow">Run Health</span>
          <h2>Runtime pulse</h2>
        </div>
        <div className="sine-workbench-actions">
          <strong>{stats.brainEvalMode}</strong>
          {onOpenDiagnostics ? (
            <button type="button" onClick={onOpenDiagnostics}>
              Details
            </button>
          ) : null}
        </div>
      </div>
      <div className="sine-workbench-mini-grid">
        <Metric label="Backlog" value={`${backlogTicks} ticks`} help={LAB_METRIC_HELP.backlog} />
        <Metric label="Persistence" value={persistenceStatus} />
        <Metric label="Chart packet" value={`${stats.packetSizesKb.chart?.toFixed(1) ?? "0.0"} KB`} />
        <Metric label="Roster packet" value={`${stats.packetSizesKb.roster?.toFixed(1) ?? "0.0"} KB`} />
      </div>
    </section>
  );
}
