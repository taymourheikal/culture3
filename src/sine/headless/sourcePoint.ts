import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";

export type HeadlessSourcePoint = {
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
};

export function sourcePointForTick(timeline: MarketTimeline, tick: number): HeadlessSourcePoint {
  try {
    const sample = getTimelineSampleByTick(timeline, tick);
    return {
      sourceTimestamp: nullableNumber(sample.sourceTimestamp),
      sourceDatetime: sample.sourceDatetime ?? datetimeFromTimestamp(sample.sourceTimestamp),
    };
  } catch {
    return { sourceTimestamp: null, sourceDatetime: null };
  }
}

export function datetimeFromTimestamp(timestamp: number | undefined) {
  return Number.isFinite(timestamp) ? new Date(Number(timestamp) * 1000).toISOString() : null;
}

export function nullableNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

export function finiteNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
