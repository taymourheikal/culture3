import type { RefObject } from "react";

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
