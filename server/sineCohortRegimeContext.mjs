import { isBtcSource } from "../src/sine/marketRuntimeConfig.ts";
import { marketDataStatements } from "./marketDataDb.mjs";
import { parseStartTimestamp } from "./marketDataRepository.mjs";
import { createFixedCountBuckets } from "./sineDiagnosticsBuckets.mjs";
import { finiteSortedValues, quantile } from "./sineDiagnosticsMath.mjs";

export function buildCohortRegimeContext(marketConfig, range, bucketCount) {
  if (!isBtcSource(marketConfig.source)) {
    return unknownCohortRegimeContext(bucketCount, "unknown");
  }
  const startTimestamp = parseStartTimestamp(marketConfig.playback?.startDateTime);
  if (!Number.isFinite(startTimestamp)) return unknownCohortRegimeContext(bucketCount, "missing");
  const snapped = marketDataStatements.firstCandleAtOrAfter.get(marketConfig.source, startTimestamp);
  if (!snapped) return unknownCohortRegimeContext(bucketCount, "missing");

  const limit = Math.min(200_000, Math.max(1, range.toTick + 2));
  const candles = marketDataStatements.candlesWindow.all(marketConfig.source, snapped.timestamp, limit);
  if (!Array.isArray(candles) || candles.length === 0) {
    return unknownCohortRegimeContext(bucketCount, "missing", snapped.timestamp);
  }

  const bucketStats = createFixedCountBuckets(range, bucketCount).map((bucket) => candleRegimeStatsForBucket(candles, bucket));
  const moves = finiteSortedValues(bucketStats.map((row) => Math.abs(row.movePct)));
  const volatilities = finiteSortedValues(bucketStats.map((row) => row.volatilityPct));
  const flatThreshold = Math.max(1e-9, quantile(moves, 0.25) ?? 0);
  const lowVolThreshold = quantile(volatilities, 0.33) ?? 0;
  const highVolThreshold = quantile(volatilities, 0.66) ?? lowVolThreshold;
  const bucketRegimes = bucketStats.map((row) => classifyCohortRegime(row, { flatThreshold, lowVolThreshold, highVolThreshold }));
  return {
    status: cohortRegimeStatus(bucketRegimes),
    snappedStartTimestamp: snapped.timestamp,
    bucketRegimes,
  };
}

function unknownCohortRegimeContext(bucketCount, status, snappedStartTimestamp = null) {
  return {
    status,
    snappedStartTimestamp,
    bucketRegimes: Array.from({ length: bucketCount }, () => ({ trend: "unknown", volatility: "unknown" })),
  };
}

function candleRegimeStatsForBucket(candles, bucket) {
  const startIndex = Math.max(0, bucket.bucketStartTick);
  const endIndex = Math.min(candles.length - 1, Math.max(startIndex, bucket.bucketEndTick));
  const first = candles[startIndex];
  const last = candles[endIndex];
  if (!first || !last || startIndex === endIndex) return { movePct: Number.NaN, volatilityPct: Number.NaN };
  const movePct = ((last.close - first.close) / Math.max(0.000001, first.close)) * 100;
  const returns = [];
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current) continue;
    returns.push(((current.close - previous.close) / Math.max(0.000001, previous.close)) * 100);
  }
  return { movePct, volatilityPct: standardDeviation(returns) };
}

function classifyCohortRegime(row, thresholds) {
  if (!Number.isFinite(row.movePct) || !Number.isFinite(row.volatilityPct)) {
    return { trend: "unknown", volatility: "unknown" };
  }
  const trend = Math.abs(row.movePct) <= thresholds.flatThreshold ? "flat" : row.movePct > 0 ? "up" : "down";
  const volatility =
    row.volatilityPct <= thresholds.lowVolThreshold
      ? "low"
      : row.volatilityPct <= thresholds.highVolThreshold
        ? "medium"
        : "high";
  return { trend, volatility };
}

function cohortRegimeStatus(bucketRegimes) {
  const classified = bucketRegimes.filter((regime) => regime.trend !== "unknown" && regime.volatility !== "unknown").length;
  if (classified === 0) return "missing";
  return classified === bucketRegimes.length ? "available" : "partial";
}

function standardDeviation(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return Number.NaN;
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  const variance = finiteValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finiteValues.length;
  return Math.sqrt(Math.max(0, variance));
}
