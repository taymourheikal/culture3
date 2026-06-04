import type { RefObject } from "react";
import type { StrategyMapViewOptions } from "./charts/strategyMapChart";

export function SineTelemetryCharts({
  telemetryCanvasRef,
  uniquenessCanvasRef,
}: {
  telemetryCanvasRef: RefObject<HTMLCanvasElement | null>;
  uniquenessCanvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <>
      <div className="sine-chart-wrap telemetry-chart-wrap">
        <div className="telemetry-chart-title">Population & Loss</div>
        <canvas ref={telemetryCanvasRef} className="telemetry-canvas" />
        <div className="telemetry-legend">
          <span className="legend-population">Spawner population</span>
          <span className="legend-loss">Rolling loss</span>
        </div>
      </div>

      <div className="sine-chart-wrap uniqueness-chart-wrap">
        <div className="uniqueness-chart-title">Uniqueness Over Time</div>
        <canvas ref={uniquenessCanvasRef} className="uniqueness-canvas" />
        <div className="uniqueness-legend">
          <span className="legend-uniqueness-median">Median raw distance</span>
          <span className="legend-uniqueness-band">p25-p75</span>
          <span className="legend-uniqueness-selected">Selected spawner</span>
        </div>
      </div>
    </>
  );
}

export function SineStrategyMapChart({
  canvasRef,
  viewOptions,
  onChangeViewOptions,
  onCanvasClick,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewOptions: StrategyMapViewOptions;
  onChangeViewOptions: (patch: Partial<StrategyMapViewOptions>) => void;
  onCanvasClick: (clientX: number, clientY: number) => void;
}) {
  return (
    <div className="sine-chart-wrap strategy-map-chart-wrap">
      <div className="strategy-map-chart-title">Population Strategy Map</div>
      <div className="strategy-map-controls" aria-label="Population strategy map controls">
        <label>
          Color
          <select value={viewOptions.colorMode} onChange={(event) => onChangeViewOptions({ colorMode: event.target.value as StrategyMapViewOptions["colorMode"] })}>
            <option value="cluster">Cluster</option>
            <option value="payoff">Payoff</option>
            <option value="lineage">Lineage</option>
            <option value="generation">Generation</option>
          </select>
        </label>
        <label>
          Size
          <select value={viewOptions.sizeMode} onChange={(event) => onChangeViewOptions({ sizeMode: event.target.value as StrategyMapViewOptions["sizeMode"] })}>
            <option value="energy">Energy</option>
            <option value="resolved">Resolved trades</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
        <label>
          Min trades
          <input
            type="number"
            min={0}
            max={999}
            step={1}
            value={viewOptions.minResolvedTrades}
            onChange={(event) => onChangeViewOptions({ minResolvedTrades: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
          />
        </label>
        <label className="strategy-map-toggle">
          <input type="checkbox" checked={viewOptions.showCenters} onChange={(event) => onChangeViewOptions({ showCenters: event.target.checked })} />
          Centers
        </label>
      </div>
      <canvas
        ref={canvasRef}
        className="strategy-map-canvas"
        onClick={(event) => onCanvasClick(event.clientX, event.clientY)}
      />
      <div className="strategy-map-legend">
        <span className="legend-strategy-cluster">Clustered in normalized strategy space</span>
        <span className="legend-strategy-pca">Projected with PCA for display</span>
      </div>
    </div>
  );
}

export function SineTradingPerformanceChart({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="sine-chart-wrap trading-performance-chart-wrap">
      <div className="trading-performance-chart-title">Trading Performance</div>
      <canvas ref={canvasRef} className="trading-performance-canvas" />
      <div className="trading-performance-legend">
        <span className="legend-hit-rate">Rolling hit rate</span>
        <span className="legend-average-payoff">Rolling avg payoff</span>
        <span className="legend-resolved-volume">Resolved volume</span>
        <span className="legend-cumulative-payoff">Cumulative net payoff</span>
      </div>
    </div>
  );
}
