import { performance } from "node:perf_hooks";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { createSimulationState, advanceSimulationToTarget, advanceSimulationToTargetAsync } from "../src/sine/simulationRuntime";
import {
  createSyncBrainEvaluationRunner,
  DEFAULT_SPAWNER_CONFIG,
  computeSpawnerUniqueness,
  evaluateBrainJob,
  evaluateSpawnerBrain,
  type SpawnerConfig,
} from "../src/sine/spawnerSimulation";
import { createMarketChartPacket, createMarketRosterPacket, createMarketStatsPacket } from "../src/sine/marketWorkerSnapshot";
import { createMarketInputResolver } from "../src/sine/spawner/marketInputs";
import { buildBrainEvaluationJobs, buildSpawnerEvaluationFrame } from "../src/sine/spawner/worldBrainEvaluation";
import { compactJobFromBrainEvaluationJob, evaluateCompactBrainJob } from "../src/sine/spawner/compactBrainEvaluation";
import { createBrainEvalPool } from "../src/sine/worker/brainEvalPool";
import { BRAIN_EVAL_TIMEOUT_MS, defaultBrainEvalWorkerCount } from "../src/sine/worker/brainEvalConfig";
import { buildSinePersistencePacket } from "../src/sine/persistence/buildSinePersistencePacket";
import { sineBenchmarkScenarios } from "./sine-benchmark/scenarios";
import { createTraceInstrumentation, summarizeTraceInstrumentation } from "./sine-benchmark/trace";

type BenchResult = {
  name: string;
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  result: unknown;
};

const POPULATIONS = [100, 250, 500];
const ADVANCE_TICKS = 200;

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  printBench(`pure advance ${population} pop / ${ADVANCE_TICKS} ticks`, () => {
    const before = simulation.world.tick;
    const result = advanceSimulationToTarget(simulation, simulation.world.tick + ADVANCE_TICKS, ADVANCE_TICKS);
    return {
      processed: simulation.world.tick - before,
      finalTick: simulation.world.tick,
      finalPopulation: simulation.world.spawners.length,
      remaining: result.remainingTicks,
    };
  });
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  const runner = createSyncBrainEvaluationRunner();
  await printAsyncBench(`async sync-runner advance ${population} pop / ${ADVANCE_TICKS} ticks`, async () => {
    const before = simulation.world.tick;
    const result = await advanceSimulationToTargetAsync(simulation, simulation.world.tick + ADVANCE_TICKS, ADVANCE_TICKS, {
      brainEvaluationRunner: runner,
      sessionId: 1,
      runGeneration: 1,
    });
    return {
      processed: simulation.world.tick - before,
      finalTick: simulation.world.tick,
      finalPopulation: simulation.world.spawners.length,
      remaining: result.remainingTicks,
    };
  });
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  const pool = createBrainEvalPool({ workerCount: defaultBrainEvalWorkerCount(), timeoutMs: BRAIN_EVAL_TIMEOUT_MS });
  await printAsyncBench(`parallel-pool advance ${population} pop / ${ADVANCE_TICKS} ticks`, async () => {
    const before = simulation.world.tick;
    const result = await advanceSimulationToTargetAsync(simulation, simulation.world.tick + ADVANCE_TICKS, ADVANCE_TICKS, {
      brainEvaluationRunner: pool,
      sessionId: 1,
      runGeneration: 1,
    });
    return {
      processed: simulation.world.tick - before,
      finalTick: simulation.world.tick,
      finalPopulation: simulation.world.spawners.length,
      remaining: result.remainingTicks,
      browserWorkerApiAvailable: !!(globalThis as { Worker?: unknown }).Worker,
    };
  });
  pool.dispose?.();
}

for (const scenario of sineBenchmarkScenarios().filter((candidate) => candidate.name === "mostly-waiting" || candidate.name === "high-action")) {
  const tracePopulation = 250;
  const simulation = createSimulation(tracePopulation, scenario.config);
  const runner = createSyncBrainEvaluationRunner();
  const traceInstrumentation = createTraceInstrumentation();
  await printAsyncBench(`trace fallback ${scenario.name} @ ${tracePopulation} pop / ${ADVANCE_TICKS} ticks`, async () => {
    const before = simulation.world.tick;
    const result = await advanceSimulationToTargetAsync(simulation, simulation.world.tick + ADVANCE_TICKS, ADVANCE_TICKS, {
      brainEvaluationRunner: runner,
      sessionId: 1,
      runGeneration: 1,
      traceInstrumentation,
    });
    return {
      processed: simulation.world.tick - before,
      finalTick: simulation.world.tick,
      finalPopulation: simulation.world.spawners.length,
      remaining: result.remainingTicks,
      traceInstrumentation: summarizeTraceInstrumentation(traceInstrumentation),
    };
  });
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  advanceSimulationToTarget(simulation, 50, 50);
  const inputBySpawnerId = buildInputs(simulation);
  printBench(
    `RNN evaluate cached plan @ ${population} pop`,
    () => {
      let outputs = 0;
      for (const spawner of simulation.world.spawners) {
        outputs += evaluateSpawnerBrain(spawner, inputBySpawnerId.get(spawner.id) ?? []).outputs.length;
      }
      return { outputs, population: simulation.world.spawners.length };
    },
    20,
  );
  printBench(
    `RNN evaluate fresh plan @ ${population} pop`,
    () => {
      let outputs = 0;
      for (const spawner of simulation.world.spawners) {
        outputs += evaluateSpawnerBrain(spawner, inputBySpawnerId.get(spawner.id) ?? [], undefined, { useCachedPlan: false }).outputs.length;
      }
      return { outputs, population: simulation.world.spawners.length };
    },
    20,
  );
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  advanceSimulationToTarget(simulation, 50, 50);
  printBench(`brain worker payload proxy sizes @ ${population} pop`, () => payloadProxySizes(simulation));
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  advanceSimulationToTarget(simulation, 50, 50);
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  printBench(
    `persistence packet build @ ${population} pop`,
    () => {
      const packet = buildSinePersistencePacket({
        sessionId: 1,
        persistentSessionId: "perf",
        simulation,
        settings: simulation.marketConfig.generated,
        marketConfig: simulation.marketConfig,
        spawnerConfig: simulation.world.config,
        events: simulation.world.recentEvents,
        includeInitial: true,
        includeStateSnapshot: true,
        pendingUniquenessSnapshots: [],
        uniquenessScores,
        includeFullUniquenessTick: simulation.world.tick,
      });
      return {
        births: packet.births.length,
        deaths: packet.deaths.length,
        genomeSnapshots: packet.genomeSnapshots.length,
        stateSnapshots: packet.stateSnapshots.length,
        foodEvents: packet.foodEvents.length,
        events: packet.events.length,
        uniquenessSnapshots: packet.uniquenessSnapshots.length,
      };
    },
    10,
  );
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  advanceSimulationToTarget(simulation, 50, 50);
  printBench(
    `uniqueness compute @ ${population} pop`,
    () => {
      const scores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
      return { scores: scores.size, population: simulation.world.spawners.length };
    },
    5,
  );
}

for (const population of POPULATIONS) {
  const simulation = createSimulation(population);
  advanceSimulationToTarget(simulation, 50, 50);
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  printBench(
    `chart+roster+stats packets @ ${population} pop`,
    () => {
      const chart = createMarketChartPacket({ sessionId: 1, simulation, version: 1, centerTick: simulation.world.tick });
      const roster = createMarketRosterPacket({ sessionId: 1, simulation, version: 1, uniquenessScores });
      const stats = createMarketStatsPacket({
        sessionId: 1,
        simulation,
        settings: simulation.marketConfig.generated,
        marketConfig: simulation.marketConfig,
        pendingMarketConfig: simulation.marketConfig,
        spawnerConfig: simulation.world.config,
        pendingSpawnerConfig: simulation.world.config,
        playing: true,
        runState: "running",
        persistentSessionId: null,
        version: 1,
        backlogTicks: 0,
        packetSizesKb: {},
      });
      return { chartFoods: chart.visibleFoods.length, roster: roster.spawners.length, tick: stats.tick };
    },
    20,
  );
}

function createSimulation(initialSpawners: number, config: Partial<SpawnerConfig> = {}) {
  return createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners,
    maxSpawners: initialSpawners,
    uniquenessPopulationLimit: 1000,
    ...config,
  } satisfies Partial<SpawnerConfig>);
}

function buildInputs(simulation: ReturnType<typeof createSimulationState>) {
  const pendingFoodCount = simulation.world.foods.filter((food) => food.status === "pending").length;
  const resolver = createMarketInputResolver(simulation.timeline, simulation.world.tick, pendingFoodCount);
  return new Map(simulation.world.spawners.map((spawner) => [spawner.id, resolver.resolve(spawner.genome.perception)]));
}

function payloadProxySizes(simulation: ReturnType<typeof createSimulationState>) {
  const pendingFoodCount = simulation.world.foods.filter((food) => food.status === "pending").length;
  const resolver = createMarketInputResolver(simulation.timeline, simulation.world.tick, pendingFoodCount);
  const frame = buildSpawnerEvaluationFrame(simulation.world, resolver);
  const jobs = buildBrainEvaluationJobs(frame, {
    sessionId: 1,
    runGeneration: 1,
    batchId: simulation.world.tick,
  });
  const compactFirstSendJobs = jobs.map((job) => compactJobFromBrainEvaluationJob(job, { plan: frame.plans[job.index] }));
  const compactCachedJobs = jobs.map((job) =>
    compactJobFromBrainEvaluationJob(job, {
      plan: frame.plans[job.index],
      includeGenome: false,
      includeGenomePayload: false,
    }),
  );
  const objectResults = jobs.map((job) => evaluateBrainJob(job));
  const compactResults = compactFirstSendJobs.map((job) => evaluateCompactBrainJob(job));
  return {
    population: jobs.length,
    objectRequestKb: jsonSizeKb({ type: "evaluateBrainShard", requestId: 1, jobs }),
    compactFirstRequestKb: jsonSizeKb({ type: "evaluateBrainShard", requestId: 1, protocol: "compact", compactJobs: compactFirstSendJobs }),
    compactCachedRequestKb: jsonSizeKb({ type: "evaluateBrainShard", requestId: 1, protocol: "compact", compactJobs: compactCachedJobs }),
    objectResponseKb: jsonSizeKb({ type: "brainShardResult", requestId: 1, results: objectResults }),
    compactResponseKb: jsonSizeKb({ type: "brainShardResult", requestId: 1, protocol: "compact", results: [], compactResults }),
  };
}

function jsonSizeKb(value: unknown) {
  return Math.round((JSON.stringify(value).length / 1024) * 100) / 100;
}

function printBench(name: string, fn: () => unknown, iterations = 1) {
  console.log(JSON.stringify(bench(name, fn, iterations), null, 2));
}

async function printAsyncBench(name: string, fn: () => Promise<unknown>, iterations = 1) {
  console.log(JSON.stringify(await asyncBench(name, fn, iterations), null, 2));
}

function bench(name: string, fn: () => unknown, iterations: number): BenchResult {
  const times: number[] = [];
  let result: unknown;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    result = fn();
    times.push(performance.now() - started);
  }
  const sorted = [...times].sort((left, right) => left - right);
  return {
    name,
    iterations,
    avgMs: times.reduce((sum, value) => sum + value, 0) / Math.max(1, times.length),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    result,
  };
}

async function asyncBench(name: string, fn: () => Promise<unknown>, iterations: number): Promise<BenchResult> {
  const times: number[] = [];
  let result: unknown;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    result = await fn();
    times.push(performance.now() - started);
  }
  const sorted = [...times].sort((left, right) => left - right);
  return {
    name,
    iterations,
    avgMs: times.reduce((sum, value) => sum + value, 0) / Math.max(1, times.length),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    result,
  };
}

function percentile(sorted: number[], rank: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * rank)));
  return sorted[index] ?? 0;
}
