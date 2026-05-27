import { clampNumber } from "./numeric";

export const PERCENTILE_RANK_EPSILON = 1e-9;

export function finiteZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function mean(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function absMean(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length : 0;
}

export function populationStdDev(values: number[], average = mean(values)) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].map(finiteZero).sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function percentileRank(value: number, values: number[], epsilon = PERCENTILE_RANK_EPSILON) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length <= 1) return 0;
  let less = 0;
  let equal = 0;
  for (const candidate of sorted) {
    if (candidate < value) less += 1;
    else if (Math.abs(candidate - value) <= epsilon) equal += 1;
  }
  const averageRank = less + (equal - 1) / 2;
  return clampNumber(averageRank / (sorted.length - 1), 0, 1);
}
