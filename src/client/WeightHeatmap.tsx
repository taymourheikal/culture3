import { useEffect, useRef } from "react";
import type { WeightSample } from "./batchAnalysis";

export function WeightHeatmap({ samples }: { samples: WeightSample[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * pixelRatio));
      const height = Math.max(1, Math.floor(rect.height * pixelRatio));
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#14191b";
      context.fillRect(0, 0, width, height);

      const columnCount = samples[0]?.vector.length ?? 0;
      if (columnCount === 0) return;

      let maxAbs = 0.001;
      for (const sample of samples) {
        for (const weight of sample.vector) {
          const abs = Math.abs(weight);
          if (abs > maxAbs) maxAbs = abs;
        }
      }
      const cellWidth = width / columnCount;
      const cellHeight = height / samples.length;

      samples.forEach((sample, rowIndex) => {
        sample.vector.forEach((weight, columnIndex) => {
          context.fillStyle = heatColor(weight / maxAbs);
          context.fillRect(Math.floor(columnIndex * cellWidth), Math.floor(rowIndex * cellHeight), Math.ceil(cellWidth), Math.ceil(cellHeight));
        });
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [samples]);

  return <canvas ref={canvasRef} className="weight-heatmap-canvas" />;
}

function heatColor(value: number) {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped < 0) {
    const amount = Math.abs(clamped);
    return mixColor([35, 41, 43], [74, 172, 184], amount);
  }
  return mixColor([35, 41, 43], [219, 181, 91], clamped);
}

function mixColor(from: [number, number, number], to: [number, number, number], amount: number) {
  const channels = from.map((channel, index) => Math.round(channel + ((to[index] ?? channel) - channel) * amount));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}
