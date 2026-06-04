import { BASE_ROC, type WaveSettings } from "./marketSignal";
import type { MarketStatsPacket } from "./marketWorkerProtocol";
import { formatSlope } from "./charts/format";
import { Metric } from "./SineMetric";

export function SineFooterMetrics({
  stats,
  settings,
  marketTick,
  worldTick,
  renderTick,
  pendingFoods,
  resolvedFoods,
  backlogTicks,
  persistenceStatus,
}: {
  stats: MarketStatsPacket;
  settings: WaveSettings;
  marketTick: number;
  worldTick: number;
  renderTick: number;
  pendingFoods: number;
  resolvedFoods: number;
  backlogTicks: number;
  persistenceStatus: "unknown" | "online" | "offline";
}) {
  return (
    <div className="sine-footer-readout">
      <Metric label="Market tick" value={String(marketTick)} />
      <Metric label="Agent tick" value={String(worldTick)} />
      <Metric label="Render tick" value={String(renderTick)} />
      <Metric label="Base ROC" value={`${BASE_ROC.toFixed(2)}%`} />
      <Metric label="Amplitude" value={`${settings.amplitude.toFixed(2)}%`} />
      <Metric label="Frequency" value={`${settings.frequency.toFixed(3)} cyc/tick`} />
      <Metric label="Slope" value={formatSlope(settings.slope)} />
      <Metric label="Noise" value={`+/-${settings.noiseAmplitude.toFixed(2)}% max`} />
      <Metric label="Spawners" value={String(stats.spawnerCount)} />
      <Metric label="Food markers" value={`${pendingFoods} pending / ${resolvedFoods} resolved`} />
      <Metric label="Catch-up backlog" value={`${backlogTicks} ticks`} />
      <Metric label="Brain eval" value={stats.brainEvalMode} />
      <Metric label="Persistence" value={persistenceStatus} />
      <Metric label="Chart packet" value={`${stats.packetSizesKb.chart?.toFixed(1) ?? "0.0"} KB`} />
      <Metric label="Roster packet" value={`${stats.packetSizesKb.roster?.toFixed(1) ?? "0.0"} KB`} />
    </div>
  );
}
