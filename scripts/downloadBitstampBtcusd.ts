import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import https from "node:https";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const HISTORICAL_URL =
  "https://raw.githubusercontent.com/ff137/bitstamp-btcusd-minute-data/main/data/historical/btcusd_bitstamp_1min_2012-2025.csv.gz";
const UPDATES_URL =
  "https://raw.githubusercontent.com/ff137/bitstamp-btcusd-minute-data/main/data/updates/btcusd_bitstamp_1min_latest.csv";

const rootDir = process.cwd();
const rawDir = join(rootDir, "data", "market", "raw");
const outputDir = join(rootDir, "data", "market");
const historicalPath = join(rawDir, "btcusd_bitstamp_1min_2012-2025.csv.gz");
const updatesPath = join(rawDir, "btcusd_bitstamp_1min_latest.csv");
const output1mPath = join(outputDir, "btcusd_bitstamp_1m_2015-01-01_2026-04-30.csv");
const output5mPath = join(outputDir, "btcusd_bitstamp_5m_2015-01-01_2026-04-30.csv");
const sqlitePath = join(outputDir, "market-data.sqlite");

const startTs = Date.UTC(2015, 0, 1) / 1000;
const endExclusiveTs = Date.UTC(2026, 4, 1) / 1000;
const fiveMinutes = 300;

type MinuteRow = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Bucket = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function main() {
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  await downloadIfNeeded(HISTORICAL_URL, historicalPath, false);
  await downloadIfNeeded(UPDATES_URL, updatesPath, true);

  const summary = await exportAndImport();
  console.log(JSON.stringify(summary, null, 2));
}

async function downloadIfNeeded(url: string, filePath: string, refresh: boolean) {
  if (!refresh && existsSync(filePath) && statSync(filePath).size > 0) {
    console.log(`Using existing ${filePath}`);
    return;
  }

  const tempPath = `${filePath}.tmp`;
  console.log(`Downloading ${url}`);
  await pipeline(await request(url), createWriteStream(tempPath));
  renameSync(tempPath, filePath);
  console.log(`Saved ${filePath}`);
}

async function exportAndImport() {
  const temp1mPath = `${output1mPath}.tmp`;
  const temp5mPath = `${output5mPath}.tmp`;
  const output1m = createWriteStream(temp1mPath);
  const output5m = createWriteStream(temp5mPath);
  output1m.write("timestamp,datetime,open,high,low,close,volume\n");
  output5m.write("timestamp,datetime,open,high,low,close,volume\n");

  const db = new DatabaseSync(sqlitePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
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
    DELETE FROM market_candles WHERE source IN ('btcusd_1m', 'btcusd_5m');
    BEGIN;
  `);
  const insertCandle = db.prepare(`
    INSERT OR REPLACE INTO market_candles
      (source, timestamp, datetime, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let currentBucket: Bucket | null = null;
  let lastMinuteTs = Number.NEGATIVE_INFINITY;
  let duplicateOrOutOfOrderRows = 0;
  let oneMinuteRowsInRange = 0;
  let fiveMinuteRows = 0;
  let firstBucketTs: number | null = null;
  let lastBucketTs: number | null = null;

  const consume = (row: MinuteRow) => {
    if (row.timestamp < startTs || row.timestamp >= endExclusiveTs) return;
    if (row.timestamp <= lastMinuteTs) {
      duplicateOrOutOfOrderRows += 1;
      return;
    }
    lastMinuteTs = row.timestamp;
    oneMinuteRowsInRange += 1;
    writeCandle(output1m, "btcusd_1m", row, insertCandle);

    const bucketTs = Math.floor(row.timestamp / fiveMinutes) * fiveMinutes;
    if (!currentBucket || currentBucket.timestamp !== bucketTs) {
      flush();
      currentBucket = {
        timestamp: bucketTs,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      };
      return;
    }

    currentBucket.high = Math.max(currentBucket.high, row.high);
    currentBucket.low = Math.min(currentBucket.low, row.low);
    currentBucket.close = row.close;
    currentBucket.volume += row.volume;
  };

  const flush = () => {
    if (!currentBucket) return;
    if (firstBucketTs === null) firstBucketTs = currentBucket.timestamp;
    lastBucketTs = currentBucket.timestamp;
    fiveMinuteRows += 1;
    writeCandle(output5m, "btcusd_5m", currentBucket, insertCandle);
  };

  try {
    await streamCsvRows(historicalPath, true, consume);
    await streamCsvRows(updatesPath, false, consume);
    flush();
    await Promise.all([finishStream(output1m), finishStream(output5m)]);
    db.exec("COMMIT;");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.close();
  }
  renameSync(temp1mPath, output1mPath);
  renameSync(temp5mPath, output5mPath);

  const expectedRows =
    firstBucketTs !== null && lastBucketTs !== null ? Math.floor((lastBucketTs - firstBucketTs) / fiveMinutes) + 1 : 0;

  return {
    output1mPath,
    output5mPath,
    sqlitePath,
    start: new Date(startTs * 1000).toISOString(),
    endExclusive: new Date(endExclusiveTs * 1000).toISOString(),
    firstBucket: firstBucketTs === null ? null : new Date(firstBucketTs * 1000).toISOString(),
    lastBucket: lastBucketTs === null ? null : new Date(lastBucketTs * 1000).toISOString(),
    oneMinuteRowsInRange,
    fiveMinuteRows,
    expectedFiveMinuteRows: expectedRows,
    missingFiveMinuteRows: Math.max(0, expectedRows - fiveMinuteRows),
    duplicateOrOutOfOrderRows,
    sqliteCounts: readSqliteCounts(),
  };
}

function writeCandle(output: ReturnType<typeof createWriteStream>, source: "btcusd_1m" | "btcusd_5m", row: MinuteRow | Bucket, insertCandle: ReturnType<DatabaseSync["prepare"]>) {
  const datetime = new Date(row.timestamp * 1000).toISOString();
  output.write(
    [
      row.timestamp,
      datetime,
      formatNumber(row.open),
      formatNumber(row.high),
      formatNumber(row.low),
      formatNumber(row.close),
      formatNumber(row.volume),
    ].join(",") + "\n",
  );
  insertCandle.run(source, row.timestamp, datetime, row.open, row.high, row.low, row.close, row.volume);
}

function finishStream(output: ReturnType<typeof createWriteStream>) {
  return new Promise<void>((resolve, reject) => {
    output.end(() => resolve());
    output.on("error", reject);
  });
}

function readSqliteCounts() {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT source, COUNT(*) AS rows, MIN(datetime) AS firstDatetime, MAX(datetime) AS lastDatetime FROM market_candles GROUP BY source ORDER BY source",
      )
      .all();
  } finally {
    db.close();
  }
}

async function streamCsvRows(filePath: string, gzipped: boolean, consume: (row: MinuteRow) => void) {
  const input = gzipped ? createReadStream(filePath).pipe(createGunzip()) : createReadStream(filePath);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let isHeader = true;
  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    const row = parseRow(line);
    if (row) consume(row);
  }
}

function parseRow(line: string): MinuteRow | null {
  const [timestamp, open, high, low, close, volume] = line.split(",");
  const row = {
    timestamp: Number(timestamp),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
  };
  return Object.values(row).every(Number.isFinite) ? row : null;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

function request(url: string, redirects = 0): Promise<NodeJS.ReadableStream> {
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, (response) => {
      const location = response.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.resume();
        if (redirects > 5) reject(new Error(`Too many redirects for ${url}`));
        else resolve(request(new URL(location, url).toString(), redirects + 1));
        return;
      }
      if ((response.statusCode ?? 500) >= 400) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      resolve(response);
    });
    req.on("error", reject);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
