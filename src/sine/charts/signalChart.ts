import { buildTimelineSamples, getTimelineSampleAt, type MarketTimeline } from "../marketTimeline";
import { getVisibleSpawnerFoods, type SpawnerFood, type SpawnerWorld } from "../spawnerSimulation";
import { clamp, drawGrid, prepareCanvas, valueToY, type ChartBounds } from "./canvas";
import { formatPercentAxis, formatSignedPercent } from "./format";

export function drawSignalChart(
  canvas: HTMLCanvasElement,
  timeline: MarketTimeline,
  spawnerWorld: SpawnerWorld,
  selectedSpawnerId: number | null,
) {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;

  const { context, cssWidth, cssHeight } = prepared;
  const bounds = getSignalChartBounds(cssWidth, cssHeight);
  const geometry = getSignalChartGeometry(timeline, bounds);
  const { chartWidth, centerTime, secondsVisible, samples, valueMin, valueMax } = geometry;
  const centerX = bounds.left + chartWidth / 2;

  context.fillStyle = "#0d1216";
  context.fillRect(0, 0, cssWidth, cssHeight);
  drawGrid(context, bounds, valueMin, valueMax, formatPercentAxis);

  const zeroY = valueToY(0, valueMin, valueMax, bounds);
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(bounds.left, zeroY);
  context.lineTo(bounds.right, zeroY);
  context.stroke();

  context.beginPath();
  samples.forEach((sample, index) => {
    const x = bounds.left + (chartWidth * index) / Math.max(1, samples.length - 1);
    const y = valueToY(sample.signal, valueMin, valueMax, bounds);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "#69d7d0";
  context.lineWidth = 3;
  context.shadowBlur = 18;
  context.shadowColor = "rgba(105, 215, 208, 0.38)";
  context.stroke();
  context.shadowBlur = 0;

  drawSpawnerMarkers(context, {
    bounds,
    centerTime,
    secondsVisible,
    valueMin,
    valueMax,
    foods: getVisibleSpawnerFoods(spawnerWorld, centerTime, secondsVisible),
    selectedSpawnerId,
  });

  const currentSample = getTimelineSampleAt(timeline, centerTime);
  const currentY = valueToY(currentSample.signal, valueMin, valueMax, bounds);
  context.strokeStyle = "rgba(255, 214, 128, 0.95)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, bounds.top);
  context.lineTo(centerX, bounds.bottom);
  context.stroke();

  context.fillStyle = "#ffd680";
  context.beginPath();
  context.arc(centerX, currentY, 5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#dce8e5";
  context.font = "700 12px Inter, system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText(formatSignedPercent(currentSample.signal), centerX + 10, currentY - 10);
  context.restore();
}

export function pickSignalChartFood(
  canvas: HTMLCanvasElement,
  timeline: MarketTimeline,
  spawnerWorld: SpawnerWorld,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  const bounds = getSignalChartBounds(rect.width, rect.height);
  const geometry = getSignalChartGeometry(timeline, bounds);
  const point = { x: clientX - rect.left, y: clientY - rect.top };
  const foods = getVisibleSpawnerFoods(spawnerWorld, timeline.time, geometry.secondsVisible);
  for (const food of [...foods].reverse()) {
    const marker = getFoodMarkerGeometry(food, bounds, geometry);
    const spawnHit = distance(point.x, point.y, marker.spawnX, marker.spawnY) <= marker.radius + 5;
    const resolvedHit =
      food.status !== "pending" &&
      food.resolveTime >= geometry.start &&
      food.resolveTime <= geometry.end &&
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

function getSignalChartGeometry(timeline: MarketTimeline, bounds: ChartBounds) {
  const chartWidth = bounds.right - bounds.left;
  const secondsVisible = 16;
  const centerTime = timeline.time;
  const samples = buildTimelineSamples(timeline, centerTime, secondsVisible, Math.max(80, Math.floor(chartWidth / 2)));
  const values = samples.map((sample) => sample.signal);
  const maxAbs = Math.max(2, ...values.map((value) => Math.abs(value)));
  const valueBound = maxAbs * 1.18;
  const valueMin = -valueBound;
  const valueMax = valueBound;
  const start = centerTime - secondsVisible / 2;
  const end = centerTime + secondsVisible / 2;
  return {
    chartWidth,
    centerTime,
    secondsVisible,
    samples,
    valueMin,
    valueMax,
    start,
    end,
    timeToX: (time: number) => bounds.left + ((time - start) / secondsVisible) * chartWidth,
  };
}

function drawSpawnerMarkers(
  context: CanvasRenderingContext2D,
  {
    bounds,
    centerTime,
    secondsVisible,
    valueMin,
    valueMax,
    foods,
    selectedSpawnerId,
  }: {
    bounds: ChartBounds;
    centerTime: number;
    secondsVisible: number;
    valueMin: number;
    valueMax: number;
    foods: SpawnerFood[];
    selectedSpawnerId: number | null;
  },
) {
  const start = centerTime - secondsVisible / 2;
  const end = centerTime + secondsVisible / 2;
  const chartWidth = bounds.right - bounds.left;
  const timeToX = (time: number) => bounds.left + ((time - start) / secondsVisible) * chartWidth;
  const now = centerTime;

  context.save();
  context.font = "800 9px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const food of foods) {
    const selected = selectedSpawnerId === null || selectedSpawnerId === food.creatorSpawnerId;
    const x = timeToX(food.spawnTime);
    const y = valueToY(food.entrySignal, valueMin, valueMax, bounds);
    const exitX = timeToX(food.resolveTime);
    const resolvedY = food.exitSignal === undefined ? y : valueToY(food.exitSignal, valueMin, valueMax, bounds);
    const radius = 6 + food.strength * 5;
    const isLong = food.direction === "long";
    const outcomeColor = food.status === "pending" ? "#ffd680" : food.status === "win" ? "#86d87a" : "#ff8f70";
    const directionFill = isLong ? "rgba(105, 215, 208, 0.92)" : "rgba(255, 143, 112, 0.92)";
    const spawnVisible = food.spawnTime >= start && food.spawnTime <= end;
    const resolvedVisible = food.status !== "pending" && food.resolveTime >= start && food.resolveTime <= end;
    const lineStartTime = clamp(food.spawnTime, start, end);
    const lineEndTime = clamp(food.resolveTime, start, end);
    if (lineEndTime < lineStartTime) continue;
    const lineStartY = food.status === "pending" ? y : valueToY(interpolateFoodSignal(food, lineStartTime), valueMin, valueMax, bounds);
    const lineEndY = food.status === "pending" ? y : valueToY(interpolateFoodSignal(food, lineEndTime), valueMin, valueMax, bounds);
    const spawnY = clamp(y, bounds.top + radius, bounds.bottom - radius);
    const clampedResolvedY = clamp(resolvedY, bounds.top + radius, bounds.bottom - radius);

    context.globalAlpha = selected ? 0.98 : 0.22;
    context.strokeStyle = outcomeColor;
    context.lineWidth = selected ? (food.status === "pending" ? 1.8 : 3) : 1.5;
    context.beginPath();
    context.moveTo(timeToX(lineStartTime), clamp(lineStartY, bounds.top, bounds.bottom));
    context.lineTo(timeToX(lineEndTime), clamp(lineEndY, bounds.top, bounds.bottom));
    context.stroke();

    if (spawnVisible) {
      const spawnPulse = food.status === "pending" ? Math.max(0, 1 - Math.abs(now - food.spawnTime) / 0.9) : 0;
      if (spawnPulse > 0) {
        context.fillStyle = `rgba(255, 214, 128, ${0.16 * spawnPulse})`;
        context.beginPath();
        context.arc(x, spawnY, radius + 8 + spawnPulse * 8, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = food.status === "pending" ? "rgba(13, 18, 22, 0.9)" : directionFill;
      drawDirectionMarker(context, x, spawnY, radius, isLong);
      context.fill();
      context.strokeStyle = outcomeColor;
      context.stroke();

      context.fillStyle = food.status === "pending" ? "#ffd680" : "#071014";
      context.fillText(isLong ? "L" : "S", x, spawnY);
    }

    if (resolvedVisible) {
      const markerSize = radius * 0.78;
      const resolvePulse = Math.max(0, 1 - Math.abs(now - food.resolveTime) / 1.1);
      if (resolvePulse > 0) {
        context.fillStyle =
          food.status === "win" ? `rgba(134, 216, 122, ${0.18 * resolvePulse})` : `rgba(255, 143, 112, ${0.18 * resolvePulse})`;
        context.beginPath();
        context.arc(exitX, clampedResolvedY, radius + 10 + resolvePulse * 10, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = food.status === "win" ? "rgba(134, 216, 122, 0.95)" : "rgba(255, 143, 112, 0.95)";
      context.strokeStyle = "#0d1216";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(exitX, clampedResolvedY - markerSize);
      context.lineTo(exitX + markerSize, clampedResolvedY);
      context.lineTo(exitX, clampedResolvedY + markerSize);
      context.lineTo(exitX - markerSize, clampedResolvedY);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = "#071014";
      context.font = "900 10px Inter, system-ui, sans-serif";
      context.fillText(food.status === "win" ? "+" : "-", exitX, clampedResolvedY + 0.5);
      context.font = "800 9px Inter, system-ui, sans-serif";
    }
  }

  context.restore();
}

function interpolateFoodSignal(food: SpawnerFood, time: number) {
  if (food.exitSignal === undefined || food.resolveTime <= food.spawnTime) return food.entrySignal;
  const amount = (time - food.spawnTime) / Math.max(0.0001, food.resolveTime - food.spawnTime);
  return food.entrySignal + (food.exitSignal - food.entrySignal) * clamp(amount, 0, 1);
}

function getFoodMarkerGeometry(
  food: SpawnerFood,
  bounds: ChartBounds,
  geometry: ReturnType<typeof getSignalChartGeometry>,
) {
  const radius = 6 + food.strength * 5;
  const spawnX = geometry.timeToX(food.spawnTime);
  const spawnY = clamp(valueToY(food.entrySignal, geometry.valueMin, geometry.valueMax, bounds), bounds.top + radius, bounds.bottom - radius);
  const exitX = geometry.timeToX(food.resolveTime);
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
