import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { populationStdDev } from "../stats";
import { clamp } from "./math";

export const LOCAL_SCALE_FLOOR = 0.0001;

export type TimelineSignalSampleResolver = (tick: number) => ReturnType<typeof getTimelineSampleByTick>;

export type LocalSignalScaleStats = {
  scale: number;
  positionInRange: (value: number) => number;
};

export function createTimelineSampleResolver(timeline: MarketTimeline): TimelineSignalSampleResolver {
  const cache = new Map<number, ReturnType<typeof getTimelineSampleByTick>>();
  return (sampleTick) => {
    const normalizedTick = Math.max(0, sampleTick);
    const cached = cache.get(normalizedTick);
    if (cached) return cached;
    const sample = getTimelineSampleByTick(timeline, normalizedTick);
    cache.set(normalizedTick, sample);
    return sample;
  };
}

export function computeLocalSignalScale(
  timeline: MarketTimeline,
  tick: number,
  windowTicks: number,
  sampleStepTicks: number,
  sampleAtTick: TimelineSignalSampleResolver = (sampleTick) => getTimelineSampleByTick(timeline, sampleTick),
) {
  return computeLocalSignalStats(timeline, tick, windowTicks, sampleStepTicks, sampleAtTick).scale;
}

export function computeLocalSignalStats(
  timeline: MarketTimeline,
  tick: number,
  windowTicks: number,
  sampleStepTicks: number,
  sampleAtTick: TimelineSignalSampleResolver = (sampleTick) => getTimelineSampleByTick(timeline, sampleTick),
): LocalSignalScaleStats {
  const history = collectSignalHistory(timeline, tick, windowTicks, sampleStepTicks, sampleAtTick);
  return summarizeLocalNumericScale(history.map((sample) => sample.value));
}

export function collectSignalHistory(
  timeline: MarketTimeline,
  tick: number,
  ticks: number,
  stepTicks: number,
  sampleAtTick: TimelineSignalSampleResolver = (sampleTick) => getTimelineSampleByTick(timeline, sampleTick),
) {
  const sampleCount = Math.max(2, Math.round(ticks / Math.max(1, stepTicks)) + 1);
  const history = [];
  for (let index = sampleCount - 1; index >= 0; index -= 1) {
    const sampleTick = Math.max(0, tick - Math.round(index * Math.max(1, stepTicks)));
    const sample = sampleAtTick(sampleTick);
    history.push({
      tick: sample.tick,
      value: sample.signal,
    });
  }
  const startTick = history[0]?.tick ?? 0;
  return history.map((sample) => ({
    tick: sample.tick - startTick,
    value: sample.value,
  }));
}

export function collectNumericHistory(
  tick: number,
  ticks: number,
  stepTicks: number,
  sampleAtTick: TimelineSignalSampleResolver,
  readValue: (sample: ReturnType<TimelineSignalSampleResolver>) => number,
) {
  const sampleCount = Math.max(2, Math.round(ticks / Math.max(1, stepTicks)) + 1);
  const history = [];
  for (let index = sampleCount - 1; index >= 0; index -= 1) {
    const sampleTick = Math.max(0, tick - Math.round(index * Math.max(1, stepTicks)));
    const sample = sampleAtTick(sampleTick);
    history.push({
      tick: sample.tick,
      value: readValue(sample),
    });
  }
  const startTick = history[0]?.tick ?? 0;
  return history.map((sample) => ({
    tick: sample.tick - startTick,
    value: sample.value,
  }));
}

export function normalizeByLocalScale(value: number, localScale: number) {
  return clamp(value / Math.max(LOCAL_SCALE_FLOOR, localScale), -2, 2);
}

export function summarizeLocalNumericScale(values: number[]): LocalSignalScaleStats {
  if (values.length === 0) {
    return {
      scale: LOCAL_SCALE_FLOOR,
      positionInRange: () => 0,
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rollingStd = populationStdDev(values, mean);
  const halfRange = (max - min) / 2;
  const scale = Math.max(LOCAL_SCALE_FLOOR, rollingStd, halfRange);
  const midpoint = (max + min) / 2;

  return {
    scale,
    positionInRange: (value: number) => {
      if (halfRange <= LOCAL_SCALE_FLOOR) return 0;
      return clamp((value - midpoint) / halfRange, -1, 1);
    },
  };
}
