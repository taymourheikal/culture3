import { performance } from "node:perf_hooks";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { advanceSimulationToTarget, advanceSimulationToTargetAsync, createSimulationState } from "../src/sine/simulationRuntime";
import {
  DEFAULT_SPAWNER_CONFIG,
  evaluateSpawnerBrain,
  type SpawnerConfig,
  type SpawnerPhaseInstrumentation,
} from "../src/sine/spawnerSimulation";
import type { BrainTraceInstrumentation } from "../src/sine/spawner/worldBrainEvaluation";
import type { MarketFeatureInstrumentation } from "../src/sine/spawner/marketFeatureContext";
import type { BrainEvaluationInstrumentation } from "../src/sine/spawner/brain";
import { createMarketInputResolver } from "../src/sine/spawner/marketInputs";

type TimingBucket = {
  calls: number;
  totalMs: number;
  maxMs: number;
  count: number;
};

type MetricBucket = {
  samples: number[];
  total: number;
  max: number;
};

type Scenario = {
  name: string;
  config: Partial<SpawnerConfig>;
  maxSpawners?: (population: number) => number;
};

const options = parseArgs(process.argv.slice(2));
const scenarios = scenarioDefinitions().filter((scenario) => options.scenarios.includes(scenario.name));
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

async function profileScenario(scenario: Scenario, population: number) {
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
    phaseTiming: bucketSummary(phaseBuckets, result.processedTicks),
    topPhases: topBuckets(phaseBuckets, 8),
    marketFeatureTiming: bucketSummary(featureBuckets, result.processedTicks),
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
    cachedTiming: bucketSummary(cachedBuckets, options.brainIterations),
    freshTotalMs: round(freshMs),
    freshMsPerEvaluation: round(freshMs / Math.max(1, simulation.world.spawners.length * options.brainIterations)),
    freshTiming: bucketSummary(freshBuckets, options.brainIterations),
  };
}

function scenarioDefinitions(): Scenario[] {
  return [
    { name: "baseline", config: {} },
    {
      name: "mostly-waiting",
      config: {
        defaultSpawnThreshold: 2,
        initialReproductionOutputBias: -20,
      },
    },
    {
      name: "high-action",
      config: {
        defaultSpawnThreshold: 0,
        defaultMinSignalStrength: 0,
        initialCooldownMaxTicks: 0,
        cooldownBaseTicksInitialMin: 0,
        cooldownBaseTicksInitialMax: 0,
        cooldownOutputMultiplierTicks: 0,
        initialEnergyMin: 100,
        initialEnergyMax: 100,
        initialReproductionOutputBias: -20,
      },
    },
    {
      name: "high-reproduction",
      maxSpawners: (population) => population * 2,
      config: {
        initialEnergyMin: 220,
        initialEnergyMax: 220,
        reproductionEnergy: 0,
        reproductionCost: 0,
        reproductionCostMinMultiplier: 0,
        reproductionCostMaxMultiplier: 0,
        initialReproductionOutputBias: 2,
        defaultSpawnThreshold: 2,
      },
    },
  ];
}

function createSimulation(initialSpawners: number, scenario: Scenario) {
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

function createTraceInstrumentation(): BrainTraceInstrumentation {
  return {
    evaluatedAgents: 0,
    firstPassBatches: 0,
    firstPassMs: 0,
    waitActions: 0,
    longActions: 0,
    shortActions: 0,
    reproductionTraces: 0,
    optimizedTraceMaterializations: 0,
    optimizedTraceMaterializationMs: 0,
    fallbackTraceEvaluations: 0,
    fallbackTraceMs: 0,
  };
}

function summarizeTraceInstrumentation(stats: BrainTraceInstrumentation) {
  const actionCount = stats.longActions + stats.shortActions;
  return {
    ...stats,
    actionCount,
    firstPassMsPerAgent: round(stats.evaluatedAgents > 0 ? stats.firstPassMs / stats.evaluatedAgents : 0),
    optimizedTraceMaterializationMsPerEvaluation: round(
      stats.optimizedTraceMaterializations > 0 ? stats.optimizedTraceMaterializationMs / stats.optimizedTraceMaterializations : 0,
    ),
    fallbackTraceMsPerEvaluation: round(stats.fallbackTraceEvaluations > 0 ? stats.fallbackTraceMs / stats.fallbackTraceEvaluations : 0),
  };
}

function recordTiming(target: Map<string, TimingBucket>, key: string, ms: number, count: number) {
  const elapsed = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const bucket = target.get(key) ?? { calls: 0, totalMs: 0, maxMs: 0, count: 0 };
  bucket.calls += 1;
  bucket.totalMs += elapsed;
  bucket.maxMs = Math.max(bucket.maxMs, elapsed);
  bucket.count += Math.max(0, Math.floor(count));
  target.set(key, bucket);
}

function recordMetric(target: Map<string, MetricBucket>, key: string, value: number) {
  if (!Number.isFinite(value)) return;
  const bucket = target.get(key) ?? { samples: [], total: 0, max: Number.NEGATIVE_INFINITY };
  bucket.samples.push(value);
  bucket.total += value;
  bucket.max = Math.max(bucket.max, value);
  target.set(key, bucket);
}

function bucketSummary(source: Map<string, TimingBucket>, ticks: number) {
  return Object.fromEntries(
    [...source.entries()]
      .sort(([, left], [, right]) => right.totalMs - left.totalMs)
      .map(([key, bucket]) => [
        key,
        {
          calls: bucket.calls,
          count: bucket.count,
          totalMs: round(bucket.totalMs),
          msPerTick: round(bucket.totalMs / Math.max(1, ticks)),
          msPerCall: round(bucket.totalMs / Math.max(1, bucket.calls)),
          msPerCount: round(bucket.totalMs / Math.max(1, bucket.count)),
          maxMs: round(bucket.maxMs),
        },
      ]),
  );
}

function topBuckets(source: Map<string, TimingBucket>, limit: number) {
  return [...source.entries()]
    .sort(([, left], [, right]) => right.totalMs - left.totalMs)
    .slice(0, limit)
    .map(([phase, bucket]) => ({ phase, totalMs: round(bucket.totalMs), calls: bucket.calls, count: bucket.count }));
}

function metricSummary(source: Map<string, MetricBucket>) {
  return Object.fromEntries(
    [...source.entries()].map(([key, bucket]) => {
      const sorted = [...bucket.samples].sort((left, right) => left - right);
      return [
        key,
        {
          samples: bucket.samples.length,
          total: round(bucket.total),
          average: round(bucket.total / Math.max(1, bucket.samples.length)),
          p50: round(percentile(sorted, 0.5)),
          p95: round(percentile(sorted, 0.95)),
          max: round(bucket.max),
        },
      ];
    }),
  );
}

function memoryDelta(start: NodeJS.MemoryUsage, end: NodeJS.MemoryUsage) {
  return {
    heapUsedDeltaMb: round((end.heapUsed - start.heapUsed) / 1024 / 1024),
    heapTotalDeltaMb: round((end.heapTotal - start.heapTotal) / 1024 / 1024),
    rssDeltaMb: round((end.rss - start.rss) / 1024 / 1024),
  };
}

function parseArgs(args: string[]) {
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
  return {
    ticks: readInteger(values.get("ticks") ?? "200", "--ticks", 1),
    warmupTicks: readInteger(values.get("warmup-ticks") ?? "0", "--warmup-ticks", 0),
    brainWarmupTicks: readInteger(values.get("brain-warmup-ticks") ?? "50", "--brain-warmup-ticks", 0),
    brainIterations: readInteger(values.get("brain-iterations") ?? "10", "--brain-iterations", 1),
    seed: readInteger(values.get("seed") ?? "101", "--seed", 0),
    populations: (values.get("populations") ?? "100,250,500").split(",").map((value) => readInteger(value.trim(), "--populations", 1)),
    scenarios: (values.get("scenarios") ?? "baseline,mostly-waiting,high-action,high-reproduction").split(",").map((value) => value.trim()),
  };
}

function readInteger(value: string, label: string, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function round(value: number) {
  return Number(value.toFixed(3));
}
