import { SINE_BROWSER_URL, startSineBrowserServer, withSineBrowserPage } from "./sineBrowserHarness";

type BrowserPerfOptions = {
  populations: number[];
  advanceTicks: number;
  workerCounts: number[];
  scenarios: string[];
  timeoutMs: number;
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
  const server = await startSineBrowserServer();
  try {
    await withSineBrowserPage(async (page) => {
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(SINE_BROWSER_URL);
      const benchmark = page.evaluate(
        async ({ populations, advanceTicks, workerCounts, scenarios }) => {
          const importModule = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
          const simulationRuntime = await importModule("/src/sine/simulationRuntime.ts");
          const marketRuntime = await importModule("/src/sine/marketRuntimeConfig.ts");
          const spawner = await importModule("/src/sine/spawnerSimulation.ts");
          const brainEvalPool = await importModule("/src/sine/worker/brainEvalPool.ts");
          const brainEvalConfig = await importModule("/src/sine/worker/brainEvalConfig.ts");

          function createSimulation(population: number, scenario: string) {
            return simulationRuntime.createSimulationState(marketRuntime.INITIAL_MARKET_RUNTIME_CONFIG, {
              ...spawner.DEFAULT_SPAWNER_CONFIG,
              ...scenarioConfig(population, scenario),
              initialSpawners: population,
              uniquenessPopulationLimit: 1000,
            });
          }

          async function bench(name: string, run: () => void | Promise<void>) {
            const started = performance.now();
            await run();
            return { name, ms: round(performance.now() - started) };
          }

          function scenarioConfig(population: number, scenario: string) {
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
            if (scenario === "high-action") {
              return {
                maxSpawners: population,
                initialEnergyMin: 100,
                initialEnergyMax: 100,
                initialCooldownMaxTicks: 0,
                cooldownBaseTicksInitialMin: 0,
                cooldownBaseTicksInitialMax: 0,
                cooldownOutputMultiplierTicks: 0,
                defaultSpawnThreshold: 0,
                defaultMinSignalStrength: 0,
                initialReproductionOutputBias: -20,
              };
            }
            return {
              maxSpawners: population,
              initialReproductionOutputBias: -20,
            };
          }

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
          for (const scenario of scenarios) {
            for (const population of populations) {
              const syncSimulation = createSimulation(population, scenario);
              const syncRow = await bench(`browser ${scenario} sync advance ${population} pop / ${advanceTicks} ticks`, () => {
                  simulationRuntime.advanceSimulationToTarget(syncSimulation, advanceTicks, advanceTicks);
                });
              rows.push({
                ...syncRow,
                scenario,
                mode: "sync",
                population,
                advanceTicks,
                finalPopulation: syncSimulation.world.spawners.length,
              });

              for (const workerCount of workerCounts) {
                const parallelSimulation = createSimulation(population, scenario);
                const pool = brainEvalPool.createBrainEvalPool({
                  workerCount,
                  timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
                });
                const objectTrace = scenario === "high-action" ? createTraceInstrumentation() : undefined;
                const objectRow = await bench(`browser ${scenario} object parallel ${workerCount} workers advance ${population} pop / ${advanceTicks} ticks`, async () => {
                  await simulationRuntime.advanceSimulationToTargetAsync(parallelSimulation, advanceTicks, advanceTicks, {
                    brainEvaluationRunner: pool,
                    sessionId: 1,
                    runGeneration: 1,
                    traceInstrumentation: objectTrace,
                  });
                });
                rows.push({
                  ...objectRow,
                  scenario,
                  mode: "object-worker",
                  population,
                  advanceTicks,
                  workerCount,
                  finalPopulation: parallelSimulation.world.spawners.length,
                  runnerStats: summarizeRunnerStats(pool),
                  trace: summarizeTrace(objectTrace),
                });
                pool.dispose?.();

                const compactSimulation = createSimulation(population, scenario);
                const compactPool = brainEvalPool.createBrainEvalPool({
                  workerCount,
                  timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
                  protocol: "compact",
                });
                const compactTrace = scenario === "high-action" ? createTraceInstrumentation() : undefined;
                const compactRow = await bench(`browser ${scenario} compact parallel ${workerCount} workers advance ${population} pop / ${advanceTicks} ticks`, async () => {
                  await simulationRuntime.advanceSimulationToTargetAsync(compactSimulation, advanceTicks, advanceTicks, {
                    brainEvaluationRunner: compactPool,
                    sessionId: 1,
                    runGeneration: 1,
                    traceInstrumentation: compactTrace,
                  });
                });
                rows.push({
                  ...compactRow,
                  scenario,
                  mode: "compact-worker",
                  population,
                  advanceTicks,
                  workerCount,
                  finalPopulation: compactSimulation.world.spawners.length,
                  runnerStats: summarizeRunnerStats(compactPool),
                  trace: summarizeTrace(compactTrace),
                });
                compactPool.dispose?.();
              }
            }
          }
          return rows;
        },
        { populations: options.populations, advanceTicks: options.advanceTicks, workerCounts: options.workerCounts, scenarios: options.scenarios },
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
    populations: readIntegerList(values.get("populations"), DEFAULT_OPTIONS.populations, "--populations", 1),
    advanceTicks: readInteger(values.get("advance-ticks"), DEFAULT_OPTIONS.advanceTicks, "--advance-ticks", 1),
    workerCounts: readIntegerList(values.get("worker-counts"), DEFAULT_OPTIONS.workerCounts, "--worker-counts", 0),
    scenarios: readScenarioList(values.get("scenarios"), DEFAULT_OPTIONS.scenarios),
    timeoutMs: readInteger(values.get("timeout-ms"), DEFAULT_OPTIONS.timeoutMs, "--timeout-ms", 0),
  };
}

function readIntegerList(value: string | undefined, fallback: number[], label: string, min: number) {
  if (!value) return fallback;
  const parsed = value.split(",").map((item) => readInteger(item, 0, label, min));
  if (parsed.length === 0) throw new Error(`${label} must contain at least one integer`);
  return parsed;
}

function readInteger(value: string | undefined, fallback: number, label: string, min: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}

function readScenarioList(value: string | undefined, fallback: string[]) {
  if (!value) return fallback;
  const allowed = new Set(["fixed", "normal-churn", "high-churn", "high-action"]);
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (parsed.length === 0) throw new Error("--scenarios must contain at least one scenario");
  for (const scenario of parsed) {
    if (!allowed.has(scenario)) throw new Error(`Unknown scenario ${scenario}`);
  }
  return parsed;
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
