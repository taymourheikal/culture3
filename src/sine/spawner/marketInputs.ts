import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { clamp, normalizePercent } from "./math";

export function buildMarketInputs(timeline: MarketTimeline, tick: number, pendingDensity: number) {
  const ticksForSeconds = (seconds: number) => Math.max(0, tick - Math.round(seconds / timeline.tickSeconds));
  const currentSample = getTimelineSampleByTick(timeline, tick);
  const lag1Sample = getTimelineSampleByTick(timeline, ticksForSeconds(0.6));
  const lag2Sample = getTimelineSampleByTick(timeline, ticksForSeconds(1.2));
  const lag4Sample = getTimelineSampleByTick(timeline, ticksForSeconds(2.4));
  const lag8Sample = getTimelineSampleByTick(timeline, ticksForSeconds(4.8));
  const current = currentSample.signal;
  const lag1 = lag1Sample.signal;
  const lag2 = lag2Sample.signal;
  const lag4 = lag4Sample.signal;
  const lag8 = lag8Sample.signal;
  const window = [
    current,
    lag1,
    lag2,
    lag4,
    lag8,
    getTimelineSampleByTick(timeline, ticksForSeconds(7.2)).signal,
    getTimelineSampleByTick(timeline, ticksForSeconds(9.6)).signal,
  ];
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length;
  const shape = estimateSignalShape(timeline, tick);

  return [
    normalizePercent(current),
    normalizePercent(current - lag1),
    normalizePercent(lag1 - lag2),
    normalizePercent(lag2 - lag4),
    normalizePercent(lag4 - lag8),
    normalizePercent(mean),
    clamp(Math.sqrt(variance) / 3, 0, 2),
    shape.estimatedAmplitude,
    shape.estimatedCycleFrequency,
    shape.estimatedTrendSlope,
    shape.estimatedResidualVolatility,
    shape.estimatedRoughness,
    clamp(pendingDensity, 0, 1),
  ];
}

function estimateSignalShape(timeline: MarketTimeline, tick: number) {
  const history = collectSignalHistory(timeline, tick, 9.6, 0.6);
  const values = history.map((sample) => sample.value);
  const amplitude = estimateAmplitude(values);
  const trend = linearRegression(history);
  const residuals = history.map((sample) => sample.value - (trend.intercept + trend.slope * sample.time));
  const residualMean = residuals.reduce((sum, value) => sum + value, 0) / Math.max(1, residuals.length);
  const residualVariance =
    residuals.reduce((sum, value) => sum + (value - residualMean) ** 2, 0) / Math.max(1, residuals.length);

  return {
    estimatedAmplitude: clamp(amplitude / 8, 0, 1),
    estimatedCycleFrequency: clamp(estimateCycleFrequency(values, historyDuration(history), amplitude) / 1.2, 0, 1),
    estimatedTrendSlope: clamp(trend.slope, -1, 1),
    estimatedResidualVolatility: clamp(Math.sqrt(residualVariance) / 5, 0, 1),
    estimatedRoughness: estimateRoughness(values, historyDuration(history), amplitude),
  };
}

function collectSignalHistory(timeline: MarketTimeline, tick: number, seconds: number, stepSeconds: number) {
  const sampleCount = Math.max(2, Math.round(seconds / stepSeconds) + 1);
  const history = [];
  for (let index = sampleCount - 1; index >= 0; index -= 1) {
    const secondsAgo = index * stepSeconds;
    const sampleTick = Math.max(0, tick - Math.round(secondsAgo / timeline.tickSeconds));
    const sample = getTimelineSampleByTick(timeline, sampleTick);
    history.push({
      time: sample.time,
      value: sample.signal,
    });
  }
  const startTime = history[0]?.time ?? 0;
  return history.map((sample) => ({
    time: sample.time - startTime,
    value: sample.value,
  }));
}

function estimateAmplitude(values: number[]) {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (max - min) / 2;
}

function linearRegression(samples: { time: number; value: number }[]) {
  if (samples.length < 2) return { slope: 0, intercept: samples[0]?.value ?? 0 };
  const meanTime = samples.reduce((sum, sample) => sum + sample.time, 0) / samples.length;
  const meanValue = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const numerator = samples.reduce((sum, sample) => sum + (sample.time - meanTime) * (sample.value - meanValue), 0);
  const denominator = samples.reduce((sum, sample) => sum + (sample.time - meanTime) ** 2, 0);
  const slope = denominator > 0 ? numerator / denominator : 0;
  return {
    slope,
    intercept: meanValue - slope * meanTime,
  };
}

function estimateCycleFrequency(values: number[], duration: number, amplitude: number) {
  if (duration <= 0 || values.length < 3) return 0;
  const smoothed = smoothValues(values);
  const turningPoints = countTurningPoints(smoothed, Math.max(0.02, amplitude * 0.08));
  return turningPoints >= 2 ? turningPoints / 2 / duration : 0;
}

function estimateRoughness(values: number[], duration: number, amplitude: number) {
  if (duration <= 0 || values.length < 3) return 0;
  const secondDiffs = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    const previous = values[index - 1] ?? 0;
    const current = values[index] ?? previous;
    const next = values[index + 1] ?? current;
    secondDiffs.push(Math.abs(next - 2 * current + previous));
  }
  const averageSecondDiff = secondDiffs.reduce((sum, value) => sum + value, 0) / Math.max(1, secondDiffs.length);
  const turningRate = countTurningPoints(values, Math.max(0.01, amplitude * 0.04)) / duration;
  return clamp(averageSecondDiff / Math.max(0.2, amplitude * 2) + turningRate / 6, 0, 1);
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

function historyDuration(samples: { time: number }[]) {
  const first = samples[0]?.time ?? 0;
  const last = samples.at(-1)?.time ?? first;
  return Math.max(0, last - first);
}
