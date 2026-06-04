import type { SignalSample } from "../marketSignal";
import type { MarketTimeline } from "../marketTimeline";
import { populationStdDev } from "../stats";
import {
  collectNumericHistory,
  collectSignalHistory,
  createTimelineSampleResolver,
  normalizeByLocalScale,
  summarizeLocalNumericScale,
  type LocalSignalScaleStats,
} from "./localSignalScale";
import { buildVolumeRsiInputsFromSamples, computeRsiSignalFromLag, hasVolume, logVolume } from "./marketFeatureInputs";
import { clamp } from "./math";
import { perceptionCacheKey, rollingLags, sanitizePerception } from "./perception";
import type { SpawnerPerception } from "./types";

export const MARKET_FEATURE_INPUT_COUNT = 18;

export type MarketFeatureContext = ReturnType<typeof createMarketFeatureContext>;
export type MarketFeatureInstrumentation = {
  recordFeaturePhase(phase: string, ms: number): void;
};

export function createMarketFeatureContext(timeline: MarketTimeline, tick: number, instrumentation?: MarketFeatureInstrumentation) {
  const sampleAtTick = createTimelineSampleResolver(timeline);
  const localStatsCache = new Map<string, LocalSignalScaleStats>();
  const signalHistoryCache = new Map<string, Array<{ tick: number; value: number }>>();
  const numericHistoryCache = new Map<string, Array<{ tick: number; value: number }>>();
  const featureCache = new Map<string, number[]>();
  let featureResolveCount = 0;
  let featureCacheHitCount = 0;
  let featureComputeCount = 0;

  const context = {
    resolveMarketFeatures(perception: SpawnerPerception) {
      featureResolveCount += 1;
      const cleanPerception = sanitizePerception(perception);
      const key = perceptionCacheKey(cleanPerception);
      const cached = featureCache.get(key);
      if (cached) {
        featureCacheHitCount += 1;
        return cached;
      }
      const inputs = timeFeature(instrumentation, "marketFeatureBuild", () => buildMarketFeatureInputs(cleanPerception));
      featureCache.set(key, inputs);
      featureComputeCount += 1;
      return inputs;
    },
    resolveInputs(perception: SpawnerPerception, pendingFoodCount: number) {
      const cleanPerception = sanitizePerception(perception);
      return [
        ...context.resolveMarketFeatures(cleanPerception),
        clamp(pendingFoodCount / cleanPerception.pendingDensityScale, 0, 1),
      ];
    },
    sampleAtTick,
    sampleAtLag(ticksAgo: number) {
      return sampleAtTick(Math.max(0, tick - ticksAgo));
    },
    localSignalStats(windowTicks: number, sampleStepTicks: number) {
      const key = sampleWindowKey(windowTicks, sampleStepTicks);
      const cached = localStatsCache.get(key);
      if (cached) return cached;
      const history = context.signalHistory(windowTicks, sampleStepTicks);
      const stats = timeFeature(instrumentation, "localSignalStats", () =>
        summarizeLocalNumericScale(history.map((sample) => sample.value)),
      );
      localStatsCache.set(key, stats);
      return stats;
    },
    signalHistory(windowTicks: number, sampleStepTicks: number) {
      const key = sampleWindowKey(windowTicks, sampleStepTicks);
      const cached = signalHistoryCache.get(key);
      if (cached) return cached;
      const history = timeFeature(instrumentation, "signalHistory", () =>
        collectSignalHistory(timeline, tick, windowTicks, sampleStepTicks, sampleAtTick),
      );
      signalHistoryCache.set(key, history);
      return history;
    },
    numericHistory(windowTicks: number, sampleStepTicks: number, valueKey: string, readValue: (sample: SignalSample) => number) {
      const key = `${valueKey}:${sampleWindowKey(windowTicks, sampleStepTicks)}`;
      const cached = numericHistoryCache.get(key);
      if (cached) return cached;
      const history = timeFeature(instrumentation, "numericHistory", () =>
        collectNumericHistory(tick, windowTicks, sampleStepTicks, sampleAtTick, readValue),
      );
      numericHistoryCache.set(key, history);
      return history;
    },
    getFeatureResolveCount: () => featureResolveCount,
    getFeatureCacheHitCount: () => featureCacheHitCount,
    getFeatureComputeCount: () => featureComputeCount,
    getFeatureCacheSize: () => featureCache.size,
    getSampleCacheSize: () => localStatsCache.size + signalHistoryCache.size + numericHistoryCache.size,
  };

  return context;

  function buildMarketFeatureInputs(cleanPerception: SpawnerPerception) {
    const localStats = context.localSignalStats(cleanPerception.localScaleWindowTicks, cleanPerception.localScaleSampleStepTicks);
    const current = context.sampleAtLag(0).signal;
    const deltas = timeFeature(instrumentation, "rollingDeltas", () =>
      cleanPerception.deltaLagPairs.map((pair) =>
        normalizeByLocalScale(context.sampleAtLag(pair.fromTicks).signal - context.sampleAtLag(pair.toTicks).signal, localStats.scale),
      ),
    );
    const window = rollingLags(cleanPerception).map((lag) => context.sampleAtLag(lag).signal);
    const { mean, rollingStd } = timeFeature(instrumentation, "rollingWindowStats", () => {
      const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
      return { mean, rollingStd: populationStdDev(window, mean) };
    });
    const trendHistory = context.signalHistory(cleanPerception.trendWindowTicks, cleanPerception.localScaleSampleStepTicks);
    const cycleHistory = context.signalHistory(cleanPerception.cycleWindowTicks, cleanPerception.localScaleSampleStepTicks);
    const trendShape = timeFeature(instrumentation, "trendShape", () => estimateTrendShape(trendHistory, localStats));
    const cycleShape = timeFeature(instrumentation, "cycleShape", () =>
      estimateCycleShape(cycleHistory, localStats, cleanPerception.roughnessSensitivity),
    );
    const volumeRsiInputs = timeFeature(instrumentation, "volumeRsiInputs", () =>
      buildVolumeRsiInputsFromContext(context, cleanPerception, localStats, instrumentation),
    );

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
      volumeRsiInputs.relativeVolume,
      volumeRsiInputs.volumeDelta,
      volumeRsiInputs.volumeAcceleration,
      volumeRsiInputs.rsiSignal,
      volumeRsiInputs.volumePriceAgreement,
    ];
  }
}

function timeFeature<T>(instrumentation: MarketFeatureInstrumentation | undefined, phase: string, read: () => T): T {
  if (!instrumentation) return read();
  const started = performance.now();
  try {
    return read();
  } finally {
    instrumentation.recordFeaturePhase(phase, performance.now() - started);
  }
}

function buildVolumeRsiInputsFromContext(
  context: MarketFeatureContext,
  perception: SpawnerPerception,
  signalStats: LocalSignalScaleStats,
  instrumentation?: MarketFeatureInstrumentation,
) {
  const current = context.sampleAtLag(0);
  if (!hasVolume(current)) {
    return {
      relativeVolume: 0,
      volumeDelta: 0,
      volumeAcceleration: 0,
      rsiSignal: timeFeature(instrumentation, "rsiSignal", () => computeRsiSignalFromLag(perception.rsiWindowTicks, context.sampleAtLag)),
      volumePriceAgreement: 0,
    };
  }

  const volumeHistory = context.numericHistory(
    perception.volumeScaleWindowTicks,
    perception.volumeScaleSampleStepTicks,
    "logVolume",
    (sample) => logVolume(sample.volume),
  );
  const logVolumes = volumeHistory.map((sample) => sample.value);
  const volumeStats = summarizeLocalNumericScale(logVolumes);
  return buildVolumeRsiInputsFromSamples({
    perception,
    signalStats,
    volumeStats,
    logVolumes,
    current,
    sampleAtLag: context.sampleAtLag,
    instrumentation,
  });
}

function estimateTrendShape(history: Array<{ tick: number; value: number }>, localStats: LocalSignalScaleStats) {
  const trend = linearRegression(history);
  const residuals = history.map((sample) => sample.value - (trend.intercept + trend.slope * sample.tick));
  const residualMean = residuals.reduce((sum, value) => sum + value, 0) / Math.max(1, residuals.length);
  const residualStd = populationStdDev(residuals, residualMean);

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

function sampleWindowKey(windowTicks: number, sampleStepTicks: number) {
  return `${Math.max(0, Math.round(windowTicks))}:${Math.max(1, Math.round(sampleStepTicks))}`;
}
