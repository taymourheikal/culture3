import type { MarketChartPacket } from "../marketWorkerProtocol";
import { centeredTickWindow, drawGrid, drawMarketTimeAxis, prepareCanvas, tickToX, valueToY } from "./canvas";
import { chartTheme } from "./chartTheme";

export function drawBtcPriceChart(canvas: HTMLCanvasElement, packet: MarketChartPacket) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { context, cssWidth, cssHeight } = prepared;
  const bounds = {
    left: 70,
    right: cssWidth - 20,
    top: 26,
    bottom: cssHeight - 42,
  };
  const samples = packet.priceSamples ?? [];
  const { start, end } = centeredTickWindow(packet.renderTick, packet.ticksVisible);
  const visible = samples.filter((sample) => sample.tick >= start && sample.tick <= end);
  const prices = visible.map((sample) => sample.price);
  const min = Math.min(...prices, packet.currentPrice ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...prices, packet.currentPrice ?? Number.NEGATIVE_INFINITY);
  const pad = Math.max(20, (max - min) * 0.12);
  const valueMin = Number.isFinite(min) ? min - pad : 0;
  const valueMax = Number.isFinite(max) ? max + pad : 1;
  const centerX = bounds.left + (bounds.right - bounds.left) / 2;

  context.fillStyle = chartTheme.background;
  context.fillRect(0, 0, cssWidth, cssHeight);
  drawGrid(context, bounds, valueMin, valueMax, formatPriceAxis);
  drawMarketTimeAxis(context, bounds, samples, start, packet.ticksVisible);

  context.beginPath();
  visible.forEach((sample, index) => {
    const x = tickToX(sample.tick, start, end, bounds);
    const y = valueToY(sample.price, valueMin, valueMax, bounds);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = chartTheme.amber;
  context.lineWidth = 2.5;
  context.shadowBlur = 12;
  context.shadowColor = chartTheme.amberShadow;
  context.stroke();
  context.shadowBlur = 0;

  const currentY = valueToY(packet.currentPrice ?? 0, valueMin, valueMax, bounds);
  context.strokeStyle = chartTheme.amberStrong;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, bounds.top);
  context.lineTo(centerX, bounds.bottom);
  context.stroke();

  if (packet.currentPrice !== undefined) {
    context.fillStyle = chartTheme.amber;
    context.beginPath();
    context.arc(centerX, currentY, 4.5, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = chartTheme.text;
    context.font = "700 12px Inter, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(formatPrice(packet.currentPrice), centerX + 10, currentY - 10);
  }
  context.restore();
}

function formatPriceAxis(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatPrice(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
