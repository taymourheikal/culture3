import type { MarketChartPacket } from "../marketWorkerProtocol";
import { centeredTickWindow, drawGrid, niceSymmetricBound, prepareCanvas, tickToX, valueToY } from "./canvas";
import { formatSignedPercent } from "./format";

export function drawNoiseChart(canvas: HTMLCanvasElement, packet: MarketChartPacket) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;

  const { context, cssWidth, cssHeight } = prepared;
  const bounds = {
    left: 54,
    right: cssWidth - 20,
    top: 26,
    bottom: cssHeight - 30,
  };
  const chartWidth = bounds.right - bounds.left;
  const centerX = bounds.left + chartWidth / 2;
  const { start, end } = centeredTickWindow(packet.renderTick, packet.ticksVisible);
  const visibleSamples = packet.signalSamples.filter((sample) => sample.tick >= start && sample.tick <= end);
  const noiseValues = visibleSamples.map((sample) => sample.noise);
  const noiseBound = niceSymmetricBound(Math.max(2, Math.max(...noiseValues.map(Math.abs), Math.abs(packet.currentNoise)) * 1.22));

  context.fillStyle = "#0d1216";
  context.fillRect(0, 0, cssWidth, cssHeight);
  drawGrid(context, bounds, -noiseBound, noiseBound, formatSignedPercent);

  const zeroY = valueToY(0, -noiseBound, noiseBound, bounds);
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(bounds.left, zeroY);
  context.lineTo(bounds.right, zeroY);
  context.stroke();

  context.beginPath();
  visibleSamples.forEach((sample, index) => {
    const x = tickToX(sample.tick, start, end, bounds);
    const y = valueToY(sample.noise, -noiseBound, noiseBound, bounds);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "#b989ff";
  context.lineWidth = 2.5;
  context.shadowBlur = 14;
  context.shadowColor = "rgba(185, 137, 255, 0.38)";
  context.stroke();
  context.shadowBlur = 0;

  const currentY = valueToY(packet.currentNoise, -noiseBound, noiseBound, bounds);
  context.strokeStyle = "rgba(255, 214, 128, 0.95)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, bounds.top);
  context.lineTo(centerX, bounds.bottom);
  context.stroke();

  context.fillStyle = "#ffd680";
  context.beginPath();
  context.arc(centerX, currentY, 4.5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#dce8e5";
  context.font = "700 12px Inter, system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(formatSignedPercent(packet.currentNoise), centerX + 10, currentY - 10);
  context.restore();
}
