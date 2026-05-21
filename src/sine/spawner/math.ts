export function dot(weights: number[], values: number[]) {
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) {
    total += (weights[index] ?? 0) * (values[index] ?? 0);
  }
  return total;
}

export function normalizePercent(value: number) {
  return clamp(value / 4, -2, 2);
}

export function interpolate(min: number, max: number, amount: number) {
  return min + (max - min) * amount;
}

export function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-clamp(value, -40, 40)));
}

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
