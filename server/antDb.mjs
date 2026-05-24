import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
mkdirSync(dataDir, { recursive: true });

export const antDb = new DatabaseSync(join(dataDir, "ant-world.sqlite"));

antDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS world_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    world_id TEXT NOT NULL,
    tick INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS birth_events (
    event_key TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    tick INTEGER NOT NULL,
    parent_id INTEGER NOT NULL,
    child_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    mutation_summary TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS death_events (
    event_key TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    tick INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    cause TEXT NOT NULL,
    killed_by INTEGER,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS batch_experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    label TEXT,
    status TEXT NOT NULL,
    requested_runs INTEGER NOT NULL,
    completed_runs INTEGER NOT NULL,
    stop_tick INTEGER NOT NULL,
    base_seed INTEGER NOT NULL,
    parameters_json TEXT NOT NULL,
    aggregate_json TEXT NOT NULL,
    summary_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS batch_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_runs INTEGER NOT NULL,
    completed_runs INTEGER NOT NULL,
    stop_tick INTEGER NOT NULL,
    base_seed INTEGER NOT NULL,
    current_run_index INTEGER NOT NULL,
    current_tick INTEGER NOT NULL,
    parameters_json TEXT NOT NULL,
    error TEXT,
    FOREIGN KEY (experiment_id) REFERENCES batch_experiments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS batch_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL,
    run_index INTEGER NOT NULL,
    seed INTEGER NOT NULL,
    stop_tick INTEGER NOT NULL,
    final_tick INTEGER NOT NULL,
    population INTEGER NOT NULL,
    food INTEGER NOT NULL,
    surviving_lineage_count INTEGER NOT NULL,
    total_lineages_created INTEGER NOT NULL,
    total_births INTEGER NOT NULL,
    total_deaths INTEGER NOT NULL,
    max_generation INTEGER NOT NULL,
    summary_json TEXT NOT NULL,
    FOREIGN KEY (experiment_id) REFERENCES batch_experiments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS batch_lineages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL,
    run_id INTEGER NOT NULL,
    run_index INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    founder_agent_id INTEGER NOT NULL,
    founding_lineage INTEGER NOT NULL,
    birth_tick INTEGER NOT NULL,
    population INTEGER NOT NULL,
    max_population INTEGER NOT NULL,
    max_generation INTEGER NOT NULL,
    total_born INTEGER NOT NULL,
    total_killed INTEGER NOT NULL,
    total_food_consumed REAL NOT NULL,
    architecture_key TEXT NOT NULL,
    architecture_json TEXT NOT NULL,
    average_traits_json TEXT NOT NULL,
    neural_weights_json TEXT NOT NULL,
    flat_weight_vector_json TEXT NOT NULL,
    flat_weight_l2_norm REAL NOT NULL,
    summary_json TEXT NOT NULL,
    FOREIGN KEY (experiment_id) REFERENCES batch_experiments(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES batch_runs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS batch_runs_experiment_idx ON batch_runs (experiment_id, run_index);
  CREATE INDEX IF NOT EXISTS batch_lineages_experiment_idx ON batch_lineages (experiment_id, run_index, lineage_id);
  CREATE INDEX IF NOT EXISTS batch_lineages_architecture_idx ON batch_lineages (architecture_key);
  CREATE INDEX IF NOT EXISTS batch_jobs_experiment_idx ON batch_jobs (experiment_id);
  CREATE INDEX IF NOT EXISTS batch_jobs_status_idx ON batch_jobs (status);
`);

export const antStatements = {
  insertSnapshot: antDb.prepare(`
    INSERT INTO world_snapshots (world_id, tick, created_at, payload)
    VALUES (?, ?, ?, ?)
  `),
  insertBirth: antDb.prepare(`
    INSERT OR IGNORE INTO birth_events (
      event_key, world_id, tick, parent_id, child_id, lineage_id, generation, mutation_summary, payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertDeath: antDb.prepare(`
    INSERT OR IGNORE INTO death_events (
      event_key, world_id, tick, agent_id, lineage_id, cause, killed_by, payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  latestSnapshot: antDb.prepare(`
    SELECT tick, created_at, payload
    FROM world_snapshots
    WHERE world_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  countRows: antDb.prepare(`
    SELECT
      (SELECT COUNT(*) FROM world_snapshots WHERE world_id = ?) AS snapshots,
      (SELECT COUNT(*) FROM birth_events WHERE world_id = ?) AS births,
      (SELECT COUNT(*) FROM death_events WHERE world_id = ?) AS deaths
  `),
  insertBatchExperiment: antDb.prepare(`
    INSERT INTO batch_experiments (
      created_at, label, status, requested_runs, completed_runs, stop_tick, base_seed,
      parameters_json, aggregate_json, summary_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertBatchRun: antDb.prepare(`
    INSERT INTO batch_runs (
      experiment_id, run_index, seed, stop_tick, final_tick, population, food,
      surviving_lineage_count, total_lineages_created, total_births, total_deaths,
      max_generation, summary_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertBatchLineage: antDb.prepare(`
    INSERT INTO batch_lineages (
      experiment_id, run_id, run_index, lineage_id, founder_agent_id, founding_lineage,
      birth_tick, population, max_population, max_generation, total_born, total_killed,
      total_food_consumed, architecture_key, architecture_json, average_traits_json,
      neural_weights_json, flat_weight_vector_json, flat_weight_l2_norm, summary_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listBatchExperiments: antDb.prepare(`
    SELECT
      id, created_at, label, status, requested_runs, completed_runs, stop_tick,
      base_seed, aggregate_json,
      (
        SELECT id
        FROM batch_jobs
        WHERE batch_jobs.experiment_id = batch_experiments.id
        ORDER BY id DESC
        LIMIT 1
      ) AS job_id
    FROM batch_experiments
    ORDER BY id DESC
    LIMIT ?
  `),
  getBatchExperiment: antDb.prepare(`
    SELECT summary_json
    FROM batch_experiments
    WHERE id = ?
  `),
  getBatchExperimentStatus: antDb.prepare(`
    SELECT id, status
    FROM batch_experiments
    WHERE id = ?
  `),
  deleteBatchExperiment: antDb.prepare(`
    DELETE FROM batch_experiments
    WHERE id = ?
  `),
  failInterruptedExperiments: antDb.prepare(`
    UPDATE batch_experiments
    SET status = 'failed'
    WHERE status IN ('queued', 'running', 'cancel_requested')
  `),
  failInterruptedJobs: antDb.prepare(`
    UPDATE batch_jobs
    SET status = 'failed', error = 'Server restarted before job completed', updated_at = ?
    WHERE status IN ('queued', 'running', 'cancel_requested')
  `),
  updateBatchExperiment: antDb.prepare(`
    UPDATE batch_experiments
    SET status = ?, completed_runs = ?, aggregate_json = ?, summary_json = ?
    WHERE id = ?
  `),
  insertBatchJob: antDb.prepare(`
    INSERT INTO batch_jobs (
      experiment_id, created_at, updated_at, status, requested_runs, completed_runs,
      stop_tick, base_seed, current_run_index, current_tick, parameters_json, error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateBatchJobProgress: antDb.prepare(`
    UPDATE batch_jobs
    SET updated_at = ?, status = ?, completed_runs = ?, current_run_index = ?, current_tick = ?, error = ?
    WHERE id = ?
  `),
  listBatchJobs: antDb.prepare(`
    SELECT
      id, experiment_id, created_at, updated_at, status, requested_runs, completed_runs,
      stop_tick, base_seed, current_run_index, current_tick, error
    FROM batch_jobs
    ORDER BY id DESC
    LIMIT ?
  `),
  getBatchJob: antDb.prepare(`
    SELECT
      id, experiment_id, created_at, updated_at, status, requested_runs, completed_runs,
      stop_tick, base_seed, current_run_index, current_tick, error
    FROM batch_jobs
    WHERE id = ?
  `),
};

export function markInterruptedBatchesFailed() {
  antStatements.failInterruptedExperiments.run();
  antStatements.failInterruptedJobs.run(new Date().toISOString());
}
