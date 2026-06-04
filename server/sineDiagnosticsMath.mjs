export function finiteSortedValues(values) {
  return values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
}

export function histogram(values, bins) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return bins.map(([label, min, max]) => ({
    label,
    min,
    max,
    count: finiteValues.filter((value) => (min === null || value >= min) && (max === null || value < max)).length,
  }));
}

export function summaryStats(values) {
  const sorted = finiteSortedValues(values);
  if (sorted.length === 0) {
    return { count: 0, mean: null, min: null, p25: null, median: null, p75: null, p90: null, p95: null, max: null };
  }
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    min: sorted[0],
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1),
  };
}

export function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return null;
  const clampedQ = Math.min(1, Math.max(0, Number.isFinite(q) ? q : 0));
  const position = (sortedValues.length - 1) * clampedQ;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sortedValues[base + 1];
  return next === undefined ? sortedValues[base] : sortedValues[base] + rest * (next - sortedValues[base]);
}

export function downsideDeviation(values, target = 0) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return 0;
  const targetValue = Number.isFinite(target) ? target : 0;
  const downsideSquareSum = finiteValues.reduce((sum, value) => {
    const downside = Math.max(0, targetValue - value);
    return sum + downside * downside;
  }, 0);
  return Math.sqrt(downsideSquareSum / finiteValues.length);
}

export function sortinoRatio(values, target = 0) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return null;
  const downside = downsideDeviation(finiteValues, target);
  if (downside <= 1e-12) return null;
  const average = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  return average / downside;
}

export function tailRiskStats(values, quantiles = [0.01, 0.05]) {
  const sorted = finiteSortedValues(values);
  const stats = {};
  for (const q of quantiles) {
    const valueAtRisk = quantile(sorted, q);
    const tail = valueAtRisk === null ? [] : sorted.filter((value) => value <= valueAtRisk);
    stats[q] = {
      valueAtRisk,
      conditionalValueAtRisk: tail.length > 0 ? tail.reduce((sum, value) => sum + value, 0) / tail.length : null,
    };
  }
  return stats;
}
