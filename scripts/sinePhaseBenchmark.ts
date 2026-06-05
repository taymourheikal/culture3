import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { advanceSimulationToTargetAsync, createSimulationState } from "../src/sine/simulationRuntime";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig, type SpawnerPhaseInstrumentation } from "../src/sine/spawnerSimulation";
import type { MarketFeatureInstrumentation } from "../src/sine/spawner/marketFeatureContext";
import { parseFlagArgs, readIntegerOption, round } from "./sine-benchmark/cli";
import { basicTimingSummary, recordTiming, type TimingBucket } from "./sine-benchmark/timing";

type CliOptions = {
  ticks: number;
  seed: number;
  initialSpawners: number;
  maxSpawners: number;
};

const options = parseArgs(process.argv.slice(2));
const phaseBuckets = new Map<string, TimingBucket>();
const featureBuckets = new Map<string, TimingBucket>();
const phaseInstrumentation: SpawnerPhaseInstrumentation = {
  recordPhase(phase, ms, count = 1) {
    recordTiming(phaseBuckets, phase, ms, count);
  },
};
const marketFeatureInstrumentation: MarketFeatureInstrumentation = {
  recordFeaturePhase(phase, ms) {
    recordTiming(featureBuckets, phase, ms, 1);
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
      phaseTiming: basicTimingSummary(phaseBuckets),
      marketFeatureTiming: basicTimingSummary(featureBuckets),
    },
    null,
    2,
  ),
);

function parseArgs(args: string[]): CliOptions {
  const values = parseFlagArgs(args);
  const initialSpawners = readIntegerOption(values, "initial-spawners", 100, 1);
  return {
    ticks: readIntegerOption(values, "ticks", 200, 1),
    seed: readIntegerOption(values, "seed", 101, 0),
    initialSpawners,
    maxSpawners: readIntegerOption(values, "max-spawners", initialSpawners, 1),
  };
}
