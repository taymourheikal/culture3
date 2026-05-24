import type { MarketCandle } from "../marketTimeline";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import { fetchSineJson } from "../sineApi";

export async function fetchMarketCandles(config: MarketRuntimeConfig, start: string, limit: number): Promise<{
  snappedStartTimestamp: number;
  snappedStartDatetime: string;
  candles: MarketCandle[];
}> {
  const payload = await fetchSineJson<{
    snappedStartTimestamp: number;
    snappedStartDatetime: string;
    candles: MarketCandle[];
  }>("/api/market/candles", {}, {
    source: config.source,
    start,
    limit,
    rocLength: config.playback.rocLengthBars,
  });
  if (!Array.isArray(payload.candles) || payload.candles.length === 0) throw new Error("BTC data request returned no candles");
  return payload;
}
