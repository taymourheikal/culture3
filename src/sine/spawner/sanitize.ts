import { clampFinite, finiteOr as sharedFiniteOr, nonNegative, probability } from "../numeric";

export function finiteOr(value: number | undefined, fallback: number) {
  return sharedFiniteOr(value, fallback);
}

export function sanitizeProbability(value: number | undefined, fallback: number) {
  return probability(value, fallback);
}

export function sanitizeStdDev(value: number | undefined, fallback: number, max: number) {
  return clampFinite(value, fallback, 0, max);
}

export function sanitizeNonNegative(value: number | undefined, fallback: number) {
  return nonNegative(value, fallback);
}

export function sanitizeIntegerTick(value: number | undefined, fallback: number, max: number) {
  return Math.round(clampFinite(value, fallback, 0, max));
}
