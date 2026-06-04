import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
mkdirSync(dataDir, { recursive: true });

export const defaultSineHeadlessDbPath = process.env.SINE_HEADLESS_DB_PATH || join(dataDir, "sine-headless.sqlite");

export function openSineHeadlessDb(dbPath = defaultSineHeadlessDbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sine_headless_runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      seed INTEGER NOT NULL,
      tick INTEGER NOT NULL,
      target_ticks INTEGER,
      checkpoint_interval_ticks INTEGER,
      market_source TEXT NOT NULL,
      minimum_resolved_trades INTEGER NOT NULL,
      market_config_json TEXT NOT NULL,
      spawner_config_json TEXT NOT NULL,
      termination_reason TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS sine_headless_agents (
      run_id TEXT NOT NULL,
      spawner_id INTEGER NOT NULL,
      lineage_id INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      parent_spawner_id INTEGER,
      birth_tick INTEGER NOT NULL,
      birth_source_timestamp INTEGER,
      birth_source_datetime TEXT,
      death_tick INTEGER,
      death_source_timestamp INTEGER,
      death_source_datetime TEXT,
      eligible INTEGER NOT NULL DEFAULT 0,
      eligible_tick INTEGER,
      PRIMARY KEY (run_id, spawner_id),
      FOREIGN KEY (run_id) REFERENCES sine_headless_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sine_headless_agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      event_id INTEGER,
      event_kind TEXT NOT NULL,
      spawner_id INTEGER NOT NULL,
      lineage_id INTEGER NOT NULL,
      tick INTEGER NOT NULL,
      source_timestamp INTEGER,
      source_datetime TEXT,
      child_spawner_id INTEGER,
      parent_spawner_id INTEGER,
      event_json TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES sine_headless_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sine_headless_agent_trades (
      run_id TEXT NOT NULL,
      spawner_id INTEGER NOT NULL,
      lineage_id INTEGER NOT NULL,
      food_id INTEGER NOT NULL,
      spawn_tick INTEGER NOT NULL,
      resolve_tick INTEGER NOT NULL,
      direction TEXT NOT NULL,
      strength REAL NOT NULL,
      horizon_ticks INTEGER NOT NULL,
      entry_signal REAL NOT NULL,
      exit_signal REAL,
      entry_payoff_scale REAL,
      entry_price REAL,
      exit_price REAL,
      source_timestamp INTEGER,
      source_datetime TEXT,
      exit_source_timestamp INTEGER,
      exit_source_datetime TEXT,
      status TEXT NOT NULL,
      payoff REAL,
      food_json TEXT NOT NULL,
      PRIMARY KEY (run_id, food_id),
      FOREIGN KEY (run_id) REFERENCES sine_headless_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sine_headless_agent_snapshots (
      run_id TEXT NOT NULL,
      spawner_id INTEGER NOT NULL,
      lineage_id INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      tick INTEGER NOT NULL,
      source_timestamp INTEGER,
      source_datetime TEXT,
      reason TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      genome_json TEXT NOT NULL,
      hidden_state_json TEXT NOT NULL,
      learned_state_json TEXT NOT NULL,
      PRIMARY KEY (run_id, spawner_id, tick, reason),
      FOREIGN KEY (run_id) REFERENCES sine_headless_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sine_headless_agent_metrics (
      run_id TEXT NOT NULL,
      spawner_id INTEGER NOT NULL,
      lineage_id INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      parent_spawner_id INTEGER,
      birth_tick INTEGER NOT NULL,
      birth_source_timestamp INTEGER,
      birth_source_datetime TEXT,
      death_tick INTEGER,
      death_source_timestamp INTEGER,
      death_source_datetime TEXT,
      lifespan_ticks INTEGER,
      children INTEGER NOT NULL,
      resolved_trades INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      hit_rate REAL NOT NULL,
      cumulative_payoff REAL NOT NULL,
      average_payoff REAL NOT NULL,
      average_win REAL NOT NULL,
      average_loss REAL NOT NULL,
      payoff_std_dev REAL NOT NULL,
      long_trades INTEGER NOT NULL,
      short_trades INTEGER NOT NULL,
      long_average_payoff REAL NOT NULL,
      short_average_payoff REAL NOT NULL,
      average_horizon_ticks REAL NOT NULL,
      average_strength REAL NOT NULL,
      last_resolved_tick INTEGER,
      PRIMARY KEY (run_id, spawner_id),
      FOREIGN KEY (run_id) REFERENCES sine_headless_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sine_headless_run_checkpoints (
      run_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      source_timestamp INTEGER,
      source_datetime TEXT,
      population INTEGER NOT NULL,
      eligible_agents INTEGER NOT NULL,
      resolved_trades INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      hit_rate REAL NOT NULL,
      cumulative_payoff REAL NOT NULL,
      average_payoff REAL NOT NULL,
      trades_written INTEGER NOT NULL,
      snapshots_written INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, tick),
      FOREIGN KEY (run_id) REFERENCES sine_headless_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS sine_headless_agents_run_spawner_idx
      ON sine_headless_agents (run_id, spawner_id);
    CREATE INDEX IF NOT EXISTS sine_headless_agents_lineage_idx
      ON sine_headless_agents (run_id, lineage_id);
    CREATE INDEX IF NOT EXISTS sine_headless_events_tick_idx
      ON sine_headless_agent_events (run_id, tick);
    CREATE INDEX IF NOT EXISTS sine_headless_events_time_idx
      ON sine_headless_agent_events (run_id, source_timestamp);
    CREATE INDEX IF NOT EXISTS sine_headless_trades_spawner_tick_idx
      ON sine_headless_agent_trades (run_id, spawner_id, resolve_tick);
    CREATE INDEX IF NOT EXISTS sine_headless_trades_time_idx
      ON sine_headless_agent_trades (run_id, exit_source_timestamp);
    CREATE INDEX IF NOT EXISTS sine_headless_snapshots_spawner_tick_idx
      ON sine_headless_agent_snapshots (run_id, spawner_id, tick);
    CREATE INDEX IF NOT EXISTS sine_headless_checkpoints_run_tick_idx
      ON sine_headless_run_checkpoints (run_id, tick);
  `);
  ensureColumn(db, "sine_headless_runs", "target_ticks", "INTEGER");
  ensureColumn(db, "sine_headless_runs", "checkpoint_interval_ticks", "INTEGER");
  ensureColumn(db, "sine_headless_runs", "termination_reason", "TEXT");
  db.exec(`
    UPDATE sine_headless_runs
    SET termination_reason = 'interrupted'
    WHERE termination_reason IS NULL
      AND status = 'failed'
      AND error = 'Interrupted by server restart'
  `);
  return db;
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
