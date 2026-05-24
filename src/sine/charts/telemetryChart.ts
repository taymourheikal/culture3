import type { LeanTelemetrySample } from "../marketWorkerProtocol";
import { prepareCanvas, type ChartBounds } from "./canvas";
import { formatSignedPercent } from "./format";
import { drawNormalizedLine, drawTickAxis } from "./series";

export function drawTelemetryChart(
  canvas: HTMLCanvasElement,
  telemetry: LeanTelemetrySample[],
  startTick: number,
  endTick: number,
  populationMax: number,
  lossMax: number,
) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;

  const { context, cssWidth, cssHeight } = prepared;
  const bounds = {
    left: 54,
    right: cssWidth - 54,
    top: 32,
    bottom: cssHeight - 42,
  };
  const chartHeight = bounds.bottom - bounds.top;
  const visibleStartTick = startTick <= 20 ? 1 : startTick;
  const visibleEndTick = Math.max(20, endTick);
  const stablePopulationMax = Math.max(20, populationMax);
  const stableLossMax = Math.max(0.1, lossMax);

  context.fillStyle = "#0d1216";
  context.fillRect(0, 0, cssWidth, cssHeight);

  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.fillStyle = "#8ea19e";
  context.font = "600 11px Inter, system-ui, sans-serif";
  context.textBaseline = "middle";
  for (let index = 0; index <= 4; index += 1) {
    const y = bounds.top + (chartHeight * index) / 4;
    context.beginPath();
    context.moveTo(bounds.left, y);
    context.lineTo(bounds.right, y);
    context.stroke();

    const populationLabel = Math.round(stablePopulationMax - (stablePopulationMax * index) / 4);
    const lossLabel = stableLossMax - (stableLossMax * index) / 4;
    context.textAlign = "right";
    context.fillText(String(populationLabel), bounds.left - 10, y);
    context.textAlign = "left";
    context.fillText(formatSignedPercent(lossLabel), bounds.right + 10, y);
  }

  drawTickAxis(context, bounds, visibleStartTick, visibleEndTick);

  drawTelemetrySeries(context, telemetry, bounds, visibleStartTick, visibleEndTick, "#69d7d0", (sample) =>
    stablePopulationMax <= 0 ? 0 : sample.population / stablePopulationMax,
  );
  drawTelemetrySeries(context, telemetry, bounds, visibleStartTick, visibleEndTick, "#ff8f70", (sample) =>
    stableLossMax <= 0 ? 0 : sample.rollingLoss / stableLossMax,
  );
  context.restore();
}

function drawTelemetrySeries(
  context: CanvasRenderingContext2D,
  samples: LeanTelemetrySample[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  color: string,
  normalize: (sample: LeanTelemetrySample) => number,
) {
  if (samples.length === 0) return;

  drawNormalizedLine(context, samples, bounds, startTick, endTick, color, normalize, 2.6);
}
