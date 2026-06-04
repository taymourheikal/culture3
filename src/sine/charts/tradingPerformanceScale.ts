export type CumulativePayoffDomain = {
  min: number;
  max: number;
};

export function cumulativePayoffDomain(min: number, max: number): CumulativePayoffDomain {
  const low = finiteOr(Math.min(min, max), 0);
  const high = finiteOr(Math.max(min, max), 0);
  if (low === 0 && high === 0) return { min: -1, max: 1 };
  return {
    min: Math.min(low, 0),
    max: Math.max(high, 0),
  };
}

export function normalizeCumulativePayoff(value: number, domain: CumulativePayoffDomain) {
  return clamp((finiteOr(value, 0) - domain.min) / Math.max(0.000001, domain.max - domain.min), 0, 1);
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
