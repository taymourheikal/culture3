export function initializeSineSeedBankSchema(db) {
  db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS seed_banks (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seed_bank_entries (
    id TEXT PRIMARY KEY,
    bank_id TEXT NOT NULL,
    source_run_id TEXT NOT NULL,
    source_spawner_id INTEGER NOT NULL,
    source_lineage_id INTEGER NOT NULL,
    source_generation INTEGER NOT NULL,
    source_parent_spawner_id INTEGER,
    source_birth_tick INTEGER,
    source_death_tick INTEGER,
    source_lifespan_ticks INTEGER,
    source_reconstruction_snapshot_count INTEGER NOT NULL,
    admission_metrics_json TEXT NOT NULL,
    admission_filters_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (bank_id) REFERENCES seed_banks(id) ON DELETE CASCADE,
    UNIQUE(bank_id, source_run_id, source_spawner_id)
  );

  CREATE TABLE IF NOT EXISTS seed_bank_entry_snapshots (
    entry_id TEXT NOT NULL,
    source_snapshot_tick INTEGER NOT NULL,
    source_snapshot_reason TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    genome_json TEXT NOT NULL,
    hidden_state_json TEXT NOT NULL,
    learned_state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(entry_id, source_snapshot_tick, source_snapshot_reason),
    FOREIGN KEY (entry_id) REFERENCES seed_bank_entries(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS seed_bank_entries_bank_created_idx
    ON seed_bank_entries (bank_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS seed_bank_entries_source_idx
    ON seed_bank_entries (source_run_id, source_spawner_id);
  CREATE INDEX IF NOT EXISTS seed_bank_entry_snapshots_entry_tick_idx
    ON seed_bank_entry_snapshots (entry_id, source_snapshot_tick);
  `);
}
