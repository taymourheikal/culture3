import { buildTimelineSamples, getTimelineSampleAt, type MarketTimeline } from "../marketTimeline";
import { drawGrid, prepareCanvas, valueToY } from "./canvas";
import { formatSignedPercent } from "./format";

export function drawNoiseChart(canvas: HTMLCanvasElement, timeline: MarketTimeline) {
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
  const secondsVisible = 16;
  const centerTime = timeline.time;
  const samples = buildTimelineSamples(timeline, centerTime, secondsVisible, Math.max(80, Math.floor(chartWidth / 2)));
  const noiseValues = samples.map((sample) => sample.noise);
  const noiseBound = Math.max(2, Math.max(...noiseValues.map(Math.abs)) * 1.22);

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
  samples.forEach((sample, index) => {
    const x = bounds.left + (chartWidth * index) / Math.max(1, samples.length - 1);
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

  const currentNoise = getTimelineSampleAt(timeline, centerTime).noise;
  const currentY = valueToY(currentNoise, -noiseBound, noiseBound, bounds);
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
  context.fillText(formatSignedPercent(currentNoise), centerX + 10, currentY - 10);
  context.restore();
}
