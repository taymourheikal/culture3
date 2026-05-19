import { buildBatchSummary } from "../src/sim/batch.ts";
import { db, statements } from "./db.mjs";

export function listBatchExperiments(limit) {
  return statements.listBatchExperiments.all(limit).map((row) => ({
    ...row,
    aggregate: JSON.parse(row.aggregate_json),
    aggregate_json: undefined,
  }));
}

export function getBatchExperimentSummary(id) {
  const row = statements.getBatchExperiment.get(id);
  return row ? JSON.parse(row.summary_json) : null;
}

export function getBatchExperimentStatus(id) {
  return statements.getBatchExperimentStatus.get(id) ?? null;
}

export function deleteBatchExperiment(id) {
  return statements.deleteBatchExperiment.run(id);
}

export function createQueuedBatchExperiment(options, parameters, label) {
  const now = new Date().toISOString();
  const summary = buildBatchSummary(options, parameters, []);
  const result = statements.insertBatchExperiment.run(
    now,
    label,
    "queued",
    options.runs,
    0,
    options.stopTick,
    options.seed,
    JSON.stringify(parameters),
    JSON.stringify(summary.aggregate),
    JSON.stringify(summary),
  );
  return Number(result.lastInsertRowid);
}

export function saveBatchSummary(summary, status, label) {
  let experimentId;
  transaction(() => {
    const experimentResult = statements.insertBatchExperiment.run(
      new Date().toISOString(),
      label,
      status,
      summary.options.runs,
      summary.runs.length,
      summary.options.stopTick,
      summary.options.seed,
      JSON.stringify(summary.parameters),
      JSON.stringify(summary.aggregate),
      JSON.stringify(summary),
    );
    experimentId = Number(experimentResult.lastInsertRowid);

    for (const run of summary.runs) {
      insertBatchRunRows(experimentId, run);
    }
  });
  return experimentId;
}

export function saveBatchRun(experimentId, run) {
  transaction(() => insertBatchRunRows(experimentId, run));
}

export function updateBatchExperimentSummary(experimentId, status, options, parameters, runs) {
  const summary = buildBatchSummary(options, parameters, runs);
  statements.updateBatchExperiment.run(
    status,
    runs.length,
    JSON.stringify(summary.aggregate),
    JSON.stringify(summary),
    experimentId,
  );
}

function insertBatchRunRows(experimentId, run) {
  const runResult = statements.insertBatchRun.run(
    experimentId,
    run.runIndex,
    run.seed,
    run.stopTick,
    run.finalTick,
    run.population,
    run.food,
    run.survivingLineageCount,
    run.totalLineagesCreated,
    run.totalBirths,
    run.totalDeaths,
    run.maxGeneration,
    JSON.stringify(run),
  );
  const runId = Number(runResult.lastInsertRowid);

  for (const lineage of run.survivingLineages) {
    const architecture = lineage.neuralWeights.architecture;
    statements.insertBatchLineage.run(
      experimentId,
      runId,
      run.runIndex,
      lineage.lineageId,
      lineage.founderAgentId,
      lineage.foundingLineage ? 1 : 0,
      lineage.birthTick,
      lineage.population,
      lineage.maxPopulation,
      lineage.maxGeneration,
      lineage.totalBorn,
      lineage.totalKilled,
      lineage.totalFoodConsumed,
      architectureKey(architecture),
      JSON.stringify(architecture),
      JSON.stringify(lineage.averageTraits),
      JSON.stringify(lineage.neuralWeights),
      JSON.stringify(lineage.neuralWeights.flatWeightVector),
      lineage.neuralWeights.flatWeightL2Norm,
      JSON.stringify(lineage),
    );
  }
}

function architectureKey(architecture) {
  return [
    architecture.activation,
    `h1:${architecture.hiddenCount}`,
    architecture.secondLayerEnabled ? `h2:${architecture.secondHiddenCount}` : "h2:off",
  ].join("|");
}

function transaction(callback) {
  try {
    db.exec("BEGIN");
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
