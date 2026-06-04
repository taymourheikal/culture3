import type { MarketStatsPacket } from "../marketWorkerProtocol";
import { Metric } from "../SineMetric";

export function RunPerformancePanel({ stats }: { stats: MarketStatsPacket }) {
  const resolved = Math.max(0, stats.totalWins + stats.totalLosses);
  const hitRate = resolved > 0 ? stats.totalWins / resolved : 0;
  return (
    <section className="sine-workbench-panel performance">
      <div className="sine-workbench-panel-head">
        <div>
          <span className="sine-eyebrow">Run Performance</span>
          <h2>Current run</h2>
        </div>
        <strong>{resolved > 0 ? `${Math.round(hitRate * 100)}% hit` : "No resolved food"}</strong>
      </div>
      <div className="sine-workbench-mini-grid">
        <Metric label="Wins" value={String(stats.totalWins)} />
        <Metric label="Losses" value={String(stats.totalLosses)} />
        <Metric label="Resolved" value={String(resolved)} />
        <Metric label="Pending" value={String(stats.pendingFoods)} />
      </div>
    </section>
  );
}
