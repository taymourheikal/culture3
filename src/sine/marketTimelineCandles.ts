import type { SignalSample } from "./marketSignal";
import type { MarketCandle, MarketTimeline } from "./marketTimeline";

export function advanceCandleTimelineOneTick(timeline: MarketTimeline) {
  const nextTick = timeline.tick + 1;
  const candles = timeline.candles ?? [];
  const startIndex = timeline.candleStartIndex ?? 0;
  if (startIndex + nextTick >= candles.length) {
    timeline.candleEndReached = true;
    return;
  }
  const sample = createCandleSample(timeline, nextTick);
  timeline.tick = nextTick;
  timeline.samples.push(sample);
}

export function createCandleSample(timeline: MarketTimeline, tick: number): SignalSample {
  const candles = timeline.candles ?? [];
  const startIndex = timeline.candleStartIndex ?? 0;
  const index = Math.min(candles.length - 1, Math.max(0, startIndex + tick));
  const candle = candles[index];
  return {
    tick: Math.max(0, tick),
    phase: 0,
    trend: 0,
    parameters: {
      amplitude: 0,
      frequency: 0,
      slope: 0,
      noiseAmplitude: 0,
      noiseFrequency: 0,
    },
    noise: 0,
    settings: { ...timeline.settings },
    signal: candle?.roc ?? 0,
    price: candle?.close,
    volume: candle?.volume,
    sourceTimestamp: candle?.timestamp,
    sourceDatetime: candle?.datetime,
  };
}

export function appendCandlesToTimeline(timeline: MarketTimeline, candles: MarketCandle[]) {
  if (timeline.source === "generated" || !timeline.candles) return;
  const existing = new Set(timeline.candles.map((candle) => candle.timestamp));
  const next = candles.filter((candle) => !existing.has(candle.timestamp));
  timeline.candles.push(...next);
  timeline.candles.sort((left, right) => left.timestamp - right.timestamp);
  timeline.candleEndReached = next.length === 0;
}

export function candleTimelineBufferRemaining(timeline: MarketTimeline) {
  if (timeline.source === "generated" || !timeline.candles) return Number.POSITIVE_INFINITY;
  const startIndex = timeline.candleStartIndex ?? 0;
  return Math.max(0, timeline.candles.length - (startIndex + timeline.tick + 1));
}

export function maximumLoadedCandleTick(timeline: MarketTimeline) {
  const candles = timeline.candles ?? [];
  const startIndex = timeline.candleStartIndex ?? 0;
  return Math.max(0, candles.length - startIndex - 1);
}
