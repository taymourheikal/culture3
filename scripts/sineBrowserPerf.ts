import { SINE_BROWSER_URL, startSineBrowserServer, withSineBrowserPage } from "./sineBrowserHarness";

const POPULATIONS = [100, 250, 500];
const ADVANCE_TICKS = 200;
const WORKER_COUNTS = [4];

async function main() {
  const server = await startSineBrowserServer();
  try {
    await withSineBrowserPage(async (page) => {
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(SINE_BROWSER_URL);
      const results = await page.evaluate(
        async ({ populations, advanceTicks, workerCounts }) => {
          const importModule = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
          const simulationRuntime = await importModule("/src/sine/simulationRuntime.ts");
          const marketRuntime = await importModule("/src/sine/marketRuntimeConfig.ts");
          const spawner = await importModule("/src/sine/spawnerSimulation.ts");
          const brainEvalPool = await importModule("/src/sine/worker/brainEvalPool.ts");
          const brainEvalConfig = await importModule("/src/sine/worker/brainEvalConfig.ts");

          function createSimulation(population: number) {
            return simulationRuntime.createSimulationState(marketRuntime.INITIAL_MARKET_RUNTIME_CONFIG, {
              ...spawner.DEFAULT_SPAWNER_CONFIG,
              initialSpawners: population,
              maxSpawners: population,
              uniquenessPopulationLimit: 1000,
            });
          }

          async function bench(name: string, run: () => void | Promise<void>) {
            const started = performance.now();
            await run();
            return { name, ms: performance.now() - started };
          }

          const rows = [];
          for (const population of populations) {
            const syncSimulation = createSimulation(population);
            rows.push(
              await bench(`browser sync advance ${population} pop / ${advanceTicks} ticks`, () => {
                simulationRuntime.advanceSimulationToTarget(syncSimulation, advanceTicks, advanceTicks);
              }),
            );

            for (const workerCount of workerCounts) {
              const parallelSimulation = createSimulation(population);
              const pool = brainEvalPool.createBrainEvalPool({
                workerCount,
                timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
              });
              rows.push(
                await bench(`browser parallel ${workerCount} workers advance ${population} pop / ${advanceTicks} ticks`, async () => {
                  await simulationRuntime.advanceSimulationToTargetAsync(parallelSimulation, advanceTicks, advanceTicks, {
                    brainEvaluationRunner: pool,
                    sessionId: 1,
                    runGeneration: 1,
                  });
                }),
              );
              pool.dispose?.();
            }
          }
          return rows;
        },
        { populations: POPULATIONS, advanceTicks: ADVANCE_TICKS, workerCounts: WORKER_COUNTS },
      );
      for (const row of results) console.log(JSON.stringify(row));
    });
  } finally {
    server.stop();
  }
}

void main();
