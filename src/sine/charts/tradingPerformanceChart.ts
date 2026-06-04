import type { LeanTelemetrySample } from "../marketWorkerProtocol";
import { clamp, tickToX, type ChartBounds } from "./canvas";
import { chartTheme } from "./chartTheme";
import { drawFrameGrid, prepareChartFrame } from "./chartFrame";
import { formatSignedPercent } from "./format";
import { drawZeroLine, drawZeroStripFrame, metricPanelBounds, stripPanelBounds, zeroCenteredNormalize } from "./performancePrimitives";
import { drawNormalizedLine, drawTickAxis } from "./series";
import { cumulativePayoffDomain, normalizeCumulativePayoff, type CumulativePayoffDomain } from "./tradingPerformanceScale";

export function drawTradingPerformanceChart(
  canvas: HTMLCanvasElement,
  telemetry: LeanTelemetrySample[],
  startTick: number,
  endTick: number,
  payoffAbsMax: number,
  resolvedVolumeMax: number,
  cumulativePayoffMin: number,
  cumulativePayoffMax: number,
) {
  const prepared = prepareChartFrame(canvas);
  if (!prepared) return;

  const { context, bounds } = prepared;
  const visibleStartTick = startTick <= 20 ? 1 : startTick;
  const visibleEndTick = Math.max(20, endTick);
  const stablePayoffAbsMax = Math.max(0.1, Math.abs(payoffAbsMax));
  const stableResolvedVolumeMax = Math.max(1, resolvedVolumeMax);
  const mainBounds = performanceMainBounds(bounds);
  const cumulativeBounds = performanceCumulativeBounds(bounds);
  const cumulativeDomain = cumulativePayoffDomain(cumulativePayoffMin, cumulativePayoffMax);

  drawFrameGrid({
    context,
    bounds: mainBounds,
    leftLabel: (index) => `${Math.round(100 - (100 * index) / 4)}%`,
    rightLabel: (index) => formatSignedPercent(stablePayoffAbsMax - (stablePayoffAbsMax * 2 * index) / 4),
  });
  drawZeroLine(context, mainBounds);
  drawVolumeBars(context, telemetry, mainBounds, visibleStartTick, visibleEndTick, stableResolvedVolumeMax);
  drawNormalizedLine(
    context,
    telemetry,
    mainBounds,
    visibleStartTick,
    visibleEndTick,
    chartTheme.accent,
    (sample) => clamp(sample.rollingHitRate, 0, 1),
    2.4,
    3,
  );
  drawNormalizedLine(
    context,
    telemetry,
    mainBounds,
    visibleStartTick,
    visibleEndTick,
    chartTheme.amber,
    (sample) => zeroCenteredNormalize(sample.rollingAveragePayoff, stablePayoffAbsMax),
    2.2,
    3,
  );

  drawCumulativeStrip(context, cumulativeBounds, cumulativeDomain);
  drawNormalizedLine(
    context,
    telemetry,
    cumulativeBounds,
    visibleStartTick,
    visibleEndTick,
    chartTheme.positive,
    (sample) => normalizeCumulativePayoff(sample.cumulativeNetPayoff, cumulativeDomain),
    1.8,
    2,
  );
  drawTickAxis(context, bounds, visibleStartTick, visibleEndTick);
  context.restore();
}

function performanceMainBounds(bounds: ChartBounds): ChartBounds {
  return metricPanelBounds(bounds, 40, 48);
}

function performanceCumulativeBounds(bounds: ChartBounds): ChartBounds {
  return stripPanelBounds(bounds, 44, 34, 10);
}

function drawVolumeBars(
  context: CanvasRenderingContext2D,
  samples: LeanTelemetrySample[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  volumeMax: number,
) {
  if (samples.length === 0) return;
  const barWidth = Math.max(1, (bounds.right - bounds.left) / Math.max(1, samples.length) * 0.7);
  context.fillStyle = "rgba(193, 164, 255, 0.18)";
  for (const sample of samples) {
    if (sample.tick < startTick || sample.tick > endTick || sample.resolvedVolume <= 0) continue;
    const amount = clamp(sample.resolvedVolume / volumeMax, 0, 1);
    const height = amount * (bounds.bottom - bounds.top) * 0.28;
    const x = tickToX(sample.tick, startTick, endTick, bounds);
    context.fillRect(x - barWidth / 2, bounds.bottom - height, barWidth, height);
  }
}

function drawCumulativeStrip(context: CanvasRenderingContext2D, bounds: ChartBounds, domain: CumulativePayoffDomain) {
  drawZeroStripFrame(context, bounds, domain.min, domain.max);
}
