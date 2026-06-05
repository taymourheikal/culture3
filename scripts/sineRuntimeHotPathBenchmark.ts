import { performance } from "node:perf_hooks";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { advanceSimulationToTarget, advanceSimulationToTargetAsync, createSimulationState } from "../src/sine/simulationRuntime";
import {
  DEFAULT_SPAWNER_CONFIG,
  evaluateSpawnerBrain,
  type SpawnerConfig,
  type SpawnerPhaseInstrumentation,
} from "../src/sine/spawnerSimulation";
import type { MarketFeatureInstrumentation } from "../src/sine/spawner/marketFeatureContext";
import type { BrainEvaluationInstrumentation } from "../src/sine/spawner/brain";
import { createMarketInputResolver } from "../src/sine/spawner/marketInputs";
import { parseFlagArgs, readIntegerListOption, readIntegerOption, round } from "./sine-benchmark/cli";
import { benchmarkTimingSummary, metricSummary, recordMetric, recordTiming, topTimingBuckets, type MetricBucket, type TimingBucket } from "./sine-benchmark/timing";
import { createTraceInstrumentation, summarizeTraceInstrumentation } from "./sine-benchmark/trace";
import { sineBenchmarkScenarios, type SineBenchmarkScenario } from "./sine-benchmark/scenarios";

const options = parseArgs(process.argv.slice(2));
const scenarios = sineBenchmarkScenarios().filter((scenario) => options.scenarios.includes(scenario.name));
const results = [];
for (const scenario of scenarios) {
  for (const population of options.populations) {
    results.push(await profileScenario(scenario, population));
  }
}
const brainProfiles = options.populations.map((population) => profileBrain(population));

console.log(
  JSON.stringify(
    {
      ok: true,
      settings: options,
      results,
      brainProfiles,
    },
    null,
    2,
  ),
);

async function profileScenario(scenario: SineBenchmarkScenario, population: number) {
  const simulation = createSimulation(population, scenario);
  if (options.warmupTicks > 0) advanceSimulationToTarget(simulation, options.warmupTicks, options.warmupTicks);
  const phaseBuckets = new Map<string, TimingBucket>();
  const featureBuckets = new Map<string, TimingBucket>();
  const metricBuckets = new Map<string, MetricBucket>();
  const traceInstrumentation = createTraceInstrumentation();
  const phaseInstrumentation: SpawnerPhaseInstrumentation = {
    recordPhase(phase, ms, count = 1) {
      recordTiming(phaseBuckets, phase, ms, count);
    },
    recordMetric(metric, value) {
      recordMetric(metricBuckets, metric, value);
    },
  };
  const marketFeatureInstrumentation: MarketFeatureInstrumentation = {
    recordFeaturePhase(phase, ms) {
      recordTiming(featureBuckets, phase, ms, 1);
    },
  };
  const startMemory = process.memoryUsage();
  const started = performance.now();
  const result = await advanceSimulationToTargetAsync(simulation, simulation.world.tick + options.ticks, options.ticks, {
    phaseInstrumentation,
    marketFeatureInstrumentation,
    traceInstrumentation,
    sessionId: 1,
    runGeneration: 1,
  });
  const elapsedMs = performance.now() - started;
  const endMemory = process.memoryUsage();
  return {
    scenario: scenario.name,
    population,
    warmupTicks: options.warmupTicks,
    ticks: options.ticks,
    finalTick: simulation.world.tick,
    finalPopulation: simulation.world.spawners.length,
    processedTicks: result.processedTicks,
    remainingTicks: result.remainingTicks,
    elapsedMs: round(elapsedMs),
    ticksPerSecond: elapsedMs > 0 ? round((result.processedTicks / elapsedMs) * 1000) : 0,
    memory: memoryDelta(startMemory, endMemory),
    phaseTiming: benchmarkTimingSummary(phaseBuckets, result.processedTicks),
    topPhases: topTimingBuckets(phaseBuckets, 8),
    marketFeatureTiming: benchmarkTimingSummary(featureBuckets, result.processedTicks),
    metrics: metricSummary(metricBuckets),
    trace: summarizeTraceInstrumentation(traceInstrumentation),
    finalFoodSummary: summarizeFoods(simulation.world.foods),
  };
}

function profileBrain(population: number) {
  const simulation = createSimulation(population, { name: "baseline", config: {} });
  advanceSimulationToTarget(simulation, Math.max(1, options.brainWarmupTicks), Math.max(1, options.brainWarmupTicks));
  const pendingFoodCount = simulation.world.foods.filter((food) => food.status === "pending").length;
  const resolver = createMarketInputResolver(simulation.timeline, simulation.world.tick, pendingFoodCount);
  const inputs = new Map(simulation.world.spawners.map((spawner) => [spawner.id, resolver.resolve(spawner.genome.perception)]));
  const cachedBuckets = new Map<string, TimingBucket>();
  const freshBuckets = new Map<string, TimingBucket>();
  const cachedInstrumentation: BrainEvaluationInstrumentation = {
    recordBrainPhase(phase, ms, count = 1) {
      recordTiming(cachedBuckets, phase, ms, count);
    },
  };
  const freshInstrumentation: BrainEvaluationInstrumentation = {
    recordBrainPhase(phase, ms, count = 1) {
      recordTiming(freshBuckets, phase, ms, count);
    },
  };

  const cachedStarted = performance.now();
  for (let iteration = 0; iteration < options.brainIterations; iteration += 1) {
    for (const spawner of simulation.world.spawners) {
      evaluateSpawnerBrain(spawner, inputs.get(spawner.id) ?? [], undefined, { instrumentation: cachedInstrumentation });
    }
  }
  const cachedMs = performance.now() - cachedStarted;

  const freshStarted = performance.now();
  for (let iteration = 0; iteration < options.brainIterations; iteration += 1) {
    for (const spawner of simulation.world.spawners) {
      evaluateSpawnerBrain(spawner, inputs.get(spawner.id) ?? [], undefined, { useCachedPlan: false, instrumentation: freshInstrumentation });
    }
  }
  const freshMs = performance.now() - freshStarted;

  return {
    population,
    finalPopulation: simulation.world.spawners.length,
    iterations: options.brainIterations,
    evaluations: simulation.world.spawners.length * options.brainIterations,
    cachedTotalMs: round(cachedMs),
    cachedMsPerEvaluation: round(cachedMs / Math.max(1, simulation.world.spawners.length * options.brainIterations)),
    cachedTiming: benchmarkTimingSummary(cachedBuckets, options.brainIterations),
    freshTotalMs: round(freshMs),
    freshMsPerEvaluation: round(freshMs / Math.max(1, simulation.world.spawners.length * options.brainIterations)),
    freshTiming: benchmarkTimingSummary(freshBuckets, options.brainIterations),
  };
}

function createSimulation(initialSpawners: number, scenario: SineBenchmarkScenario) {
  return createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners,
    maxSpawners: scenario.maxSpawners ? scenario.maxSpawners(initialSpawners) : initialSpawners,
    uniquenessPopulationLimit: 1000,
    ...scenario.config,
  } satisfies Partial<SpawnerConfig>, { seed: options.seed });
}

function summarizeFoods(foods: Array<{ status: string; spawnTick: number; resolveTick: number }>) {
  const pending = foods.filter((food) => food.status === "pending");
  const horizons = pending.map((food) => Math.max(0, food.resolveTick - food.spawnTick));
  return {
    retained: foods.length,
    pending: pending.length,
    horizonBuckets: {
      lte5: horizons.filter((value) => value <= 5).length,
      lte10: horizons.filter((value) => value > 5 && value <= 10).length,
      lte25: horizons.filter((value) => value > 10 && value <= 25).length,
      lte50: horizons.filter((value) => value > 25 && value <= 50).length,
      gt50: horizons.filter((value) => value > 50).length,
    },
  };
}

function memoryDelta(start: NodeJS.MemoryUsage, end: NodeJS.MemoryUsage) {
  return {
    heapUsedDeltaMb: round((end.heapUsed - start.heapUsed) / 1024 / 1024),
    heapTotalDeltaMb: round((end.heapTotal - start.heapTotal) / 1024 / 1024),
    rssDeltaMb: round((end.rss - start.rss) / 1024 / 1024),
  };
}

function parseArgs(args: string[]) {
  const values = parseFlagArgs(args);
  return {
    ticks: readIntegerOption(values, "ticks", 200, 1),
    warmupTicks: readIntegerOption(values, "warmup-ticks", 0, 0),
    brainWarmupTicks: readIntegerOption(values, "brain-warmup-ticks", 50, 0),
    brainIterations: readIntegerOption(values, "brain-iterations", 10, 1),
    seed: readIntegerOption(values, "seed", 101, 0),
    populations: readIntegerListOption(values, "populations", [100, 250, 500], 1),
    scenarios: (values.get("scenarios") ?? "baseline,mostly-waiting,high-action,high-reproduction").split(",").map((value) => value.trim()),
  };
}
