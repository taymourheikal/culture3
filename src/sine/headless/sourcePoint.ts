import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { datetimeFromUnixSeconds, nullableUnixSeconds } from "../sourceTime";

export type HeadlessSourcePoint = {
  sourceTimestamp: number | null;
  sourceDatetime: string | null;
};

export function sourcePointForTick(timeline: MarketTimeline, tick: number): HeadlessSourcePoint {
  try {
    const sample = getTimelineSampleByTick(timeline, tick);
    return {
      sourceTimestamp: nullableUnixSeconds(sample.sourceTimestamp),
      sourceDatetime: sample.sourceDatetime ?? datetimeFromUnixSeconds(sample.sourceTimestamp),
    };
  } catch {
    return { sourceTimestamp: null, sourceDatetime: null };
  }
}

export function nullableNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

export function finiteNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
