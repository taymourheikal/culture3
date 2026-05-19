import { Worker } from "node:worker_threads";
import { statements } from "./db.mjs";
import {
  createQueuedBatchExperiment,
  saveBatchRun,
  updateBatchExperimentSummary,
} from "./batchRepository.mjs";

const BATCH_WORKER_COUNT = 6;
const activeBatchJobs = new Map();

export function listBatchJobs(limit) {
  return statements.listBatchJobs.all(limit);
}

export function getBatchJob(id) {
  return statements.getBatchJob.get(id) ?? null;
}

export function hasActiveBatchJob() {
  return activeBatchJobs.size > 0;
}

export function createServerBatchJob(options, parameters, label) {
  const now = new Date().toISOString();
  const experimentId = createQueuedBatchExperiment(options, parameters, label);
  const jobResult = statements.insertBatchJob.run(
    experimentId,
    now,
    now,
    "queued",
    options.runs,
    0,
    options.stopTick,
    options.seed,
    0,
    0,
    JSON.stringify(parameters),
    null,
  );
  const jobId = Number(jobResult.lastInsertRowid);

  activeBatchJobs.set(jobId, {
    jobId,
    experimentId,
    options,
    parameters,
    runs: [],
    workers: new Map(),
    cancelRequested: false,
    currentRunIndex: 0,
    currentTick: 0,
  });

  return { jobId, experimentId };
}

export function requestBatchJobCancel(jobId) {
  const job = getBatchJob(jobId);
  if (!job) return null;

  const active = activeBatchJobs.get(jobId);
  if (active) {
    active.cancelRequested = true;
    terminateActiveWorkers(active);
  }
  statements.updateBatchJobProgress.run(
    new Date().toISOString(),
    isTerminalStatus(job.status) ? job.status : "cancel_requested",
    active ? active.runs.length : job.completed_runs,
    active ? active.currentRunIndex : job.current_run_index,
    active ? active.currentTick : job.current_tick,
    job.error ?? null,
    jobId,
  );
  return job;
}

export function hasActiveJobForExperiment(experimentId) {
  for (const job of activeBatchJobs.values()) {
    if (job.experimentId === experimentId) return true;
  }
  return false;
}

export function isActiveStatus(status) {
  return status === "queued" || status === "running" || status === "cancel_requested";
}

export async function runServerBatchJob(jobId) {
  const job = activeBatchJobs.get(jobId);
  if (!job) return;

  try {
    updateJob(job, "running", 0, 0, 0, null);
    updateExperiment(job, "running");

    let nextRunIndex = 0;
    const activeTasks = new Set();
    const launchWorkers = () => {
      while (!job.cancelRequested && nextRunIndex < job.options.runs && activeTasks.size < BATCH_WORKER_COUNT) {
        const runIndex = nextRunIndex;
        nextRunIndex += 1;
        let task;
        task = runBatchWorker(job, runIndex).then((runSummary) => ({ runSummary, task }));
        activeTasks.add(task);
        updateJob(job, "running", job.runs.length, runIndex, 0, null);
      }
    };

    launchWorkers();
    while (!job.cancelRequested && activeTasks.size > 0) {
      const result = await Promise.race(activeTasks);
      activeTasks.delete(result.task);
      if (result.runSummary) {
        job.runs.push(result.runSummary);
        job.runs.sort((left, right) => left.runIndex - right.runIndex);
        saveBatchRun(job.experimentId, result.runSummary);
        updateJob(job, "running", job.runs.length, result.runSummary.runIndex, result.runSummary.finalTick, null);
        updateExperiment(job, "running");
      }
      launchWorkers();
    }

    if (job.cancelRequested) {
      terminateActiveWorkers(job);
      await Promise.allSettled(activeTasks);
    }

    const status = job.cancelRequested ? "cancelled" : "complete";
    updateJob(job, status, job.runs.length, job.currentRunIndex, job.currentTick, null);
    updateExperiment(job, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch job failure";
    job.cancelRequested = true;
    terminateActiveWorkers(job);
    updateJob(job, "failed", job.runs.length, job.currentRunIndex, job.currentTick, message);
    updateExperiment(job, "failed");
  } finally {
    activeBatchJobs.delete(jobId);
  }
}

function updateJob(job, status, completedRuns, currentRunIndex, currentTick, error) {
  job.currentRunIndex = currentRunIndex;
  job.currentTick = currentTick;
  statements.updateBatchJobProgress.run(
    new Date().toISOString(),
    status,
    completedRuns,
    currentRunIndex,
    currentTick,
    error,
    job.jobId,
  );
}

function runBatchWorker(job, runIndex) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./batchWorker.mjs", import.meta.url), {
      workerData: {
        runIndex,
        seed: job.options.seed + runIndex,
        stopTick: job.options.stopTick,
        parameters: job.parameters,
      },
    });
    let settled = false;
    job.workers.set(runIndex, worker);

    worker.on("message", (message) => {
      if (message?.type === "complete") {
        settled = true;
        resolve(message.run);
      } else if (message?.type === "error") {
        settled = true;
        reject(new Error(message.error ?? `Worker failed for run ${runIndex}`));
      }
    });

    worker.on("error", (error) => {
      if (settled || job.cancelRequested) return;
      settled = true;
      reject(error);
    });

    worker.on("exit", (code) => {
      job.workers.delete(runIndex);
      if (settled) return;
      settled = true;
      if (job.cancelRequested) {
        resolve(null);
      } else if (code === 0) {
        reject(new Error(`Worker exited before returning run ${runIndex}`));
      } else {
        reject(new Error(`Worker exited with code ${code} for run ${runIndex}`));
      }
    });
  });
}

function terminateActiveWorkers(job) {
  for (const worker of job.workers.values()) {
    void worker.terminate();
  }
}

function updateExperiment(job, status) {
  updateBatchExperimentSummary(job.experimentId, status, job.options, job.parameters, job.runs);
}

function isTerminalStatus(status) {
  return status === "complete" || status === "cancelled" || status === "failed";
}
