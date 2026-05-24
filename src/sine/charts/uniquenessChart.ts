import type { LeanSelectedUniquenessSample, LeanUniquenessTelemetrySample } from "../marketWorkerProtocol";
import { clamp, prepareCanvas, tickToX, type ChartBounds } from "./canvas";
import { drawNormalizedLine, drawTickAxis } from "./series";

export function drawUniquenessChart(
  canvas: HTMLCanvasElement,
  samples: LeanUniquenessTelemetrySample[],
  selectedSamples: LeanSelectedUniquenessSample[],
  startTick: number,
  endTick: number,
  rawDistanceMax: number,
  skippedReason?: "population_limit",
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
  const stableRawDistanceMax = Math.max(1, rawDistanceMax);

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

    const rawDistanceLabel = stableRawDistanceMax - (stableRawDistanceMax * index) / 4;
    context.textAlign = "right";
    context.fillText(rawDistanceLabel.toFixed(rawDistanceLabel >= 10 ? 0 : 2), bounds.left - 10, y);
  }

  drawTickAxis(context, bounds, visibleStartTick, visibleEndTick);

  if (samples.length === 0) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#9eb0ad";
    context.font = "800 13px Inter, system-ui, sans-serif";
    context.fillText(
      skippedReason === "population_limit" ? "Uniqueness paused above population limit" : "Waiting for uniqueness samples",
      cssWidth / 2,
      cssHeight / 2,
    );
    context.restore();
    return;
  }

  drawBand(context, samples, bounds, visibleStartTick, visibleEndTick, stableRawDistanceMax);
  drawAggregateLine(context, samples, bounds, visibleStartTick, visibleEndTick, stableRawDistanceMax);
  drawSelectedLine(context, selectedSamples, bounds, visibleStartTick, visibleEndTick, stableRawDistanceMax);

  if (skippedReason === "population_limit") {
    context.textAlign = "right";
    context.textBaseline = "top";
    context.fillStyle = "#f4c568";
    context.font = "800 11px Inter, system-ui, sans-serif";
    context.fillText("paused above population limit", bounds.right, bounds.top + 4);
  }

  context.restore();
}

function drawBand(
  context: CanvasRenderingContext2D,
  samples: LeanUniquenessTelemetrySample[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  max: number,
) {
  const drawableSamples = extendAggregateSamples(samples, endTick);
  context.beginPath();
  drawableSamples.forEach((sample, index) => {
    const x = tickToX(sample.tick, startTick, endTick, bounds);
    const y = rawDistanceToY(sample.p75RawDistance, max, bounds);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  for (let index = drawableSamples.length - 1; index >= 0; index -= 1) {
    const sample = drawableSamples[index];
    if (!sample) continue;
    context.lineTo(tickToX(sample.tick, startTick, endTick, bounds), rawDistanceToY(sample.p25RawDistance, max, bounds));
  }
  context.closePath();
  context.fillStyle = "rgba(185, 137, 255, 0.18)";
  context.fill();
}

function drawAggregateLine(
  context: CanvasRenderingContext2D,
  samples: LeanUniquenessTelemetrySample[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  max: number,
) {
  drawNormalizedLine(context, extendAggregateSamples(samples, endTick), bounds, startTick, endTick, "#b989ff", (sample) => sample.medianRawDistance / max, 2.6, 3.6);
}

function drawSelectedLine(
  context: CanvasRenderingContext2D,
  samples: LeanSelectedUniquenessSample[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  max: number,
) {
  drawNormalizedLine(context, extendSelectedSamples(samples, endTick), bounds, startTick, endTick, "#f4c568", (sample) => sample.rawDistance / max, 2.2, 3.6);
}

function rawDistanceToY(rawDistance: number, max: number, bounds: Pick<ChartBounds, "top" | "bottom">) {
  return bounds.bottom - clamp(rawDistance / max, 0, 1) * (bounds.bottom - bounds.top);
}

function extendAggregateSamples(samples: LeanUniquenessTelemetrySample[], endTick: number) {
  const last = samples.at(-1);
  if (!last || last.tick >= endTick) return samples;
  return [...samples, { ...last, tick: endTick }];
}

function extendSelectedSamples(samples: LeanSelectedUniquenessSample[], endTick: number) {
  const last = samples.at(-1);
  if (!last || last.tick >= endTick) return samples;
  return [...samples, { ...last, tick: endTick }];
}
