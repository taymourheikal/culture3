import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { advanceSimulationToTargetAsync, createSimulationState } from "../src/sine/simulationRuntime";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig, type SpawnerPhaseInstrumentation } from "../src/sine/spawnerSimulation";
import type { MarketFeatureInstrumentation } from "../src/sine/spawner/marketFeatureContext";

type CliOptions = {
  ticks: number;
  seed: number;
  initialSpawners: number;
  maxSpawners: number;
};

type TimingBucket = {
  calls: number;
  totalMs: number;
  maxMs: number;
  count: number;
};

const options = parseArgs(process.argv.slice(2));
const phaseBuckets = new Map<string, TimingBucket>();
const featureBuckets = new Map<string, TimingBucket>();
const phaseInstrumentation: SpawnerPhaseInstrumentation = {
  recordPhase(phase, ms, count = 1) {
    recordBucket(phaseBuckets, phase, ms, count);
  },
};
const marketFeatureInstrumentation: MarketFeatureInstrumentation = {
  recordFeaturePhase(phase, ms) {
    recordBucket(featureBuckets, phase, ms, 1);
  },
};

const spawnerConfig: SpawnerConfig = {
  ...DEFAULT_SPAWNER_CONFIG,
  initialSpawners: options.initialSpawners,
  maxSpawners: options.maxSpawners,
};
const simulation = createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG, spawnerConfig, { seed: options.seed });
const started = performance.now();
const result = await advanceSimulationToTargetAsync(simulation, options.ticks, options.ticks, {
  phaseInstrumentation,
  marketFeatureInstrumentation,
});
const elapsedMs = performance.now() - started;

console.log(
  JSON.stringify(
    {
      ok: true,
      seed: options.seed,
      targetTicks: options.ticks,
      finalTick: simulation.world.tick,
      processedTicks: result.processedTicks,
      remainingTicks: result.remainingTicks,
      population: simulation.world.spawners.length,
      elapsedMs: round(elapsedMs),
      ticksPerSecond: elapsedMs > 0 ? round((result.processedTicks / elapsedMs) * 1000) : 0,
      phaseTiming: bucketSummary(phaseBuckets),
      marketFeatureTiming: bucketSummary(featureBuckets),
    },
    null,
    2,
  ),
);

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
  const initialSpawners = readInteger(values.get("initial-spawners") ?? "100", "--initial-spawners", 1);
  return {
    ticks: readInteger(values.get("ticks") ?? "200", "--ticks", 1),
    seed: readInteger(values.get("seed") ?? "101", "--seed", 0),
    initialSpawners,
    maxSpawners: readInteger(values.get("max-spawners") ?? String(initialSpawners), "--max-spawners", 1),
  };
}

function recordBucket(target: Map<string, TimingBucket>, key: string, ms: number, count: number) {
  const elapsed = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const bucket = target.get(key) ?? { calls: 0, totalMs: 0, maxMs: 0, count: 0 };
  bucket.calls += 1;
  bucket.totalMs += elapsed;
  bucket.maxMs = Math.max(bucket.maxMs, elapsed);
  bucket.count += Math.max(0, Math.floor(count));
  target.set(key, bucket);
}

function bucketSummary(source: Map<string, TimingBucket>) {
  return Object.fromEntries(
    [...source.entries()]
      .sort(([, left], [, right]) => right.totalMs - left.totalMs)
      .map(([key, bucket]) => [
        key,
        {
          calls: bucket.calls,
          count: bucket.count,
          totalMs: round(bucket.totalMs),
          averageMs: round(bucket.totalMs / Math.max(1, bucket.calls)),
          maxMs: round(bucket.maxMs),
        },
      ]),
  );
}

function readInteger(value: string, label: string, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}

function round(value: number) {
  return Number(value.toFixed(3));
}
