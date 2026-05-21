import { useEffect, useRef } from "react";
import type { Lineage } from "../sim/types";

export type PopulationHistoryPoint = {
  tick: number;
  food: number;
  lineages: Record<number, number>;
};

type Props = {
  history: PopulationHistoryPoint[];
  lineages: Lineage[];
};

export function PopulationGraph({ history, lineages }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphLineages = resolveGraphLineages(history, lineages);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawGraph(canvas, history, graphLineages);
  }, [history, graphLineages]);

  const latest = history[history.length - 1];

  return (
    <section className="panel population-graph-panel">
      <div className="panel-title">Population Graph</div>
      <canvas ref={canvasRef} className="population-graph" />
      <div className="graph-legend">
        <span className="graph-key food-key" />
        <span>Food {latest?.food ?? 0}</span>
        {graphLineages.map((lineage) => (
          <span className="graph-legend-item" key={lineage.id}>
            <span className="graph-key" style={{ background: lineage.color }} />
            L{lineage.id} {lineage.currentPopulation}
          </span>
        ))}
      </div>
    </section>
  );
}

type GraphLineage = Pick<Lineage, "id" | "color" | "currentPopulation">;

function resolveGraphLineages(history: PopulationHistoryPoint[], lineages: Lineage[]): GraphLineage[] {
  const lineageById = new Map(lineages.map((lineage) => [lineage.id, lineage]));
  const ids = new Set<number>();
  for (const point of history) {
    for (const lineageId of Object.keys(point.lineages)) {
      if ((point.lineages[Number(lineageId)] ?? 0) > 0) ids.add(Number(lineageId));
    }
  }
  for (const lineage of lineages) {
    if (lineage.currentPopulation > 0) ids.add(lineage.id);
  }

  return [...ids]
    .sort((left, right) => left - right)
    .map((id) => {
      const lineage = lineageById.get(id);
      return {
        id,
        color: lineage?.color ?? lineageColor(id),
        currentPopulation: lineage?.currentPopulation ?? 0,
      };
    });
}

function lineageColor(id: number) {
  return `hsl(${(id * 47) % 360} 74% 62%)`;
}

function drawGraph(canvas: HTMLCanvasElement, history: PopulationHistoryPoint[], lineages: GraphLineage[]) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  const padding = { top: 12, right: 12, bottom: 22, left: 30 };
  const chartWidth = rect.width - padding.left - padding.right;
  const chartHeight = rect.height - padding.top - padding.bottom;
  const startTick = 1;
  const endTick = Math.max(20, history[history.length - 1]?.tick ?? 20);
  const maxValue = Math.max(
    10,
    ...history.map((point) => point.food),
    ...history.flatMap((point) => Object.values(point.lineages)),
  );

  context.fillStyle = "rgba(255,255,255,0.035)";
  context.fillRect(padding.left, padding.top, chartWidth, chartHeight);
  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.lineWidth = 1;
  context.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

  drawGrid(context, padding, chartWidth, chartHeight, rect.width, rect.height, endTick, maxValue);
  drawSeries(context, history, "food", "#86d87a", startTick, endTick, maxValue, padding, chartWidth, chartHeight);

  for (const lineage of lineages) {
    drawSeries(context, history, lineage.id, lineage.color, startTick, endTick, maxValue, padding, chartWidth, chartHeight);
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  chartHeight: number,
  width: number,
  height: number,
  endTick: number,
  maxValue: number,
) {
  context.fillStyle = "rgba(222,231,221,0.68)";
  context.font = "10px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText("1", padding.left, height - 6);
  context.textAlign = "right";
  context.fillText(String(endTick), width - padding.right, height - 6);
  context.textAlign = "left";
  context.fillText(String(Math.ceil(maxValue)), 4, padding.top + 8);

  context.strokeStyle = "rgba(255,255,255,0.07)";
  context.beginPath();
  for (let i = 1; i < 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    context.moveTo(padding.left, y);
    context.lineTo(padding.left + chartWidth, y);
  }
  context.stroke();
}

function drawSeries(
  context: CanvasRenderingContext2D,
  history: PopulationHistoryPoint[],
  key: "food" | number,
  color: string,
  startTick: number,
  endTick: number,
  maxValue: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartWidth: number,
  chartHeight: number,
) {
  if (history.length === 0) return;
  context.beginPath();
  history.forEach((point, index) => {
    const value = key === "food" ? point.food : point.lineages[key] ?? 0;
    const x = padding.left + ((point.tick - startTick) / Math.max(1, endTick - startTick)) * chartWidth;
    const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = key === "food" ? 2 : 1.5;
  context.stroke();
}
