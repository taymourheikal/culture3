import { clamp, valueToY, type ChartBounds } from "./canvas";
import { chartTheme } from "./chartTheme";

export function metricPanelBounds(bounds: ChartBounds, minHeight: number, bottomOffset: number): ChartBounds {
  return {
    left: bounds.left,
    right: bounds.right,
    top: bounds.top,
    bottom: Math.max(bounds.top + minHeight, bounds.bottom - bottomOffset),
  };
}

export function stripPanelBounds(bounds: ChartBounds, minTopOffset: number, heightFromBottom: number, bottomInset: number): ChartBounds {
  return {
    left: bounds.left,
    right: bounds.right,
    top: Math.max(bounds.top + minTopOffset, bounds.bottom - heightFromBottom),
    bottom: bounds.bottom - bottomInset,
  };
}

export function drawZeroLine(context: CanvasRenderingContext2D, bounds: ChartBounds, min = -1, max = 1) {
  const zeroY = valueToY(0, min, max, bounds);
  context.strokeStyle = chartTheme.gridStrong;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(bounds.left, zeroY);
  context.lineTo(bounds.right, zeroY);
  context.stroke();
}

export function drawStripFrame(context: CanvasRenderingContext2D, bounds: ChartBounds) {
  context.strokeStyle = chartTheme.gridFaint;
  context.lineWidth = 1;
  context.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
}

export function drawZeroStripFrame(context: CanvasRenderingContext2D, bounds: ChartBounds, min: number, max: number) {
  drawStripFrame(context, bounds);
  drawZeroLine(context, bounds, min, max);
}

export function zeroCenteredNormalize(value: number, maxAbs: number) {
  return clamp((value + maxAbs) / Math.max(0.000001, maxAbs * 2), 0, 1);
}
