import { marketDataStatements } from "./marketDataDb.mjs";

const MARKET_SOURCE_LABELS = {
  btcusd_1m: "BTC/USD 1m",
  btcusd_5m: "BTC/USD 5m",
};

export function listMarketSources() {
  return marketDataStatements.listSources.all().map((row) => ({
    source: row.source,
    label: MARKET_SOURCE_LABELS[row.source] ?? row.source,
    rows: row.rows,
    minTimestamp: row.min_timestamp,
    maxTimestamp: row.max_timestamp,
    minDatetime: row.min_timestamp ? new Date(row.min_timestamp * 1000).toISOString() : null,
    maxDatetime: row.max_timestamp ? new Date(row.max_timestamp * 1000).toISOString() : null,
  }));
}

export function getMarketCandles({ source, start, limit, rocLength }) {
  const normalizedSource = normalizeSource(source);
  if (!normalizedSource) return { ok: false, status: 400, error: "Unsupported source" };

  const startTimestamp = parseStartTimestamp(start);
  if (!Number.isFinite(startTimestamp)) return { ok: false, status: 400, error: "Invalid start datetime" };

  const rowLimit = clampInteger(limit, 1, 5000, 1000);
  const lookback = clampInteger(rocLength, 1, 1000, 50);
  const snapped = marketDataStatements.firstCandleAtOrAfter.get(normalizedSource, startTimestamp);
  if (!snapped) return { ok: false, status: 404, error: "No candle at or after start datetime" };

  const rows = marketDataStatements.candlesBefore
    .all(normalizedSource, snapped.timestamp, lookback)
    .reverse()
    .concat(marketDataStatements.candlesWindow.all(normalizedSource, snapped.timestamp, rowLimit));
  const candles = rows.map(normalizeCandle).sort((left, right) => left.timestamp - right.timestamp);
  const snappedIndex = candles.findIndex((candle) => candle.timestamp === snapped.timestamp);
  const samples = candles.map((candle, index) => ({
    ...candle,
    roc:
      index >= lookback
        ? ((candle.close - candles[index - lookback].close) / Math.max(0.000001, candles[index - lookback].close)) * 100
        : null,
    isStart: index === snappedIndex,
  }));

  return {
    ok: true,
    source: normalizedSource,
    requestedStartTimestamp: startTimestamp,
    snappedStartTimestamp: snapped.timestamp,
    snappedStartDatetime: new Date(snapped.timestamp * 1000).toISOString(),
    rocLengthBars: lookback,
    candles: samples,
  };
}

function normalizeSource(source) {
  const value = String(source ?? "");
  return value === "btcusd_1m" || value === "btcusd_5m" ? value : null;
}

export function parseStartTimestamp(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  if (typeof value === "number") return Math.floor(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) return Math.floor(numeric);
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text) ? `${text}Z` : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Number.NaN;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function normalizeCandle(row) {
  return {
    timestamp: row.timestamp,
    datetime: row.datetime,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  };
}
