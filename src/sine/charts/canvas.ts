import { chartTheme } from "./chartTheme";
import { dateFromUnixSeconds } from "../sourceTime";

export type ChartBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TimeAxisSample = {
  tick: number;
  sourceTimestamp?: number;
  sourceDatetime?: string;
};

export function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * pixelRatio));
  const height = Math.max(1, Math.floor(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) return null;

  const cssWidth = width / pixelRatio;
  const cssHeight = height / pixelRatio;
  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, cssWidth, cssHeight);
  return { context, cssWidth, cssHeight };
}

export function drawGrid(
  context: CanvasRenderingContext2D,
  bounds: ChartBounds,
  valueMin: number,
  valueMax: number,
  formatLabel: (value: number) => string,
) {
  context.strokeStyle = chartTheme.grid;
  context.lineWidth = 1;
  context.fillStyle = chartTheme.textMuted;
  context.font = "600 11px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let index = 0; index <= 4; index += 1) {
    const y = bounds.top + ((bounds.bottom - bounds.top) * index) / 4;
    drawHorizontalGridRow(context, bounds, y);

    const value = valueMax - ((valueMax - valueMin) * index) / 4;
    context.fillText(formatLabel(value), bounds.left - 10, y);
  }
}

export function drawMarketTimeAxis(
  context: CanvasRenderingContext2D,
  bounds: ChartBounds,
  samples: TimeAxisSample[],
  startTick: number,
  ticksVisible: number,
) {
  const labels = buildMarketTimeLabels(bounds, samples, startTick, ticksVisible);
  if (labels.length === 0) return;

  context.save();
  context.font = "650 11px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";

  for (const label of labels) {
    context.strokeStyle = chartTheme.gridFaint;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(label.x, bounds.top);
    context.lineTo(label.x, bounds.bottom);
    context.stroke();

    context.fillStyle = chartTheme.textMuted;
    context.fillText(label.text, label.x, bounds.bottom + 9);
  }

  context.restore();
}

export function drawHorizontalGrid(context: CanvasRenderingContext2D, bounds: ChartBounds, rows = 4) {
  context.strokeStyle = chartTheme.grid;
  context.lineWidth = 1;
  drawHorizontalGridRows(context, bounds, rows);
}

export function drawHorizontalGridRows(context: CanvasRenderingContext2D, bounds: ChartBounds, rows = 4) {
  for (let index = 0; index <= rows; index += 1) {
    const y = bounds.top + ((bounds.bottom - bounds.top) * index) / rows;
    drawHorizontalGridRow(context, bounds, y);
  }
}

export function drawHorizontalGridRow(context: CanvasRenderingContext2D, bounds: ChartBounds, y: number) {
  context.beginPath();
  context.moveTo(bounds.left, y);
  context.lineTo(bounds.right, y);
  context.stroke();
}

export function valueToY(value: number, valueMin: number, valueMax: number, bounds: Pick<ChartBounds, "top" | "bottom">) {
  return bounds.bottom - ((value - valueMin) / Math.max(0.001, valueMax - valueMin)) * (bounds.bottom - bounds.top);
}

export function tickToX(tick: number, startTick: number, endTick: number, bounds: Pick<ChartBounds, "left" | "right">) {
  return bounds.left + ((tick - startTick) / Math.max(1, endTick - startTick)) * (bounds.right - bounds.left);
}

export function niceTickStep(span: number) {
  if (span <= 20) return 1;
  if (span <= 50) return 5;
  if (span <= 100) return 10;
  if (span <= 250) return 25;
  if (span <= 500) return 50;
  return 100;
}

export function firstTickAtOrAfter(startTick: number, step: number) {
  return Math.ceil(startTick / step) * step;
}

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function centeredTickWindow(tick: number, ticksVisible: number) {
  const start = tick - ticksVisible / 2;
  const end = tick + ticksVisible / 2;
  return { start, end };
}

export function niceSymmetricBound(value: number, minimum = 2) {
  if (!Number.isFinite(value) || value <= minimum) return minimum;
  if (value <= 5) return Math.ceil(value * 2) / 2;
  if (value <= 10) return Math.ceil(value);
  return Math.ceil(value / 2) * 2;
}

function buildMarketTimeLabels(
  bounds: ChartBounds,
  samples: TimeAxisSample[],
  startTick: number,
  ticksVisible: number,
) {
  const endTick = startTick + ticksVisible;
  const uniqueSamples: TimeAxisSample[] = [];
  let lastTimestamp: number | undefined;

  for (const sample of samples) {
    if (sample.tick < startTick || sample.tick > endTick || sample.sourceTimestamp === undefined) continue;
    if (sample.sourceTimestamp === lastTimestamp) continue;
    lastTimestamp = sample.sourceTimestamp;
    uniqueSamples.push(sample);
  }

  if (uniqueSamples.length === 0) return [];

  const chartWidth = bounds.right - bounds.left;
  const maxLabels = Math.max(2, Math.floor(chartWidth / 118));
  const step = Math.max(1, Math.ceil(uniqueSamples.length / maxLabels));
  const selected: TimeAxisSample[] = [];
  for (let index = 0; index < uniqueSamples.length; index += step) {
    const sample = uniqueSamples[index];
    if (sample) selected.push(sample);
  }
  const last = uniqueSamples.at(-1);
  if (last && selected.at(-1)?.sourceTimestamp !== last.sourceTimestamp) selected.push(last);

  const firstSample = uniqueSamples[0] as TimeAxisSample;
  const firstDateKey = marketDateKey(firstSample);
  const crossesDays = uniqueSamples.some((sample) => marketDateKey(sample) !== firstDateKey);

  return selected.map((sample) => ({
    x: tickToX(sample.tick, startTick, endTick, bounds),
    text: formatMarketTimeLabel(sample, crossesDays || sample === firstSample),
  }));
}

function formatMarketTimeLabel(sample: TimeAxisSample, includeDate: boolean) {
  const date = marketDate(sample);
  if (!date) return "";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: includeDate ? "short" : undefined,
    day: includeDate ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace(",", "");
}

function marketDateKey(sample: TimeAxisSample) {
  const date = marketDate(sample);
  if (!date) return "";
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function marketDate(sample: TimeAxisSample) {
  if (sample.sourceDatetime) {
    const date = new Date(sample.sourceDatetime);
    if (Number.isFinite(date.getTime())) return date;
  }
  return dateFromUnixSeconds(sample.sourceTimestamp);
}
