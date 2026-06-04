import { strict as assert } from "node:assert";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { getMarketCandles, listMarketSources } from "../../server/marketDataRepository.mjs";
import type { SineTest } from "./helpers";

function testMarketDataSourcesAreIndexed() {
  const sources = listMarketSources();
  const oneMinute = sources.find((source: any) => source.source === "btcusd_1m");
  const fiveMinute = sources.find((source: any) => source.source === "btcusd_5m");

  assert.ok(oneMinute, "BTCUSD 1m source should be imported");
  assert.ok(fiveMinute, "BTCUSD 5m source should be imported");
  assert.equal(oneMinute.minDatetime, "2015-01-01T00:00:00.000Z");
  assert.equal(fiveMinute.maxDatetime, "2026-04-30T23:55:00.000Z");
  assert.ok(oneMinute.rows > fiveMinute.rows);
}

function testMarketDataQuerySnapsAndComputesRoc() {
  const result = getMarketCandles({
    source: "btcusd_5m",
    start: "2021-01-01T00:02:00Z",
    limit: 10,
    rocLength: 50,
  });

  assert.equal(result.ok, true);
  assert.equal(result.snappedStartDatetime, "2021-01-01T00:05:00.000Z");
  assert.equal(result.rocLengthBars, 50);
  assert.ok(result.candles.length >= 60);
  const start = result.candles.find((candle: any) => candle.isStart);
  assert.ok(start);
  assert.equal(typeof start.roc, "number");
  assert.equal(typeof start.volume, "number");
  assert(Number.isFinite(start.volume));
}

function testMarketDataParsesBareDatetimeAsUtc() {
  const bare = getMarketCandles({
    source: "btcusd_5m",
    start: "2021-01-01T00:02",
    limit: 1,
    rocLength: 50,
  });
  const explicit = getMarketCandles({
    source: "btcusd_5m",
    start: "2021-01-01T00:02Z",
    limit: 1,
    rocLength: 50,
  });

  assert.equal(bare.ok, true);
  assert.equal(explicit.ok, true);
  assert.equal(bare.snappedStartDatetime, "2021-01-01T00:05:00.000Z");
  assert.equal(bare.snappedStartTimestamp, explicit.snappedStartTimestamp);
}

export const tests: SineTest[] = [
  { name: "Market Data Sources Are Indexed", run: testMarketDataSourcesAreIndexed },
  { name: "Market Data Query Snaps And Computes ROC", run: testMarketDataQuerySnapsAndComputesRoc },
  { name: "Market Data Parses Bare Datetime As UTC", run: testMarketDataParsesBareDatetimeAsUtc },
];
