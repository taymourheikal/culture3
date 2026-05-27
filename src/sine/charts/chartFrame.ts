import { prepareCanvas, type ChartBounds } from "./canvas";

export function prepareChartFrame(canvas: HTMLCanvasElement) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return null;

  const { context, cssWidth, cssHeight } = prepared;
  const bounds = standardChartBounds(cssWidth, cssHeight);
  context.fillStyle = "#0d1216";
  context.fillRect(0, 0, cssWidth, cssHeight);
  return { context, cssWidth, cssHeight, bounds };
}

export function standardChartBounds(cssWidth: number, cssHeight: number): ChartBounds {
  return {
    left: 54,
    right: cssWidth - 54,
    top: 32,
    bottom: cssHeight - 42,
  };
}

export function drawFrameGrid({
  context,
  bounds,
  leftLabel,
  rightLabel,
  rows = 4,
}: {
  context: CanvasRenderingContext2D;
  bounds: ChartBounds;
  leftLabel?: (index: number) => string;
  rightLabel?: (index: number) => string;
  rows?: number;
}) {
  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.fillStyle = "#8ea19e";
  context.font = "600 11px Inter, system-ui, sans-serif";
  context.textBaseline = "middle";

  for (let index = 0; index <= rows; index += 1) {
    const y = bounds.top + ((bounds.bottom - bounds.top) * index) / rows;
    context.beginPath();
    context.moveTo(bounds.left, y);
    context.lineTo(bounds.right, y);
    context.stroke();

    if (leftLabel) {
      context.textAlign = "right";
      context.fillText(leftLabel(index), bounds.left - 10, y);
    }
    if (rightLabel) {
      context.textAlign = "left";
      context.fillText(rightLabel(index), bounds.right + 10, y);
    }
  }
}

export function drawChartEmptyMessage(context: CanvasRenderingContext2D, cssWidth: number, cssHeight: number, message: string) {
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#9eb0ad";
  context.font = "800 13px Inter, system-ui, sans-serif";
  context.fillText(message, cssWidth / 2, cssHeight / 2);
}
