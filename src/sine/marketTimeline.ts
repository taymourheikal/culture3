import {
  INITIAL_SETTINGS,
  type SignalSample,
  type WaveSettings,
} from "./marketSignal";
import { advanceCandleTimelineOneTick, appendCandlesToTimeline, candleTimelineBufferRemaining, createCandleSample, maximumLoadedCandleTick } from "./marketTimelineCandles";
import {
  advanceGeneratedTimelineOneTick,
  createGeneratedSample,
  getGeneratedFutureSampleAt,
  interpolateGeneratedSample,
} from "./marketTimelineGenerated";
import type { MarketDataSource } from "./marketRuntimeConfig";

export type MarketCandle = {
  timestamp: number;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  roc: number | null;
  isStart?: boolean;
};

export type MarketTimeline = {
  source: MarketDataSource;
  tick: number;
  phase: number;
  trend: number;
  settings: WaveSettings;
  samples: SignalSample[];
  sampleLimit: number;
  candles?: MarketCandle[];
  candleStartIndex?: number;
  candleSource?: Exclude<MarketDataSource, "generated">;
  candleEndReached?: boolean;
  snappedStartTimestamp?: number;
  snappedStartDatetime?: string;
};

export type MarketAdvanceResult = {
  processedTicks: number;
  remainingTicks: number;
  ended?: boolean;
};

export function createMarketTimeline(
  settings: WaveSettings = INITIAL_SETTINGS,
  sampleLimit = 12000,
): MarketTimeline {
  const timeline: MarketTimeline = {
    source: "generated",
    tick: 0,
    phase: settings.phase,
    trend: 0,
    settings,
    samples: [],
    sampleLimit,
  };
  timeline.samples.push(createGeneratedSample(timeline.tick, timeline.phase, timeline.trend, timeline.settings));
  return timeline;
}

export function createCandleMarketTimeline({
  candles,
  source,
  sampleLimit = 12000,
  settings = INITIAL_SETTINGS,
  snappedStartTimestamp,
  snappedStartDatetime,
}: {
  candles: MarketCandle[];
  source: Exclude<MarketDataSource, "generated">;
  sampleLimit?: number;
  settings?: WaveSettings;
  snappedStartTimestamp?: number;
  snappedStartDatetime?: string;
}): MarketTimeline {
  const startIndex = Math.max(0, candles.findIndex((candle) => candle.isStart));
  const timeline: MarketTimeline = {
    source,
    tick: 0,
    phase: 0,
    trend: 0,
    settings,
    samples: [],
    sampleLimit,
    candles,
    candleStartIndex: startIndex,
    candleSource: source,
    candleEndReached: candles.length <= startIndex + 1,
    snappedStartTimestamp,
    snappedStartDatetime,
  };
  timeline.samples.push(createCandleSample(timeline, 0));
  return timeline;
}

export function applyTimelineSettings(timeline: MarketTimeline, settings: WaveSettings) {
  if (timeline.source !== "generated") {
    timeline.settings = settings;
    return;
  }
  timeline.phase += settings.phase - timeline.settings.phase;
  timeline.settings = settings;
}

export function advanceMarketTimeline(timeline: MarketTimeline, targetTick: number, maxTicks: number): MarketAdvanceResult {
  const owedTicks = Math.max(0, Math.floor(targetTick - timeline.tick));
  let processedTicks = 0;

  for (let index = 0; index < Math.min(maxTicks, owedTicks); index += 1) {
    const previousTick = timeline.tick;
    advanceOneTick(timeline);
    if (timeline.tick === previousTick) break;
    processedTicks += 1;
  }

  return {
    processedTicks,
    remainingTicks: timeline.candleEndReached ? 0 : owedTicks - processedTicks,
    ended: timeline.candleEndReached,
  };
}

export function getTimelineSampleAtRenderTick(timeline: MarketTimeline, renderTick: number): SignalSample {
  if (timeline.source !== "generated") return getCandleSampleAtRenderTick(timeline, renderTick);
  if (timeline.samples.length === 0) return createGeneratedSample(0, 0, 0, timeline.settings);
  const firstSample = timeline.samples[0] as SignalSample;
  if (renderTick <= firstSample.tick) return firstSample;
  if (renderTick > timeline.tick) {
    return getFutureSampleAt(timeline, renderTick);
  }

  const lowerTick = Math.floor(renderTick);
  const upperTick = Math.ceil(renderTick);
  const lower = sampleByTick(timeline, lowerTick) ?? firstSample;
  const upper = sampleByTick(timeline, upperTick) ?? lower;
  if (lower === upper) return lower;

  const amount = (renderTick - lower.tick) / Math.max(0.0001, upper.tick - lower.tick);
  return interpolateGeneratedSample(lower, upper, amount);
}

export const getTimelineSampleAt = getTimelineSampleAtRenderTick;

export function getTimelineSampleByTick(timeline: MarketTimeline, tick: number): SignalSample {
  const existing = sampleByTick(timeline, tick);
  if (existing) return existing;
  if (tick <= timeline.tick) {
    const firstTick = firstRetainedTick(timeline);
    throw new Error(`Timeline sample for tick ${tick} has expired; first retained tick is ${firstTick}.`);
  }
  return getFutureSampleAt(timeline, tick);
}

export function buildTimelineSamples(
  timeline: MarketTimeline,
  centerTick: number,
  ticksVisible: number,
  count: number,
): SignalSample[] {
  const start = centerTick - ticksVisible / 2;
  const end = centerTick + ticksVisible / 2;
  const samples: SignalSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const renderTick = start + ((end - start) * index) / Math.max(1, count - 1);
    samples.push(getTimelineSampleAtRenderTick(timeline, renderTick));
  }
  return samples;
}

function advanceOneTick(timeline: MarketTimeline) {
  if (timeline.source !== "generated") {
    advanceCandleTick(timeline);
    return;
  }
  advanceGeneratedTimelineOneTick(timeline);

  if (timeline.samples.length > timeline.sampleLimit) {
    timeline.samples.splice(0, timeline.samples.length - timeline.sampleLimit);
  }
}

function getFutureSampleAt(timeline: MarketTimeline, renderTick: number): SignalSample {
  if (timeline.source !== "generated") {
    const tick = Math.max(0, Math.round(renderTick));
    return createCandleSample(timeline, tick);
  }
  return getGeneratedFutureSampleAt(timeline, renderTick);
}

function getCandleSampleAtRenderTick(timeline: MarketTimeline, renderTick: number): SignalSample {
  if (timeline.samples.length === 0) return createCandleSample(timeline, 0);
  const tick = Math.max(0, Math.min(Math.round(renderTick), maximumLoadedCandleTick(timeline)));
  return sampleByTick(timeline, tick) ?? createCandleSample(timeline, tick);
}

export function appendMarketCandles(timeline: MarketTimeline, candles: MarketCandle[]) {
  appendCandlesToTimeline(timeline, candles);
}

export function candleBufferRemaining(timeline: MarketTimeline) {
  return candleTimelineBufferRemaining(timeline);
}

export function latestLoadedCandle(timeline: MarketTimeline) {
  return timeline.candles?.at(-1) ?? null;
}

function advanceCandleTick(timeline: MarketTimeline) {
  advanceCandleTimelineOneTick(timeline);

  if (timeline.samples.length > timeline.sampleLimit) {
    timeline.samples.splice(0, timeline.samples.length - timeline.sampleLimit);
  }
}

function sampleByTick(timeline: MarketTimeline, tick: number) {
  const first = timeline.samples[0];
  if (!first) return undefined;
  const index = Math.round(tick - first.tick);
  return timeline.samples[index];
}

function firstRetainedTick(timeline: MarketTimeline) {
  const first = timeline.samples[0];
  return first ? Math.round(first.tick) : 0;
}
