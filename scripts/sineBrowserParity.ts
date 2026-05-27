import { strict as assert } from "node:assert";
import { SINE_BROWSER_URL, startSineBrowserServer, withSineBrowserPage } from "./sineBrowserHarness";

const POPULATION = 500;
const ADVANCE_TICKS = 40;

async function main() {
  const server = await startSineBrowserServer();
  try {
    await withSineBrowserPage(async (page) => {
      await page.addInitScript("window.__name = (fn) => fn;");
      await page.goto(SINE_BROWSER_URL);
      const result = await page.evaluate(
        async ({ population, advanceTicks }) => {
          const importModule = (path: string) => import(/* @vite-ignore */ path) as Promise<any>;
          const simulationRuntime = await importModule("/src/sine/simulationRuntime.ts");
          const marketRuntime = await importModule("/src/sine/marketRuntimeConfig.ts");
          const spawner = await importModule("/src/sine/spawnerSimulation.ts");
          const brainEvalPool = await importModule("/src/sine/worker/brainEvalPool.ts");
          const brainEvalConfig = await importModule("/src/sine/worker/brainEvalConfig.ts");
          const digest = await importModule("/src/sine/testing/worldDigest.ts");

          function createSimulation() {
            return simulationRuntime.createSimulationState(marketRuntime.INITIAL_MARKET_RUNTIME_CONFIG, {
              ...spawner.DEFAULT_SPAWNER_CONFIG,
              initialSpawners: population,
              maxSpawners: population,
              uniquenessPopulationLimit: 1000,
            });
          }

          const syncSimulation = createSimulation();
          for (let tick = 1; tick <= advanceTicks; tick += 1) {
            simulationRuntime.advanceSimulationToTarget(syncSimulation, tick, 1);
          }

          const parallelSimulation = createSimulation();
          const pool = brainEvalPool.createBrainEvalPool({
            workerCount: brainEvalConfig.defaultBrainEvalWorkerCount(),
            timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
          });
          const startedMode = pool.currentMode?.() ?? pool.mode ?? "sync";
          for (let tick = 1; tick <= advanceTicks; tick += 1) {
            await simulationRuntime.advanceSimulationToTargetAsync(parallelSimulation, tick, 1, {
              brainEvaluationRunner: pool,
              sessionId: 1,
              runGeneration: 1,
              advanceEpoch: 1,
              batchId: tick,
            });
          }
          const endedMode = pool.currentMode?.() ?? pool.mode ?? "sync";
          const stats = pool.stats?.();
          pool.dispose?.();

          return {
            startedMode,
            endedMode,
            stats,
            sync: digest.worldDigest(syncSimulation.world),
            parallel: digest.worldDigest(parallelSimulation.world),
          };
        },
        { population: POPULATION, advanceTicks: ADVANCE_TICKS },
      );

      assert.equal(result.startedMode, "parallel");
      assert.equal(result.endedMode, "parallel");
      assert.equal(result.stats?.syncFallbackBatches, 0);
      assert.equal(result.stats?.disabledBatches, 0);
      assert.ok((result.stats?.parallelBatches ?? 0) >= ADVANCE_TICKS);
      assert.deepEqual(result.parallel, result.sync);
      console.log(`Browser brain worker parity passed at ${POPULATION} pop / ${ADVANCE_TICKS} ticks.`);
    });
  } finally {
    server.stop();
  }
}

void main();
