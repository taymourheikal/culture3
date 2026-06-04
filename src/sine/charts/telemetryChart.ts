import type { LeanTelemetrySample } from "../marketWorkerProtocol";
import { type ChartBounds } from "./canvas";
import { chartTheme } from "./chartTheme";
import { drawFrameGrid, prepareChartFrame } from "./chartFrame";
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
  const prepared = prepareChartFrame(canvas);
  if (!prepared) return;

  const { context, bounds } = prepared;
  const visibleStartTick = startTick <= 20 ? 1 : startTick;
  const visibleEndTick = Math.max(20, endTick);
  const stablePopulationMax = Math.max(20, populationMax);
  const stableLossMax = Math.max(0.1, lossMax);

  drawFrameGrid({
    context,
    bounds,
    leftLabel: (index) => String(Math.round(stablePopulationMax - (stablePopulationMax * index) / 4)),
    rightLabel: (index) => formatSignedPercent(stableLossMax - (stableLossMax * index) / 4),
  });

  drawTickAxis(context, bounds, visibleStartTick, visibleEndTick);

  drawTelemetrySeries(context, telemetry, bounds, visibleStartTick, visibleEndTick, chartTheme.accent, (sample) =>
    stablePopulationMax <= 0 ? 0 : sample.population / stablePopulationMax,
  );
  drawTelemetrySeries(context, telemetry, bounds, visibleStartTick, visibleEndTick, chartTheme.negative, (sample) =>
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
