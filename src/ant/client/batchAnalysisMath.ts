export function finiteBounds(values: number[]) {
  let min = values[0] as number;
  let max = values[0] as number;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

export function formatValue(value: number, precision: number) {
  return value.toFixed(precision);
}

export function euclideanDistance(left: number[], right: number[]) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += ((left[index] ?? 0) - (right[index] ?? 0)) ** 2;
  }
  return round(Math.sqrt(sum));
}

export function quantile(values: number[], percentile: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const lowValue = sorted[low] ?? 0;
  const highValue = sorted[high] ?? lowValue;
  return lowValue + (highValue - lowValue) * (position - low);
}

export function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function deviation(values: number[], meanValue: number) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length);
}

export function sampleVariance(values: number[], meanValue: number) {
  if (values.length < 2) return 0;
  return values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / (values.length - 1);
}

export function sampleDeviation(values: number[], meanValue: number) {
  return Math.sqrt(sampleVariance(values, meanValue));
}

export function round(value: number) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(6));
}
