import { type SpawnerTelemetrySample } from "../spawnerSimulation";
import { clamp, firstTickAtOrAfter, niceTickStep, prepareCanvas, tickToX, type ChartBounds } from "./canvas";
import { formatSignedPercent } from "./format";

export function drawTelemetryChart(canvas: HTMLCanvasElement, telemetry: SpawnerTelemetrySample[]) {
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
  const firstRetainedTick = telemetry[0]?.tick ?? 1;
  const lastTick = Math.max(20, telemetry.at(-1)?.tick ?? 20);
  const visibleStartTick = firstRetainedTick <= 20 ? 1 : firstRetainedTick;
  const visibleEndTick = lastTick;
  const visibleSamples = telemetry.filter((sample) => sample.tick >= visibleStartTick && sample.tick <= visibleEndTick);
  const populationMax = Math.max(20, ...visibleSamples.map((sample) => sample.population));
  const lossMax = Math.max(0.1, ...visibleSamples.map((sample) => sample.rollingLoss)) * 1.18;

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

    const populationLabel = Math.round(populationMax - (populationMax * index) / 4);
    const lossLabel = lossMax - (lossMax * index) / 4;
    context.textAlign = "right";
    context.fillText(String(populationLabel), bounds.left - 10, y);
    context.textAlign = "left";
    context.fillText(formatSignedPercent(lossLabel), bounds.right + 10, y);
  }

  context.textAlign = "center";
  context.textBaseline = "top";
  const tickStep = niceTickStep(visibleEndTick - visibleStartTick);
  for (let tick = firstTickAtOrAfter(visibleStartTick, tickStep); tick <= visibleEndTick; tick += tickStep) {
    const x = tickToX(tick, visibleStartTick, visibleEndTick, bounds);
    context.strokeStyle = "rgba(255, 255, 255, 0.055)";
    context.beginPath();
    context.moveTo(x, bounds.top);
    context.lineTo(x, bounds.bottom);
    context.stroke();
    context.fillStyle = "#8ea19e";
    context.fillText(String(tick), x, bounds.bottom + 10);
  }

  drawTelemetrySeries(context, visibleSamples, bounds, visibleStartTick, visibleEndTick, "#69d7d0", (sample) =>
    populationMax <= 0 ? 0 : sample.population / populationMax,
  );
  drawTelemetrySeries(context, visibleSamples, bounds, visibleStartTick, visibleEndTick, "#ff8f70", (sample) =>
    lossMax <= 0 ? 0 : sample.rollingLoss / lossMax,
  );
  context.restore();
}

function drawTelemetrySeries(
  context: CanvasRenderingContext2D,
  samples: SpawnerTelemetrySample[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  color: string,
  normalize: (sample: SpawnerTelemetrySample) => number,
) {
  if (samples.length === 0) return;

  context.beginPath();
  samples.forEach((sample, index) => {
    const x = tickToX(sample.tick, startTick, endTick, bounds);
    const y = bounds.bottom - clamp(normalize(sample), 0, 1) * (bounds.bottom - bounds.top);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = 2.6;
  context.shadowBlur = 12;
  context.shadowColor = `${color}55`;
  context.stroke();
  context.shadowBlur = 0;
}
