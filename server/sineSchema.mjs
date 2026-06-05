export function initializeSineSchema(db) {
  db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sine_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    spawner_config_json TEXT NOT NULL,
    run_mode TEXT NOT NULL DEFAULT 'lab',
    seed INTEGER,
    target_ticks INTEGER,
    checkpoint_interval_ticks INTEGER,
    minimum_resolved_trades INTEGER,
    completed_at TEXT,
    termination_reason TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS sine_spawner_births (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    parent_spawner_id INTEGER,
    lineage_id INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    birth_tick INTEGER NOT NULL,
    birth_time REAL NOT NULL,
    source_timestamp INTEGER,
    source_datetime TEXT,
    spawner_json TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, spawner_id)
  );

  CREATE TABLE IF NOT EXISTS sine_spawner_deaths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    death_tick INTEGER NOT NULL,
    death_time REAL NOT NULL,
    source_timestamp INTEGER,
    source_datetime TEXT,
    spawner_json TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, spawner_id)
  );

  CREATE TABLE IF NOT EXISTS sine_spawner_genome_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    time REAL NOT NULL,
    reason TEXT NOT NULL,
    genome_json TEXT NOT NULL,
    spawner_json TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, spawner_id, tick, reason)
  );

  CREATE TABLE IF NOT EXISTS sine_spawner_state_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    time REAL NOT NULL,
    state_json TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, spawner_id, tick)
  );

  CREATE TABLE IF NOT EXISTS sine_food_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    food_id INTEGER NOT NULL,
    event_kind TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    time REAL NOT NULL,
    food_json TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, food_id, event_kind)
  );

  CREATE TABLE IF NOT EXISTS sine_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    event_kind TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    time REAL NOT NULL,
    event_json TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, event_id)
  );

  CREATE TABLE IF NOT EXISTS sine_spawner_uniqueness_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    score REAL NOT NULL,
    raw_distance REAL NOT NULL,
    version TEXT NOT NULL,
    vector_version TEXT NOT NULL,
    comparison_population_size INTEGER NOT NULL,
    active_feature_count INTEGER NOT NULL,
    dropped_feature_count INTEGER NOT NULL,
    nearest_neighbor_ids_json TEXT NOT NULL,
    most_similar_features_json TEXT NOT NULL,
    most_dissimilar_features_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, spawner_id, tick, version, vector_version)
  );

  CREATE TABLE IF NOT EXISTS sine_headless_run_checkpoints (
    session_id TEXT NOT NULL,
    tick INTEGER NOT NULL,
    source_timestamp INTEGER,
    source_datetime TEXT,
    population INTEGER NOT NULL,
    eligible_agents INTEGER NOT NULL DEFAULT 0,
    trades_written INTEGER NOT NULL DEFAULT 0,
    reconstruction_snapshots_written INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY(session_id, tick),
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sine_headless_agent_eligibility (
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    eligible_tick INTEGER NOT NULL,
    resolved_trades INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY(session_id, spawner_id),
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sine_headless_reconstruction_snapshots (
    session_id TEXT NOT NULL,
    spawner_id INTEGER NOT NULL,
    lineage_id INTEGER NOT NULL,
    generation INTEGER NOT NULL,
    parent_spawner_id INTEGER,
    tick INTEGER NOT NULL,
    source_timestamp INTEGER,
    source_datetime TEXT,
    reason TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    genome_json TEXT NOT NULL,
    hidden_state_json TEXT NOT NULL,
    learned_state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(session_id, spawner_id, tick, reason),
    FOREIGN KEY (session_id) REFERENCES sine_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS sine_births_session_spawner_idx ON sine_spawner_births (session_id, spawner_id);
  CREATE INDEX IF NOT EXISTS sine_deaths_session_spawner_idx ON sine_spawner_deaths (session_id, spawner_id);
  CREATE INDEX IF NOT EXISTS sine_genomes_lookup_idx ON sine_spawner_genome_snapshots (session_id, spawner_id, tick);
  CREATE INDEX IF NOT EXISTS sine_states_lookup_idx ON sine_spawner_state_snapshots (session_id, spawner_id, tick);
    CREATE INDEX IF NOT EXISTS sine_food_lookup_idx ON sine_food_events (session_id, spawner_id, tick);
    CREATE INDEX IF NOT EXISTS sine_uniqueness_lookup_idx ON sine_spawner_uniqueness_snapshots (session_id, spawner_id, tick);
  CREATE INDEX IF NOT EXISTS sine_headless_checkpoints_session_tick_idx ON sine_headless_run_checkpoints (session_id, tick);
  CREATE INDEX IF NOT EXISTS sine_headless_eligibility_session_tick_idx ON sine_headless_agent_eligibility (session_id, eligible_tick);
  CREATE INDEX IF NOT EXISTS sine_headless_reconstruction_lookup_idx ON sine_headless_reconstruction_snapshots (session_id, spawner_id, tick);
  `);

  ensureColumn(db, "sine_sessions", "run_mode", "TEXT NOT NULL DEFAULT 'lab'");
  ensureColumn(db, "sine_sessions", "seed", "INTEGER");
  ensureColumn(db, "sine_sessions", "target_ticks", "INTEGER");
  ensureColumn(db, "sine_sessions", "checkpoint_interval_ticks", "INTEGER");
  ensureColumn(db, "sine_sessions", "minimum_resolved_trades", "INTEGER");
  ensureColumn(db, "sine_sessions", "completed_at", "TEXT");
  ensureColumn(db, "sine_sessions", "termination_reason", "TEXT");
  ensureColumn(db, "sine_sessions", "error", "TEXT");
  ensureColumn(db, "sine_spawner_births", "plasticity_profile_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "sine_spawner_births", "plasticity_learning_rate_mean", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_births", "plasticity_decay_rate", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_births", "plasticity_max_learned_delta", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_births", "source_timestamp", "INTEGER");
  ensureColumn(db, "sine_spawner_births", "source_datetime", "TEXT");
  ensureColumn(db, "sine_spawner_genome_snapshots", "plasticity_profile_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "sine_spawner_genome_snapshots", "plasticity_learning_rate_mean", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_genome_snapshots", "plasticity_decay_rate", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_genome_snapshots", "plasticity_max_learned_delta", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "learned_delta_norm", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "recent_learning_signal", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "learning_update_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "reproduction_learning_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "plasticity_learning_rate_mean", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "plasticity_decay_rate", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "plasticity_max_learned_delta", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "sine_spawner_state_snapshots", "learned_state_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "sine_spawner_state_snapshots", "plasticity_profile_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "sine_spawner_deaths", "death_cause", "TEXT");
  ensureColumn(db, "sine_spawner_deaths", "death_energy_threshold", "REAL");
  ensureColumn(db, "sine_spawner_deaths", "death_health_threshold", "REAL");
  ensureColumn(db, "sine_spawner_deaths", "source_timestamp", "INTEGER");
  ensureColumn(db, "sine_spawner_deaths", "source_datetime", "TEXT");

  db.exec(`
  CREATE INDEX IF NOT EXISTS sine_sessions_mode_updated_idx
    ON sine_sessions (run_mode, updated_at DESC);
  CREATE INDEX IF NOT EXISTS sine_sessions_updated_idx
    ON sine_sessions (updated_at DESC);
  CREATE INDEX IF NOT EXISTS sine_states_session_tick_time_idx
    ON sine_spawner_state_snapshots (session_id, tick DESC, time DESC);
  CREATE INDEX IF NOT EXISTS sine_states_learning_idx
    ON sine_spawner_state_snapshots (session_id, tick, learned_delta_norm);
  CREATE INDEX IF NOT EXISTS sine_states_learning_counts_idx
    ON sine_spawner_state_snapshots (session_id, learning_update_count, reproduction_learning_count);
`);
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

