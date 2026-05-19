import { parentPort, workerData } from "node:worker_threads";
import {
  advanceBatchSimulation,
  createBatchSimulation,
  summarizeBatchSimulation,
} from "../src/sim/batch.ts";

if (!parentPort) {
  throw new Error("Batch worker must run inside a worker thread");
}

try {
  const { runIndex, seed, stopTick, parameters } = workerData;
  const simulation = createBatchSimulation(runIndex, seed, stopTick, parameters);
  advanceBatchSimulation(simulation, stopTick);
  parentPort.postMessage({
    type: "complete",
    run: summarizeBatchSimulation(simulation),
  });
} catch (error) {
  parentPort.postMessage({
    type: "error",
    error: error instanceof Error ? error.message : "Unknown worker failure",
  });
}
