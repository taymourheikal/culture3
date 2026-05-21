import type { HistogramBin } from "./charts";
import { finiteBounds, formatValue } from "./batchAnalysisMath";

export function exactCountDistribution(values: number[]): HistogramBin[] {
  if (values.length === 0) return [];
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ label: String(value), title: String(value), count }));
}

export function integerHistogram(values: number[], targetBins: number): HistogramBin[] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [];
  const bounds = finiteBounds(finite);
  const min = Math.floor(bounds.min);
  const max = Math.ceil(bounds.max);
  if (min === max) {
    return [{ label: String(min), title: String(min), count: finite.length }];
  }

  const valueCount = max - min + 1;
  const binWidth = Math.max(1, Math.ceil(valueCount / targetBins));
  const binCount = Math.ceil(valueCount / binWidth);
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * binWidth;
    const end = Math.min(max, start + binWidth - 1);
    const label = start === end ? String(start) : `${start}-${end}`;
    return { label, title: label, count: 0 };
  });

  for (const value of finite) {
    const index = Math.min(binCount - 1, Math.floor((Math.round(value) - min) / binWidth));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }

  return bins;
}

export function histogram(values: number[], targetBins: number, precision: number): HistogramBin[] {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [];
  const { min, max } = finiteBounds(finite);
  if (min === max) {
    const label = formatValue(min, precision);
    return [{ label, title: label, count: finite.length }];
  }

  const binCount = Math.min(targetBins, Math.max(1, finite.length));
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width;
    const end = index === binCount - 1 ? max : start + width;
    const label = `${formatValue(start, precision)}-${formatValue(end, precision)}`;
    return { label, title: label, count: 0 };
  });

  for (const value of finite) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }

  return bins;
}
