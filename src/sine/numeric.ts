export function finiteOr(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampFinite(value: unknown, fallback: number, min: number, max: number) {
  return clampNumber(finiteOr(value, fallback), min, max);
}

export function probability(value: unknown, fallback: number) {
  return clampFinite(value, fallback, 0, 1);
}

export function nonNegative(value: unknown, fallback: number) {
  return Math.max(0, finiteOr(value, fallback));
}

export function positive(value: unknown, fallback: number, min = Number.EPSILON, max = Number.POSITIVE_INFINITY) {
  return clampFinite(value, fallback, min, max);
}

export function nonNegativeInteger(value: unknown, fallback = 0) {
  return Math.max(0, Math.round(finiteOr(value, fallback)));
}
