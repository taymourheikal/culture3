import type { MarketChartPacket } from "../marketWorkerProtocol";
import { centeredTickWindow, clamp, drawHorizontalGrid, prepareCanvas, tickToX } from "./canvas";

export function drawParameterChart(canvas: HTMLCanvasElement, packet: MarketChartPacket) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;

  const { context, cssWidth, cssHeight } = prepared;
  const bounds = {
    left: 54,
    right: cssWidth - 20,
    top: 30,
    bottom: cssHeight - 58,
  };
  const chartWidth = bounds.right - bounds.left;
  const centerX = bounds.left + chartWidth / 2;
  const { start, end } = centeredTickWindow(packet.renderTick, packet.ticksVisible);
  const visibleSamples = packet.signalSamples.filter((sample) => sample.tick >= start && sample.tick <= end);
  const series = [
    { key: "amplitude", color: "#69d7d0", min: 0, max: 8 },
    { key: "frequency", color: "#ffd680", min: 0.01, max: 1.2 },
    { key: "slope", color: "#86d87a", min: -1, max: 1 },
    { key: "noiseAmplitude", color: "#b989ff", min: 0, max: 5 },
    { key: "noiseFrequency", color: "#ff8f70", min: 0.05, max: 6 },
  ] as const;

  context.fillStyle = "#0d1216";
  context.fillRect(0, 0, cssWidth, cssHeight);
  drawHorizontalGrid(context, bounds);

  for (const item of series) {
    context.beginPath();
    visibleSamples.forEach((sample, index) => {
      const value = sample.parameters[item.key];
      const normalized = (value - item.min) / Math.max(0.001, item.max - item.min);
      const x = tickToX(sample.tick, start, end, bounds);
      const y = bounds.bottom - clamp(normalized, 0, 1) * (bounds.bottom - bounds.top);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = item.color;
    context.lineWidth = 2;
    context.stroke();
  }

  context.strokeStyle = "rgba(255, 214, 128, 0.95)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, bounds.top);
  context.lineTo(centerX, bounds.bottom);
  context.stroke();

  context.fillStyle = "#8ea19e";
  context.font = "700 11px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  context.fillText("High", bounds.left - 10, bounds.top);
  context.fillText("Low", bounds.left - 10, bounds.bottom);
  context.restore();
}
