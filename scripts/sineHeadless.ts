import { randomUUID } from "node:crypto";
import { runHeadlessSineExperiment, type HeadlessCandleLoader } from "../src/sine/headless/runner";
import { INITIAL_MARKET_RUNTIME_CONFIG, type MarketDataSource, type MarketRuntimeConfig } from "../src/sine/marketRuntimeConfig";
import type { SpawnerConfig } from "../src/sine/spawnerSimulation";

type CliOptions = {
  runId: string;
  ticks: number;
  seed: number;
  marketSource: MarketDataSource;
  start: string;
  initialSpawners?: number;
  maxSpawners?: number;
  minimumResolvedTrades: number;
  chunkTicks: number;
  checkpointIntervalTicks: number;
  db?: string;
};

const options = parseArgs(process.argv.slice(2));
const repositoryModule = await import(new URL("../server/sineHeadlessRepository.mjs", import.meta.url).href);
const repository = repositoryModule.createSineHeadlessRepository(options.db);

try {
  const marketConfig: Partial<MarketRuntimeConfig> = {
    source: options.marketSource,
    playback: {
      ...INITIAL_MARKET_RUNTIME_CONFIG.playback,
      startDateTime: options.start,
    },
  };
  const spawnerConfig: Partial<SpawnerConfig> = {
    ...(options.initialSpawners !== undefined ? { initialSpawners: options.initialSpawners } : {}),
    ...(options.maxSpawners !== undefined ? { maxSpawners: options.maxSpawners } : {}),
  };
  const result = await runHeadlessSineExperiment({
    runId: options.runId,
    ticks: options.ticks,
    seed: options.seed,
    marketConfig,
    spawnerConfig,
    minimumResolvedTrades: options.minimumResolvedTrades,
    chunkTicks: options.chunkTicks,
    checkpointIntervalTicks: options.checkpointIntervalTicks,
    sink: repository.sink,
    candleLoader: options.marketSource === "generated" ? undefined : createRepositoryCandleLoader(),
  });
  console.log(JSON.stringify({
    ok: true,
    runId: result.runId,
    tick: result.tick,
    eligibleAgents: result.eligibleAgentIds.length,
    dbPath: repository.dbPath,
    settings: {
      seed: options.seed,
      marketSource: options.marketSource,
      targetTicks: options.ticks,
      initialSpawners: options.initialSpawners ?? null,
      maxSpawners: options.maxSpawners ?? null,
      chunkTicks: options.chunkTicks,
      checkpointIntervalTicks: options.checkpointIntervalTicks,
      minimumResolvedTrades: options.minimumResolvedTrades,
    },
    timing: result.timing,
    counts: repository.counts(result.runId),
  }, null, 2));
} finally {
  repository.close();
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values.set(key, next);
    index += 1;
  }
  const marketSource = readMarketSource(values.get("market-source") ?? "generated");
  return {
    runId: values.get("run-id") ?? `headless-${randomUUID()}`,
    ticks: readInteger(values.get("ticks") ?? "1000", "--ticks", 0),
    seed: readInteger(values.get("seed") ?? "101", "--seed", 0),
    marketSource,
    start: values.get("start") ?? INITIAL_MARKET_RUNTIME_CONFIG.playback.startDateTime,
    initialSpawners: optionalInteger(values.get("initial-spawners"), "--initial-spawners", 1),
    maxSpawners: optionalInteger(values.get("max-spawners"), "--max-spawners", 1),
    minimumResolvedTrades: readInteger(values.get("minimum-resolved-trades") ?? "10", "--minimum-resolved-trades", 0),
    chunkTicks: readInteger(values.get("chunk-ticks") ?? "1000", "--chunk-ticks", 1),
    checkpointIntervalTicks: readInteger(values.get("checkpoint-interval-ticks") ?? "0", "--checkpoint-interval-ticks", 0),
    db: values.get("db"),
  };
}

function createRepositoryCandleLoader(): HeadlessCandleLoader {
  return async (config, start, limit) => {
    const marketDataModule = await import(new URL("../server/marketDataRepository.mjs", import.meta.url).href);
    const result = marketDataModule.getMarketCandles({
      source: config.source,
      start,
      limit,
      rocLength: config.playback.rocLengthBars,
    });
    if (!result.ok) throw new Error(result.error ?? `Could not load candles for ${config.source}`);
    return {
      candles: result.candles,
      snappedStartTimestamp: result.snappedStartTimestamp,
      snappedStartDatetime: result.snappedStartDatetime,
    };
  };
}

function readMarketSource(value: string): MarketDataSource {
  if (value === "generated" || value === "btcusd_1m" || value === "btcusd_5m") return value;
  throw new Error(`Unsupported --market-source ${value}`);
}

function optionalInteger(value: string | undefined, label: string, min: number) {
  return value === undefined ? undefined : readInteger(value, label, min);
}

function readInteger(value: string, label: string, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}
