import type { SineSessionAnalysis } from "./sineHistoryTypes";

export function HistoricalTelemetryChart({ telemetry }: { telemetry: SineSessionAnalysis["telemetry"] }) {
  if (telemetry.length === 0) return <div className="sine-history-empty">No population snapshots saved for this run.</div>;
  const width = 640;
  const height = 150;
  const maxTick = Math.max(...telemetry.map((point) => point.tick), 1);
  const maxPopulation = Math.max(...telemetry.map((point) => point.population), 1);
  const maxLoss = Math.max(...telemetry.map((point) => point.rollingLoss), 1);
  const populationPath = toPath(telemetry, width, height, maxTick, maxPopulation, "population");
  const lossPath = toPath(telemetry, width, height, maxTick, maxLoss, "rollingLoss");
  return (
    <div className="sine-history-chart">
      <div className="sine-history-section-title">Population & Rolling Loss</div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Saved run population and rolling loss">
        <path d={populationPath} className="history-population-line" />
        <path d={lossPath} className="history-loss-line" />
      </svg>
      <div className="sine-history-legend">
        <span className="legend-population">Population</span>
        <span className="legend-loss">Rolling loss</span>
      </div>
    </div>
  );
}

function toPath(
  telemetry: SineSessionAnalysis["telemetry"],
  width: number,
  height: number,
  maxTick: number,
  maxValue: number,
  key: "population" | "rollingLoss",
) {
  return telemetry
    .map((point, index) => {
      const x = (point.tick / maxTick) * width;
      const y = height - (Number(point[key]) / maxValue) * (height - 12) - 6;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
