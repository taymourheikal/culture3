import type { StrategyMapPointPacket, StrategyMapWindow } from "../marketWorkerProtocol";
import { clamp, type ChartBounds } from "./canvas";
import { chartTheme } from "./chartTheme";
import { drawChartEmptyMessage, drawFrameGrid, prepareChartFrame } from "./chartFrame";
import { visibleClusterOverlays } from "./strategyMapOverlay";

export type StrategyMapColorMode = "cluster" | "payoff" | "lineage" | "generation";
export type StrategyMapSizeMode = "energy" | "resolved" | "fixed";

export type StrategyMapViewOptions = {
  colorMode: StrategyMapColorMode;
  sizeMode: StrategyMapSizeMode;
  showCenters: boolean;
  minResolvedTrades: number;
};

const CLUSTER_COLORS = ["#9be7c1", "#f0b35b", "#c1a4ff", "#e97864", "#b7dc74", "#6fc7ef", "#f28db2", "#d9cf90"];

export const DEFAULT_STRATEGY_MAP_VIEW: StrategyMapViewOptions = {
  colorMode: "cluster",
  sizeMode: "energy",
  showCenters: true,
  minResolvedTrades: 0,
};

export function drawStrategyMapChart(
  canvas: HTMLCanvasElement,
  strategyMap: StrategyMapWindow | null | undefined,
  selectedSpawnerId: number | null,
  options: StrategyMapViewOptions = DEFAULT_STRATEGY_MAP_VIEW,
) {
  const prepared = prepareChartFrame(canvas);
  if (!prepared) return;

  const { context, cssWidth, cssHeight, bounds } = prepared;
  drawFrameGrid({
    context,
    bounds,
    leftLabel: (index) => (1 - index / 2).toFixed(1),
    rows: 4,
  });
  drawMapAxes(context, bounds);

  if (!strategyMap || strategyMap.status !== "ready") {
    drawChartEmptyMessage(context, cssWidth, cssHeight, emptyMessage(strategyMap));
    context.restore();
    return;
  }

  const points = filteredPoints(strategyMap.points, options);
  if (points.length === 0) {
    drawChartEmptyMessage(context, cssWidth, cssHeight, "No agents match the strategy map filter");
    context.restore();
    return;
  }

  if (options.showCenters) drawClusterOverlays(context, bounds, strategyMap, points);
  for (const point of points) {
    drawStrategyPoint(context, bounds, point, strategyMap, options, point.spawnerId === selectedSpawnerId);
  }
  drawMapStatus(context, bounds, strategyMap, points.length);
  context.restore();
}

export function findStrategyMapPointAt(
  canvas: HTMLCanvasElement,
  strategyMap: StrategyMapWindow | null | undefined,
  options: StrategyMapViewOptions,
  clientX: number,
  clientY: number,
) {
  if (!strategyMap || strategyMap.status !== "ready") return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const bounds = {
    left: 54,
    right: rect.width - 54,
    top: 32,
    bottom: rect.height - 42,
  };
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;
  let best: { point: StrategyMapPointPacket; distance: number } | null = null;
  for (const point of filteredPoints(strategyMap.points, options)) {
    const screen = pointToScreen(point, bounds);
    const radius = Math.max(18, pointRadius(point, strategyMap, options) + 8);
    const distance = Math.hypot(screen.x - cssX, screen.y - cssY);
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { point, distance };
    }
  }
  return best?.point ?? null;
}

function emptyMessage(strategyMap: StrategyMapWindow | null | undefined) {
  if (strategyMap?.status === "skipped") return "Strategy map paused above population limit";
  return "Waiting for strategy map sample";
}

function filteredPoints(points: StrategyMapPointPacket[], options: StrategyMapViewOptions) {
  return points.filter((point) => point.resolvedCount >= options.minResolvedTrades);
}

function drawMapAxes(context: CanvasRenderingContext2D, bounds: ChartBounds) {
  const midX = (bounds.left + bounds.right) / 2;
  const midY = (bounds.top + bounds.bottom) / 2;
  context.strokeStyle = chartTheme.gridStrong;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(bounds.left, midY);
  context.lineTo(bounds.right, midY);
  context.moveTo(midX, bounds.top);
  context.lineTo(midX, bounds.bottom);
  context.stroke();

  context.fillStyle = chartTheme.textMuted;
  context.font = "700 10px Inter, system-ui, sans-serif";
  context.textBaseline = "top";
  context.textAlign = "left";
  context.fillText("PCA 1", bounds.right - 42, midY + 6);
  context.save();
  context.translate(midX + 7, bounds.top + 6);
  context.rotate(Math.PI / 2);
  context.fillText("PCA 2", 0, 0);
  context.restore();
}

function drawClusterOverlays(
  context: CanvasRenderingContext2D,
  bounds: ChartBounds,
  strategyMap: StrategyMapWindow,
  visiblePoints: StrategyMapPointPacket[],
) {
  for (const cluster of visibleClusterOverlays(visiblePoints, strategyMap.clusters)) {
    const color = clusterColor(cluster.clusterId);
    const center = xyToScreen(cluster.centroidX, cluster.centroidY, bounds);
    const radius = clamp(cluster.radius, 0.02, 1) * Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top) * 0.42;
    context.strokeStyle = withAlpha(color, 0.25);
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = withAlpha(color, 0.9);
    context.beginPath();
    context.arc(center.x, center.y, 3.5, 0, Math.PI * 2);
    context.fill();
  }
}

function drawStrategyPoint(
  context: CanvasRenderingContext2D,
  bounds: ChartBounds,
  point: StrategyMapPointPacket,
  strategyMap: StrategyMapWindow,
  options: StrategyMapViewOptions,
  selected: boolean,
) {
  const screen = pointToScreen(point, bounds);
  const radius = pointRadius(point, strategyMap, options);
  const opacity = clamp(0.34 + Math.log1p(point.resolvedCount) / 8, 0.34, 0.95);
  const color = pointColor(point, options);
  context.fillStyle = withAlpha(color, selected ? 1 : opacity);
  context.strokeStyle = selected ? chartTheme.text : withAlpha("#101417", 0.72);
  context.lineWidth = selected ? 2.8 : 1;
  context.beginPath();
  context.arc(screen.x, screen.y, selected ? radius + 2 : radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawMapStatus(context: CanvasRenderingContext2D, bounds: ChartBounds, strategyMap: StrategyMapWindow, visibleCount: number) {
  context.textAlign = "right";
  context.textBaseline = "top";
  context.fillStyle = chartTheme.textMuted;
  context.font = "750 10px Inter, system-ui, sans-serif";
  context.fillText(`${visibleCount}/${strategyMap.populationSize} agents | tick ${strategyMap.tick.toLocaleString()}`, bounds.right, bounds.top + 4);
}

function pointToScreen(point: StrategyMapPointPacket, bounds: ChartBounds) {
  return xyToScreen(point.x, point.y, bounds);
}

function xyToScreen(x: number, y: number, bounds: ChartBounds) {
  return {
    x: bounds.left + ((clamp(x, -1, 1) + 1) / 2) * (bounds.right - bounds.left),
    y: bounds.bottom - ((clamp(y, -1, 1) + 1) / 2) * (bounds.bottom - bounds.top),
  };
}

function pointRadius(point: StrategyMapPointPacket, strategyMap: StrategyMapWindow, options: StrategyMapViewOptions) {
  if (options.sizeMode === "fixed") return 4.8;
  if (options.sizeMode === "resolved") return 3.5 + clamp(Math.log1p(point.resolvedCount) / 4, 0, 1) * 5.5;
  const maxEnergy = Math.max(1, ...strategyMap.points.map((entry) => entry.energy));
  return 3.5 + clamp(point.energy / maxEnergy, 0, 1) * 6;
}

function pointColor(point: StrategyMapPointPacket, options: StrategyMapViewOptions) {
  if (options.colorMode === "payoff") {
    if (point.averagePayoff > 0) return chartTheme.positive;
    if (point.averagePayoff < 0) return chartTheme.negative;
    return chartTheme.textMuted;
  }
  if (options.colorMode === "lineage") return clusterColor(point.lineageId);
  if (options.colorMode === "generation") return generationColor(point.generation);
  return clusterColor(point.clusterId);
}

function clusterColor(id: number) {
  return CLUSTER_COLORS[Math.abs(Math.trunc(id)) % CLUSTER_COLORS.length] ?? chartTheme.accent;
}

function generationColor(generation: number) {
  const normalized = clamp(generation / 12, 0, 1);
  const low = hexToRgb(chartTheme.accent);
  const high = hexToRgb(chartTheme.purple);
  const r = Math.round(low.r + (high.r - low.r) * normalized);
  const g = Math.round(low.g + (high.g - low.g) * normalized);
  const b = Math.round(low.b + (high.b - low.b) * normalized);
  return `rgb(${r}, ${g}, ${b})`;
}

function withAlpha(color: string, alpha: number) {
  if (color.startsWith("#")) {
    const { r, g, b } = hexToRgb(color);
    return `rgb(${r} ${g} ${b} / ${clamp(alpha, 0, 1)})`;
  }
  if (color.startsWith("rgb(")) {
    const channels = color.replace("rgb(", "").replace(")", "").split(",").map((part) => Number.parseFloat(part.trim()));
    return `rgb(${channels[0] ?? 0} ${channels[1] ?? 0} ${channels[2] ?? 0} / ${clamp(alpha, 0, 1)})`;
  }
  return color;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((part) => part + part).join("") : normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}
