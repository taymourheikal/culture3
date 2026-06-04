import type { ChartFoodMarker, MarketChartPacket } from "../marketWorkerProtocol";
import {
  centeredTickWindow,
  clamp,
  drawGrid,
  drawMarketTimeAxis,
  niceSymmetricBound,
  prepareCanvas,
  tickToX,
  valueToY,
  type ChartBounds,
} from "./canvas";
import { chartTheme } from "./chartTheme";
import { formatPercentAxis, formatSignedPercent } from "./format";

export function drawSignalChart(canvas: HTMLCanvasElement, packet: MarketChartPacket, selectedSpawnerId: number | null) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;

  const { context, cssWidth, cssHeight } = prepared;
  const bounds = getSignalChartBounds(cssWidth, cssHeight);
  const geometry = getSignalChartGeometry(packet, bounds);
  const { chartWidth, valueMin, valueMax } = geometry;
  const centerX = bounds.left + chartWidth / 2;

  context.fillStyle = chartTheme.background;
  context.fillRect(0, 0, cssWidth, cssHeight);
  drawGrid(context, bounds, valueMin, valueMax, formatPercentAxis);
  if (packet.marketSource !== "generated") {
    drawMarketTimeAxis(context, bounds, packet.signalSamples, geometry.start, packet.ticksVisible);
  }

  const zeroY = valueToY(0, valueMin, valueMax, bounds);
  context.strokeStyle = chartTheme.gridStrong;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(bounds.left, zeroY);
  context.lineTo(bounds.right, zeroY);
  context.stroke();

  const visibleSamples = getVisibleSignalSamples(packet, geometry.start, geometry.end);
  context.beginPath();
  visibleSamples.forEach((sample, index) => {
    const x = geometry.tickToX(sample.tick);
    const y = valueToY(sample.signal, valueMin, valueMax, bounds);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = chartTheme.accent;
  context.lineWidth = 3;
  context.shadowBlur = 18;
  context.shadowColor = chartTheme.accentShadow;
  context.stroke();
  context.shadowBlur = 0;

  drawSpawnerMarkers(context, {
    bounds,
    valueMin,
    valueMax,
    foods: packet.visibleFoods,
    selectedSpawnerId,
    geometry,
  });

  const currentY = valueToY(packet.currentSignal, valueMin, valueMax, bounds);
  context.strokeStyle = chartTheme.amberStrong;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, bounds.top);
  context.lineTo(centerX, bounds.bottom);
  context.stroke();

  context.fillStyle = chartTheme.amber;
  context.beginPath();
  context.arc(centerX, currentY, 5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = chartTheme.text;
  context.font = "700 12px Inter, system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(formatSignedPercent(packet.currentSignal), centerX + 10, currentY - 10);
  context.restore();
}

export function pickSignalChartFood(canvas: HTMLCanvasElement, packet: MarketChartPacket, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const bounds = getSignalChartBounds(rect.width, rect.height);
  const geometry = getSignalChartGeometry(packet, bounds);
  const point = { x: clientX - rect.left, y: clientY - rect.top };
  for (const food of [...packet.visibleFoods].reverse()) {
    const marker = getFoodMarkerGeometry(food, bounds, geometry);
    const spawnHit = distance(point.x, point.y, marker.spawnX, marker.spawnY) <= marker.radius + 5;
    const resolvedHit =
      food.status !== "pending" &&
      food.resolveTick >= geometry.start &&
      food.resolveTick <= geometry.end &&
      distance(point.x, point.y, marker.exitX, marker.resolvedY) <= marker.radius + 6;
    if (spawnHit || resolvedHit) return food;
  }
  return null;
}

function getSignalChartBounds(cssWidth: number, cssHeight: number): ChartBounds {
  return {
    left: 54,
    right: cssWidth - 20,
    top: 24,
    bottom: cssHeight - 42,
  };
}

function getSignalChartGeometry(packet: MarketChartPacket, bounds: ChartBounds) {
  const chartWidth = bounds.right - bounds.left;
  const { start, end } = centeredTickWindow(packet.renderTick, packet.ticksVisible);
  const values = getVisibleSignalSamples(packet, start, end).map((sample) => sample.signal);
  const maxAbs = Math.max(2, ...values.map((value) => Math.abs(value)), Math.abs(packet.currentSignal));
  const valueBound = niceSymmetricBound(maxAbs * 1.18);
  const valueMin = -valueBound;
  const valueMax = valueBound;
  return {
    chartWidth,
    valueMin,
    valueMax,
    start,
    end,
    tickToX: (tick: number) => tickToX(tick, start, end, bounds),
  };
}

function getVisibleSignalSamples(packet: MarketChartPacket, start: number, end: number) {
  return packet.signalSamples.filter((sample) => sample.tick >= start && sample.tick <= end);
}

function drawSpawnerMarkers(
  context: CanvasRenderingContext2D,
  {
    bounds,
    valueMin,
    valueMax,
    foods,
    selectedSpawnerId,
    geometry,
  }: {
    bounds: ChartBounds;
    valueMin: number;
    valueMax: number;
    foods: ChartFoodMarker[];
    selectedSpawnerId: number | null;
    geometry: ReturnType<typeof getSignalChartGeometry>;
  },
) {
  context.save();
  context.font = "800 9px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const food of foods) {
    const selected = selectedSpawnerId === null || selectedSpawnerId === food.creatorSpawnerId;
    const x = geometry.tickToX(food.spawnTick);
    const y = valueToY(food.entrySignal, valueMin, valueMax, bounds);
    const exitX = geometry.tickToX(food.resolveTick);
    const resolvedY = food.exitSignal === undefined ? y : valueToY(food.exitSignal, valueMin, valueMax, bounds);
    const radius = 6 + food.strength * 5;
    const isLong = food.direction === "long";
    const outcomeColor = food.status === "pending" ? chartTheme.amber : food.status === "win" ? chartTheme.positive : chartTheme.negative;
    const directionFill = isLong ? chartTheme.accent : chartTheme.negative;
    const spawnVisible = food.spawnTick >= geometry.start && food.spawnTick <= geometry.end;
    const resolvedVisible = food.status !== "pending" && food.resolveTick >= geometry.start && food.resolveTick <= geometry.end;
    const lineStartTick = clamp(food.spawnTick, geometry.start, geometry.end);
    const lineEndTick = clamp(food.resolveTick, geometry.start, geometry.end);
    if (lineEndTick < lineStartTick) continue;
    const lineStartY = food.status === "pending" ? y : valueToY(interpolateFoodSignal(food, lineStartTick), valueMin, valueMax, bounds);
    const lineEndY = food.status === "pending" ? y : valueToY(interpolateFoodSignal(food, lineEndTick), valueMin, valueMax, bounds);
    const spawnY = clamp(y, bounds.top + radius, bounds.bottom - radius);
    const clampedResolvedY = clamp(resolvedY, bounds.top + radius, bounds.bottom - radius);

    context.globalAlpha = selected ? 0.98 : 0.22;
    context.strokeStyle = outcomeColor;
    context.lineWidth = selected ? (food.status === "pending" ? 1.8 : 3) : 1.5;
    context.beginPath();
    context.moveTo(geometry.tickToX(lineStartTick), clamp(lineStartY, bounds.top, bounds.bottom));
    context.lineTo(geometry.tickToX(lineEndTick), clamp(lineEndY, bounds.top, bounds.bottom));
    context.stroke();

    if (spawnVisible) {
      context.fillStyle = food.status === "pending" ? chartTheme.backgroundStrong : directionFill;
      drawDirectionMarker(context, x, spawnY, radius, isLong);
      context.fill();
      context.strokeStyle = outcomeColor;
      context.stroke();

      context.fillStyle = food.status === "pending" ? chartTheme.amber : chartTheme.backgroundStrong;
      context.fillText(isLong ? "L" : "S", x, spawnY);
    }

    if (resolvedVisible) {
      const markerSize = radius * 0.78;
      context.fillStyle = food.status === "win" ? chartTheme.positiveStrong : chartTheme.negativeStrong;
      context.strokeStyle = chartTheme.background;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(exitX, clampedResolvedY - markerSize);
      context.lineTo(exitX + markerSize, clampedResolvedY);
      context.lineTo(exitX, clampedResolvedY + markerSize);
      context.lineTo(exitX - markerSize, clampedResolvedY);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = chartTheme.backgroundStrong;
      context.font = "900 10px Inter, system-ui, sans-serif";
      context.fillText(food.status === "win" ? "+" : "-", exitX, clampedResolvedY + 0.5);
      context.font = "800 9px Inter, system-ui, sans-serif";
    }
  }

  context.restore();
}

function interpolateFoodSignal(food: ChartFoodMarker, tick: number) {
  if (food.exitSignal === undefined || food.resolveTick <= food.spawnTick) return food.entrySignal;
  const amount = (tick - food.spawnTick) / Math.max(0.0001, food.resolveTick - food.spawnTick);
  return food.entrySignal + (food.exitSignal - food.entrySignal) * clamp(amount, 0, 1);
}

function getFoodMarkerGeometry(
  food: ChartFoodMarker,
  bounds: ChartBounds,
  geometry: ReturnType<typeof getSignalChartGeometry>,
) {
  const radius = 6 + food.strength * 5;
  const spawnX = geometry.tickToX(food.spawnTick);
  const spawnY = clamp(valueToY(food.entrySignal, geometry.valueMin, geometry.valueMax, bounds), bounds.top + radius, bounds.bottom - radius);
  const exitX = geometry.tickToX(food.resolveTick);
  const resolvedValue = food.exitSignal ?? food.entrySignal;
  const resolvedY = clamp(valueToY(resolvedValue, geometry.valueMin, geometry.valueMax, bounds), bounds.top + radius, bounds.bottom - radius);
  return { spawnX, spawnY, exitX, resolvedY, radius };
}

function drawDirectionMarker(context: CanvasRenderingContext2D, x: number, y: number, radius: number, isLong: boolean) {
  context.beginPath();
  if (isLong) {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius * 0.95, y + radius * 0.75);
    context.lineTo(x - radius * 0.95, y + radius * 0.75);
  } else {
    context.moveTo(x, y + radius);
    context.lineTo(x + radius * 0.95, y - radius * 0.75);
    context.lineTo(x - radius * 0.95, y - radius * 0.75);
  }
  context.closePath();
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x1 - x2, y1 - y2);
}
