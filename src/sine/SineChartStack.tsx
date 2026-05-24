import type { RefObject } from "react";
import { formatSignedPercent } from "./charts/format";
import { isBtcSource, sourceLabel, type MarketRuntimeConfig } from "./marketRuntimeConfig";

export function SineChartStack({
  activeMarketConfig,
  currentSignal,
  currentNoise,
  priceCanvasRef,
  noiseCanvasRef,
  parameterCanvasRef,
  onSignalChartClick,
}: {
  activeMarketConfig: MarketRuntimeConfig;
  currentSignal: number;
  currentNoise: number;
  priceCanvasRef: RefObject<HTMLCanvasElement | null>;
  noiseCanvasRef: RefObject<HTMLCanvasElement | null>;
  parameterCanvasRef: RefObject<HTMLCanvasElement | null>;
  onSignalChartClick: (clientX: number, clientY: number) => void;
}) {
  return (
    <>
      <div className="sine-chart-wrap price-chart-wrap">
        <canvas
          ref={priceCanvasRef}
          className="sine-canvas"
          onClick={(event) => onSignalChartClick(event.clientX, event.clientY)}
          title="Click a food marker to select its spawner"
        />
        <div className="time-marker-label">Current tick</div>
      </div>

      {isBtcSource(activeMarketConfig.source) ? (
        <div className="sine-chart-wrap noise-chart-wrap btc-price-chart-wrap">
          <div className="noise-chart-title">
            <span>{sourceLabel(activeMarketConfig.source)} Price</span>
            <strong>{formatSignedPercent(currentSignal)}</strong>
          </div>
          <canvas ref={noiseCanvasRef} className="noise-canvas btc-price-canvas" />
          <div className="time-marker-label noise-marker-label">Current tick</div>
        </div>
      ) : (
        <>
          <div className="sine-chart-wrap noise-chart-wrap">
            <div className="noise-chart-title">
              <span>Smooth random noise</span>
              <strong>{formatSignedPercent(currentNoise)}</strong>
            </div>
            <canvas ref={noiseCanvasRef} className="noise-canvas" />
            <div className="time-marker-label noise-marker-label">Current tick</div>
          </div>

          <div className="sine-chart-wrap parameter-chart-wrap">
            <div className="parameter-chart-title">Effective parameters</div>
            <canvas ref={parameterCanvasRef} className="parameter-canvas" />
            <div className="parameter-legend">
              <span className="legend-amplitude">Amplitude</span>
              <span className="legend-frequency">Frequency</span>
              <span className="legend-slope">Slope</span>
              <span className="legend-noise-amplitude">Noise amp</span>
              <span className="legend-noise-frequency">Noise rough</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
