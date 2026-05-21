export type ChartBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
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
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.fillStyle = "#8ea19e";
  context.font = "600 11px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let index = 0; index <= 4; index += 1) {
    const y = bounds.top + ((bounds.bottom - bounds.top) * index) / 4;
    context.beginPath();
    context.moveTo(bounds.left, y);
    context.lineTo(bounds.right, y);
    context.stroke();

    const value = valueMax - ((valueMax - valueMin) * index) / 4;
    context.fillText(formatLabel(value), bounds.left - 10, y);
  }
}

export function drawHorizontalGrid(context: CanvasRenderingContext2D, bounds: ChartBounds, rows = 4) {
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  for (let index = 0; index <= rows; index += 1) {
    const y = bounds.top + ((bounds.bottom - bounds.top) * index) / rows;
    context.beginPath();
    context.moveTo(bounds.left, y);
    context.lineTo(bounds.right, y);
    context.stroke();
  }
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
