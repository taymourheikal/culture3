import type { MarketTimeline } from "../marketTimeline";
import { populationStdDev } from "../stats";
import { clamp } from "./math";
import {
  collectSignalHistory,
  createTimelineSampleResolver,
  computeLocalSignalStats,
  normalizeByLocalScale,
  type LocalSignalScaleStats,
} from "./localSignalScale";
import { perceptionCacheKey, rollingLags, sanitizePerception } from "./perception";
import type { SpawnerPerception } from "./types";

export function createMarketInputResolver(timeline: MarketTimeline, tick: number, pendingFoodCount: number) {
  const cache = new Map<string, number[]>();
  let computeCount = 0;
  return {
    resolve(perception: SpawnerPerception) {
      const key = perceptionCacheKey(perception);
      const cached = cache.get(key);
      if (cached) return cached;
      const inputs = buildMarketInputs(timeline, tick, pendingFoodCount, perception);
      cache.set(key, inputs);
      computeCount += 1;
      return inputs;
    },
    getComputeCount: () => computeCount,
    getCacheSize: () => cache.size,
  };
}

export function buildMarketInputs(timeline: MarketTimeline, tick: number, pendingFoodCount: number, perception: SpawnerPerception) {
  const cleanPerception = sanitizePerception(perception);
  const sampleAtTick = createTimelineSampleResolver(timeline);
  const localStats = computeLocalSignalStats(
    timeline,
    tick,
    cleanPerception.localScaleWindowTicks,
    cleanPerception.localScaleSampleStepTicks,
    sampleAtTick,
  );
  const sampleAtLag = (ticksAgo: number) => sampleAtTick(Math.max(0, tick - ticksAgo));
  const current = sampleAtLag(0).signal;
  const deltas = cleanPerception.deltaLagPairs.map((pair) =>
    normalizeByLocalScale(sampleAtLag(pair.fromTicks).signal - sampleAtLag(pair.toTicks).signal, localStats.scale),
  );
  const window = rollingLags(cleanPerception).map((lag) => sampleAtLag(lag).signal);
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const rollingStd = standardDeviation(window, mean);
  const trendHistory = collectSignalHistory(timeline, tick, cleanPerception.trendWindowTicks, cleanPerception.localScaleSampleStepTicks, sampleAtTick);
  const cycleHistory = collectSignalHistory(timeline, tick, cleanPerception.cycleWindowTicks, cleanPerception.localScaleSampleStepTicks, sampleAtTick);
  const trendShape = estimateTrendShape(trendHistory, localStats);
  const cycleShape = estimateCycleShape(cycleHistory, localStats, cleanPerception.roughnessSensitivity);

  return [
    normalizeByLocalScale(current, localStats.scale),
    ...deltas,
    normalizeByLocalScale(mean, localStats.scale),
    clamp(rollingStd / localStats.scale, 0, 2),
    localStats.positionInRange(current),
    trendShape.relativeTrendSlope,
    trendShape.relativeResidualVolatility,
    cycleShape.relativeRoughness,
    cycleShape.relativeCycleRate,
    clamp(pendingFoodCount / cleanPerception.pendingDensityScale, 0, 1),
  ];
}

function estimateTrendShape(history: Array<{ tick: number; value: number }>, localStats: LocalSignalScaleStats) {
  const trend = linearRegression(history);
  const residuals = history.map((sample) => sample.value - (trend.intercept + trend.slope * sample.tick));
  const residualMean = residuals.reduce((sum, value) => sum + value, 0) / Math.max(1, residuals.length);
  const residualStd = standardDeviation(residuals, residualMean);

  return {
    relativeTrendSlope: normalizeByLocalScale(trend.slope * historyDuration(history), localStats.scale),
    relativeResidualVolatility: clamp(residualStd / localStats.scale, 0, 2),
  };
}

function estimateCycleShape(history: Array<{ tick: number; value: number }>, localStats: LocalSignalScaleStats, roughnessSensitivity: number) {
  const values = history.map((sample) => sample.value);
  const normalizedValues = values.map((value) => normalizeByLocalScale(value, localStats.scale));

  return {
    relativeRoughness: estimateRelativeRoughness(normalizedValues, historyDuration(history), roughnessSensitivity),
    relativeCycleRate: clamp(estimateCycleRate(normalizedValues, historyDuration(history), roughnessSensitivity * 2) / 0.22, 0, 1),
  };
}

function standardDeviation(values: number[], mean: number) {
  return populationStdDev(values, mean);
}

function linearRegression(samples: { tick: number; value: number }[]) {
  if (samples.length < 2) return { slope: 0, intercept: samples[0]?.value ?? 0 };
  const meanTick = samples.reduce((sum, sample) => sum + sample.tick, 0) / samples.length;
  const meanValue = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const numerator = samples.reduce((sum, sample) => sum + (sample.tick - meanTick) * (sample.value - meanValue), 0);
  const denominator = samples.reduce((sum, sample) => sum + (sample.tick - meanTick) ** 2, 0);
  const slope = denominator > 0 ? numerator / denominator : 0;
  return {
    slope,
    intercept: meanValue - slope * meanTick,
  };
}

function estimateCycleRate(values: number[], duration: number, threshold: number) {
  if (duration <= 0 || values.length < 3) return 0;
  const smoothed = smoothValues(values);
  const turningPoints = countTurningPoints(smoothed, Math.max(0.0001, threshold));
  return turningPoints >= 2 ? turningPoints / 2 / duration : 0;
}

function estimateRelativeRoughness(values: number[], duration: number, threshold: number) {
  if (duration <= 0 || values.length < 3) return 0;
  const secondDiffs = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    const previous = values[index - 1] ?? 0;
    const current = values[index] ?? previous;
    const next = values[index + 1] ?? current;
    secondDiffs.push(Math.abs(next - 2 * current + previous));
  }
  const averageSecondDiff = secondDiffs.reduce((sum, value) => sum + value, 0) / Math.max(1, secondDiffs.length);
  const turningRate = countTurningPoints(values, Math.max(0.0001, threshold)) / duration;
  return clamp(averageSecondDiff / 2 + turningRate / 6, 0, 1);
}

function smoothValues(values: number[]) {
  return values.map((value, index) => {
    const left = values[Math.max(0, index - 1)] ?? value;
    const right = values[Math.min(values.length - 1, index + 1)] ?? value;
    return (left + value + right) / 3;
  });
}

function countTurningPoints(values: number[], threshold: number) {
  let count = 0;
  for (let index = 1; index < values.length - 1; index += 1) {
    const previous = values[index - 1] ?? 0;
    const current = values[index] ?? previous;
    const next = values[index + 1] ?? current;
    const left = current - previous;
    const right = next - current;
    if (Math.abs(left) < threshold || Math.abs(right) < threshold) continue;
    if ((left > 0 && right < 0) || (left < 0 && right > 0)) count += 1;
  }
  return count;
}

function historyDuration(samples: { tick: number }[]) {
  const first = samples[0]?.tick ?? 0;
  const last = samples.at(-1)?.tick ?? first;
  return Math.max(0, last - first);
}
