import { SINE_BROWSER_URL, startSineBrowserServer, withSineBrowserPage } from "./sineBrowserHarness";
import { parseFlagArgs, readIntegerListOption, readIntegerOption } from "./sine-benchmark/cli";
import { sineBenchmarkScenarios } from "./sine-benchmark/scenarios";
import type { SpawnerConfig } from "../src/sine/spawnerSimulation";

type BrowserPerfOptions = {
  populations: number[];
  advanceTicks: number;
  workerCounts: number[];
  scenarios: string[];
  timeoutMs: number;
};

type BrowserScenarioRun = {
  scenario: string;
  population: number;
  config: Partial<SpawnerConfig>;
};

const DEFAULT_OPTIONS: BrowserPerfOptions = {
  populations: [100, 250, 500],
  advanceTicks: 200,
  workerCounts: [4],
  scenarios: ["fixed"],
  timeoutMs: 0,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarioRuns = createBrowserScenarioRuns(options.populations, options.scenarios);
  const server = await startSineBrowserServer();
  try {
    await withSineBrowserPage(async (page) => {
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(SINE_BROWSER_URL);
      const benchmark = page.evaluate(
        async ({ advanceTicks, workerCounts, scenarioRuns }) => {
          const importModule = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
          const simulationRuntime = await importModule("/src/sine/simulationRuntime.ts");
          const marketRuntime = await importModule("/src/sine/marketRuntimeConfig.ts");
          const spawner = await importModule("/src/sine/spawnerSimulation.ts");
          const brainEvalPool = await importModule("/src/sine/worker/brainEvalPool.ts");
          const brainEvalConfig = await importModule("/src/sine/worker/brainEvalConfig.ts");

          function createSimulation(run: BrowserScenarioRun) {
            return simulationRuntime.createSimulationState(marketRuntime.INITIAL_MARKET_RUNTIME_CONFIG, {
              ...spawner.DEFAULT_SPAWNER_CONFIG,
              ...run.config,
              initialSpawners: run.population,
              uniquenessPopulationLimit: 1000,
            });
          }

          async function bench(name: string, run: () => void | Promise<void>) {
            const started = performance.now();
            await run();
            return { name, ms: round(performance.now() - started) };
          }

          // Browser context cannot import Node-side benchmark helpers from scripts/.
          function createTraceInstrumentation() {
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

          function summarizeTrace(stats: Record<string, number> | undefined) {
            if (!stats) return undefined;
            return {
              evaluatedAgents: stats.evaluatedAgents,
              actionCount: (stats.longActions ?? 0) + (stats.shortActions ?? 0),
              optimizedTraceMaterializations: stats.optimizedTraceMaterializations,
              optimizedTraceMaterializationMs: round(stats.optimizedTraceMaterializationMs ?? 0),
              fallbackTraceEvaluations: stats.fallbackTraceEvaluations,
              fallbackTraceMs: round(stats.fallbackTraceMs ?? 0),
            };
          }

          function summarizeRunnerStats(pool: any) {
            const stats = pool.stats?.();
            if (!stats) return undefined;
            return {
              parallelBatches: stats.parallelBatches,
              syncFallbackBatches: stats.syncFallbackBatches,
              disabledBatches: stats.disabledBatches,
              transport: summarizeTransport(stats.transport),
              lastBatch: summarizeTransport(stats.lastBatch),
            };
          }

          function summarizeTransport(stats: any) {
            if (!stats) return undefined;
            return {
              protocol: stats.protocol,
              jobs: stats.jobs,
              shards: stats.shards,
              batchWallMs: round(stats.batchWallMs),
              requestPayloadKb: round(stats.requestPayloadKb),
              responsePayloadKb: round(stats.responsePayloadKb),
              requestPostMs: round(stats.requestPostMs),
              workerComputeMs: round(stats.workerComputeMs),
              resultMaterializationMs: round(stats.resultMaterializationMs),
              estimatedTransportAndWaitMs: round(stats.estimatedTransportAndWaitMs),
              objectGenomeSends: stats.objectGenomeSends,
              objectGenomeCacheHits: stats.objectGenomeCacheHits,
              compactGenomeSends: stats.compactGenomeSends,
              compactGenomeCacheHits: stats.compactGenomeCacheHits,
            };
          }

          function round(value: number) {
            return Math.round(value * 1000) / 1000;
          }

          const rows = [];
          for (const run of scenarioRuns) {
              const syncSimulation = createSimulation(run);
              const syncRow = await bench(`browser ${run.scenario} sync advance ${run.population} pop / ${advanceTicks} ticks`, () => {
                  simulationRuntime.advanceSimulationToTarget(syncSimulation, advanceTicks, advanceTicks);
                });
              rows.push({
                ...syncRow,
                scenario: run.scenario,
                mode: "sync",
                population: run.population,
                advanceTicks,
                finalPopulation: syncSimulation.world.spawners.length,
              });

              for (const workerCount of workerCounts) {
                const parallelSimulation = createSimulation(run);
                const pool = brainEvalPool.createBrainEvalPool({
                  workerCount,
                  timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
                });
                const objectTrace = run.scenario === "high-action" ? createTraceInstrumentation() : undefined;
                const objectRow = await bench(`browser ${run.scenario} object parallel ${workerCount} workers advance ${run.population} pop / ${advanceTicks} ticks`, async () => {
                  await simulationRuntime.advanceSimulationToTargetAsync(parallelSimulation, advanceTicks, advanceTicks, {
                    brainEvaluationRunner: pool,
                    sessionId: 1,
                    runGeneration: 1,
                    traceInstrumentation: objectTrace,
                  });
                });
                rows.push({
                  ...objectRow,
                  scenario: run.scenario,
                  mode: "object-worker",
                  population: run.population,
                  advanceTicks,
                  workerCount,
                  finalPopulation: parallelSimulation.world.spawners.length,
                  runnerStats: summarizeRunnerStats(pool),
                  trace: summarizeTrace(objectTrace),
                });
                pool.dispose?.();

                const compactSimulation = createSimulation(run);
                const compactPool = brainEvalPool.createBrainEvalPool({
                  workerCount,
                  timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
                  protocol: "compact",
                });
                const compactTrace = run.scenario === "high-action" ? createTraceInstrumentation() : undefined;
                const compactRow = await bench(`browser ${run.scenario} compact parallel ${workerCount} workers advance ${run.population} pop / ${advanceTicks} ticks`, async () => {
                  await simulationRuntime.advanceSimulationToTargetAsync(compactSimulation, advanceTicks, advanceTicks, {
                    brainEvaluationRunner: compactPool,
                    sessionId: 1,
                    runGeneration: 1,
                    traceInstrumentation: compactTrace,
                  });
                });
                rows.push({
                  ...compactRow,
                  scenario: run.scenario,
                  mode: "compact-worker",
                  population: run.population,
                  advanceTicks,
                  workerCount,
                  finalPopulation: compactSimulation.world.spawners.length,
                  runnerStats: summarizeRunnerStats(compactPool),
                  trace: summarizeTrace(compactTrace),
                });
                compactPool.dispose?.();
              }
          }
          return rows;
        },
        { advanceTicks: options.advanceTicks, workerCounts: options.workerCounts, scenarioRuns },
      );
      const results = options.timeoutMs > 0 ? await withTimeout(benchmark, options) : await benchmark;
      for (const row of results) console.log(JSON.stringify(row));
    });
  } finally {
    server.stop();
  }
}

void main();

function parseArgs(args: string[]): BrowserPerfOptions {
  const values = parseFlagArgs(args);
  return {
    populations: readIntegerListOption(values, "populations", DEFAULT_OPTIONS.populations, 1),
    advanceTicks: readIntegerOption(values, "advance-ticks", DEFAULT_OPTIONS.advanceTicks, 1),
    workerCounts: readIntegerListOption(values, "worker-counts", DEFAULT_OPTIONS.workerCounts, 0),
    scenarios: readScenarioList(values.get("scenarios"), DEFAULT_OPTIONS.scenarios),
    timeoutMs: readIntegerOption(values, "timeout-ms", DEFAULT_OPTIONS.timeoutMs, 0),
  };
}

function readScenarioList(value: string | undefined, fallback: string[]) {
  if (!value) return fallback;
  const allowed = new Set([...browserSpecificScenarioNames(), ...sineBenchmarkScenarios().map((scenario) => scenario.name)]);
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (parsed.length === 0) throw new Error("--scenarios must contain at least one scenario");
  for (const scenario of parsed) {
    if (!allowed.has(scenario)) throw new Error(`Unknown scenario ${scenario}`);
  }
  return parsed;
}

function createBrowserScenarioRuns(populations: number[], scenarioNames: string[]): BrowserScenarioRun[] {
  const shared = new Map(sineBenchmarkScenarios().map((scenario) => [scenario.name, scenario]));
  const runs: BrowserScenarioRun[] = [];
  for (const scenario of scenarioNames) {
    for (const population of populations) {
      runs.push({
        scenario,
        population,
        config: browserScenarioConfig(scenario, population, shared),
      });
    }
  }
  return runs;
}

function browserScenarioConfig(scenario: string, population: number, shared: Map<string, ReturnType<typeof sineBenchmarkScenarios>[number]>): Partial<SpawnerConfig> {
  const sharedScenario = shared.get(scenario);
  if (sharedScenario) {
    return {
      ...sharedScenario.config,
      maxSpawners: sharedScenario.maxSpawners ? sharedScenario.maxSpawners(population) : population,
    };
  }
  if (scenario === "normal-churn") {
    return {
      maxSpawners: Math.max(population + 1, Math.floor(population * 1.35)),
      initialEnergyMin: 45,
      initialEnergyMax: 55,
      reproductionEnergy: 16,
      reproductionCost: 3,
      initialReproductionOutputBias: -0.4,
    };
  }
  if (scenario === "high-churn") {
    return {
      maxSpawners: Math.max(population + 1, Math.floor(population * 2)),
      initialEnergyMin: 80,
      initialEnergyMax: 100,
      initialCooldownMaxTicks: 0,
      cooldownBaseTicksInitialMin: 0,
      cooldownBaseTicksInitialMax: 0,
      cooldownOutputMultiplierTicks: 0,
      defaultSpawnThreshold: 0,
      defaultMinSignalStrength: 0,
      reproductionEnergy: 3,
      reproductionCost: 0.5,
      initialReproductionOutputBias: 8,
      deathEnergy: -40,
    };
  }
  // Browser-specific fixed benchmark intentionally suppresses reproduction while keeping maxSpawners at population.
  return {
    maxSpawners: population,
    initialReproductionOutputBias: -20,
  };
}

function browserSpecificScenarioNames() {
  return ["fixed", "normal-churn", "high-churn"];
}

async function withTimeout<T>(promise: Promise<T>, options: BrowserPerfOptions): Promise<T | Array<Record<string, unknown>>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<Array<Record<string, unknown>>>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve([
            {
              name: "browser benchmark timeout",
              timeoutMs: options.timeoutMs,
              populations: options.populations,
              advanceTicks: options.advanceTicks,
              workerCounts: options.workerCounts,
            },
          ]);
        }, options.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
