import type { MarketStatsPacket } from "../marketWorkerProtocol";
import { Metric } from "../SineMetric";
import { reproductionCostMultiplierMeterPercent, reproductionRequirementMeterPercent } from "../SineWorkbenchMetrics";
import { WorkbenchMeter } from "./WorkbenchPanelShared";

export function PopulationHealthPanel({ stats }: { stats: MarketStatsPacket }) {
  return (
    <section className="sine-workbench-panel emphasis">
      <div className="sine-workbench-panel-head">
        <div>
          <span className="sine-eyebrow">Population Health</span>
          <h2>Scarcity and survival</h2>
        </div>
        <strong>{Math.round(stats.populationRoomRatio * 100)}% room</strong>
      </div>
      <div className="sine-workbench-meter-stack">
        <WorkbenchMeter label="Living population" value={`${stats.spawnerCount} / ${stats.activeSpawnerConfig.maxSpawners}`} amount={populationPercent(stats)} />
        <WorkbenchMeter
          label="Repro required"
          value={`${stats.currentReproductionEnergyRequirement.toFixed(1)} energy`}
          amount={reproductionRequirementMeterPercent(stats)}
        />
        <WorkbenchMeter
          label="Repro cost multiplier"
          value={`${stats.reproductionCostMultiplier.toFixed(2)}x`}
          amount={reproductionCostMultiplierMeterPercent(stats)}
        />
      </div>
      <div className="sine-workbench-mini-grid">
        <Metric label="Birth pressure" value={`${stats.currentReproductionCost.toFixed(1)} energy`} />
        <Metric label="Pending food" value={String(stats.pendingFoods)} />
        <Metric label="Resolved food" value={String(stats.resolvedFoods)} />
      </div>
    </section>
  );
}

function populationPercent(stats: MarketStatsPacket) {
  return stats.activeSpawnerConfig.maxSpawners > 0 ? (stats.spawnerCount / stats.activeSpawnerConfig.maxSpawners) * 100 : 0;
}
