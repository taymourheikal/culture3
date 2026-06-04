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

          const objectWorkerSimulation = createSimulation();
          const objectPool = brainEvalPool.createBrainEvalPool({
            workerCount: brainEvalConfig.defaultBrainEvalWorkerCount(),
            timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
          });
          const objectStartedMode = objectPool.currentMode?.() ?? objectPool.mode ?? "sync";
          for (let tick = 1; tick <= advanceTicks; tick += 1) {
            await simulationRuntime.advanceSimulationToTargetAsync(objectWorkerSimulation, tick, 1, {
              brainEvaluationRunner: objectPool,
              sessionId: 1,
              runGeneration: 1,
              advanceEpoch: 1,
              batchId: tick,
            });
          }
          const objectEndedMode = objectPool.currentMode?.() ?? objectPool.mode ?? "sync";
          const objectStats = objectPool.stats?.();
          objectPool.dispose?.();

          const compactWorkerSimulation = createSimulation();
          const compactPool = brainEvalPool.createBrainEvalPool({
            workerCount: brainEvalConfig.defaultBrainEvalWorkerCount(),
            timeoutMs: brainEvalConfig.BRAIN_EVAL_TIMEOUT_MS,
            protocol: "compact",
          });
          const compactStartedMode = compactPool.currentMode?.() ?? compactPool.mode ?? "sync";
          for (let tick = 1; tick <= advanceTicks; tick += 1) {
            await simulationRuntime.advanceSimulationToTargetAsync(compactWorkerSimulation, tick, 1, {
              brainEvaluationRunner: compactPool,
              sessionId: 1,
              runGeneration: 1,
              advanceEpoch: 1,
              batchId: tick,
            });
          }
          const compactEndedMode = compactPool.currentMode?.() ?? compactPool.mode ?? "sync";
          const compactStats = compactPool.stats?.();
          compactPool.dispose?.();

          return {
            objectStartedMode,
            objectEndedMode,
            objectStats,
            compactStartedMode,
            compactEndedMode,
            compactStats,
            sync: digest.worldDigest(syncSimulation.world),
            objectWorker: digest.worldDigest(objectWorkerSimulation.world),
            compactWorker: digest.worldDigest(compactWorkerSimulation.world),
          };
        },
        { population: POPULATION, advanceTicks: ADVANCE_TICKS },
      );

      assert.equal(result.objectStartedMode, "parallel");
      assert.equal(result.objectEndedMode, "parallel");
      assert.equal(result.objectStats?.syncFallbackBatches, 0);
      assert.equal(result.objectStats?.disabledBatches, 0);
      assert.ok((result.objectStats?.parallelBatches ?? 0) >= ADVANCE_TICKS);
      assert.deepEqual(result.objectWorker, result.sync);
      assert.equal(result.compactStartedMode, "parallel");
      assert.equal(result.compactEndedMode, "parallel");
      assert.equal(result.compactStats?.syncFallbackBatches, 0);
      assert.equal(result.compactStats?.disabledBatches, 0);
      assert.ok((result.compactStats?.parallelBatches ?? 0) >= ADVANCE_TICKS);
      assert.deepEqual(result.compactWorker, result.sync);
      console.log(`Browser brain object and compact worker parity passed at ${POPULATION} pop / ${ADVANCE_TICKS} ticks.`);
    });
  } finally {
    server.stop();
  }
}

void main();
