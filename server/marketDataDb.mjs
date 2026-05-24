import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data", "market");
mkdirSync(dataDir, { recursive: true });

export const marketDataDbPath = join(dataDir, "market-data.sqlite");
export const marketDataDbExists = existsSync(marketDataDbPath);
export const marketDataDb = new DatabaseSync(marketDataDbPath);

marketDataDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS market_candles (
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    datetime TEXT NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (source, timestamp)
  );

  CREATE INDEX IF NOT EXISTS market_candles_source_timestamp_idx
    ON market_candles (source, timestamp);
`);

export const marketDataStatements = {
  listSources: marketDataDb.prepare(`
    SELECT
      source,
      COUNT(*) AS rows,
      MIN(timestamp) AS min_timestamp,
      MAX(timestamp) AS max_timestamp
    FROM market_candles
    GROUP BY source
    ORDER BY source
  `),
  firstCandleAtOrAfter: marketDataDb.prepare(`
    SELECT timestamp
    FROM market_candles
    WHERE source = ? AND timestamp >= ?
    ORDER BY timestamp ASC
    LIMIT 1
  `),
  candlesWindow: marketDataDb.prepare(`
    SELECT timestamp, datetime, open, high, low, close
    FROM market_candles
    WHERE source = ? AND timestamp >= ?
    ORDER BY timestamp ASC
    LIMIT ?
  `),
  candlesBefore: marketDataDb.prepare(`
    SELECT timestamp, datetime, open, high, low, close
    FROM market_candles
    WHERE source = ? AND timestamp < ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),
};
