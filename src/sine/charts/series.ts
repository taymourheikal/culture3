import { clamp, firstTickAtOrAfter, niceTickStep, tickToX, type ChartBounds } from "./canvas";
import { chartTheme } from "./chartTheme";

export function drawTickAxis(
  context: CanvasRenderingContext2D,
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
) {
  context.textAlign = "center";
  context.textBaseline = "top";
  const tickStep = niceTickStep(endTick - startTick);
  for (let tick = firstTickAtOrAfter(startTick, tickStep); tick <= endTick; tick += tickStep) {
    const x = tickToX(tick, startTick, endTick, bounds);
    context.strokeStyle = chartTheme.gridFaint;
    context.beginPath();
    context.moveTo(x, bounds.top);
    context.lineTo(x, bounds.bottom);
    context.stroke();
    context.fillStyle = chartTheme.textMuted;
    context.fillText(String(tick), x, bounds.bottom + 10);
  }
}

export function drawNormalizedLine<T extends { tick: number }>(
  context: CanvasRenderingContext2D,
  samples: T[],
  bounds: ChartBounds,
  startTick: number,
  endTick: number,
  color: string,
  normalize: (sample: T) => number,
  width: number,
  pointRadius = 0,
) {
  if (samples.length === 0) return;
  if (samples.length === 1 && pointRadius > 0) {
    const sample = samples[0];
    if (!sample) return;
    const x = tickToX(sample.tick, startTick, endTick, bounds);
    const y = normalizedToY(normalize(sample), bounds);
    context.beginPath();
    context.arc(x, y, pointRadius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.shadowBlur = 10;
    context.shadowColor = `${color}55`;
    context.fill();
    context.shadowBlur = 0;
    return;
  }

  context.beginPath();
  samples.forEach((sample, index) => {
    const x = tickToX(sample.tick, startTick, endTick, bounds);
    const y = normalizedToY(normalize(sample), bounds);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = width;
  context.shadowBlur = 10;
  context.shadowColor = `${color}55`;
  context.stroke();
  context.shadowBlur = 0;
}

export function normalizedToY(value: number, bounds: Pick<ChartBounds, "top" | "bottom">) {
  return bounds.bottom - clamp(value, 0, 1) * (bounds.bottom - bounds.top);
}
