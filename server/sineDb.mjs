import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
mkdirSync(dataDir, { recursive: true });

export const sineDb = new DatabaseSync(join(dataDir, "toy-market.sqlite"));

sineDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sine_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    spawner_config_json TEXT NOT NULL
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

  CREATE INDEX IF NOT EXISTS sine_births_session_spawner_idx ON sine_spawner_births (session_id, spawner_id);
  CREATE INDEX IF NOT EXISTS sine_deaths_session_spawner_idx ON sine_spawner_deaths (session_id, spawner_id);
  CREATE INDEX IF NOT EXISTS sine_genomes_lookup_idx ON sine_spawner_genome_snapshots (session_id, spawner_id, tick);
  CREATE INDEX IF NOT EXISTS sine_states_lookup_idx ON sine_spawner_state_snapshots (session_id, spawner_id, tick);
  CREATE INDEX IF NOT EXISTS sine_food_lookup_idx ON sine_food_events (session_id, spawner_id, tick);
  CREATE INDEX IF NOT EXISTS sine_uniqueness_lookup_idx ON sine_spawner_uniqueness_snapshots (session_id, spawner_id, tick);
`);

export const sineStatements = {
  upsertSineSession: sineDb.prepare(`
    INSERT INTO sine_sessions (id, created_at, updated_at, status, settings_json, spawner_config_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      status = excluded.status,
      settings_json = excluded.settings_json,
      spawner_config_json = excluded.spawner_config_json
  `),
  insertSineBirth: sineDb.prepare(`
    INSERT OR IGNORE INTO sine_spawner_births (
      session_id, spawner_id, parent_spawner_id, lineage_id, generation, birth_tick, birth_time, spawner_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineDeath: sineDb.prepare(`
    INSERT OR IGNORE INTO sine_spawner_deaths (
      session_id, spawner_id, lineage_id, generation, death_tick, death_time, spawner_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineGenomeSnapshot: sineDb.prepare(`
    INSERT OR IGNORE INTO sine_spawner_genome_snapshots (
      session_id, spawner_id, tick, time, reason, genome_json, spawner_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineStateSnapshot: sineDb.prepare(`
    INSERT OR IGNORE INTO sine_spawner_state_snapshots (
      session_id, spawner_id, lineage_id, generation, tick, time, state_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineFoodEvent: sineDb.prepare(`
    INSERT OR IGNORE INTO sine_food_events (
      session_id, food_id, event_kind, spawner_id, lineage_id, tick, time, food_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineEvent: sineDb.prepare(`
    INSERT OR IGNORE INTO sine_events (
      session_id, event_id, event_kind, spawner_id, lineage_id, tick, time, event_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineUniquenessSnapshot: sineDb.prepare(`
    INSERT INTO sine_spawner_uniqueness_snapshots (
      session_id, spawner_id, tick, score, raw_distance, version, vector_version,
      comparison_population_size, active_feature_count, dropped_feature_count,
      nearest_neighbor_ids_json, most_similar_features_json, most_dissimilar_features_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, spawner_id, tick, version, vector_version) DO UPDATE SET
      score = excluded.score,
      raw_distance = excluded.raw_distance,
      comparison_population_size = excluded.comparison_population_size,
      active_feature_count = excluded.active_feature_count,
      dropped_feature_count = excluded.dropped_feature_count,
      nearest_neighbor_ids_json = CASE
        WHEN excluded.nearest_neighbor_ids_json <> '[]'
          OR excluded.most_similar_features_json <> '[]'
          OR excluded.most_dissimilar_features_json <> '[]'
          OR sine_spawner_uniqueness_snapshots.nearest_neighbor_ids_json = '[]'
        THEN excluded.nearest_neighbor_ids_json
        ELSE sine_spawner_uniqueness_snapshots.nearest_neighbor_ids_json
      END,
      most_similar_features_json = CASE
        WHEN excluded.nearest_neighbor_ids_json <> '[]'
          OR excluded.most_similar_features_json <> '[]'
          OR excluded.most_dissimilar_features_json <> '[]'
          OR sine_spawner_uniqueness_snapshots.most_similar_features_json = '[]'
        THEN excluded.most_similar_features_json
        ELSE sine_spawner_uniqueness_snapshots.most_similar_features_json
      END,
      most_dissimilar_features_json = CASE
        WHEN excluded.nearest_neighbor_ids_json <> '[]'
          OR excluded.most_similar_features_json <> '[]'
          OR excluded.most_dissimilar_features_json <> '[]'
          OR sine_spawner_uniqueness_snapshots.most_dissimilar_features_json = '[]'
        THEN excluded.most_dissimilar_features_json
        ELSE sine_spawner_uniqueness_snapshots.most_dissimilar_features_json
      END,
      created_at = CASE
        WHEN excluded.nearest_neighbor_ids_json <> '[]'
          OR excluded.most_similar_features_json <> '[]'
          OR excluded.most_dissimilar_features_json <> '[]'
        THEN excluded.created_at
        ELSE sine_spawner_uniqueness_snapshots.created_at
      END
  `),
  listSineSessions: sineDb.prepare(`
    SELECT
      id, created_at, updated_at, status, settings_json, spawner_config_json,
      (SELECT COUNT(*) FROM sine_spawner_births WHERE session_id = sine_sessions.id) AS births,
      (SELECT COUNT(*) FROM sine_spawner_deaths WHERE session_id = sine_sessions.id) AS deaths,
      (SELECT COUNT(*) FROM sine_spawner_state_snapshots WHERE session_id = sine_sessions.id) AS state_snapshots,
      (SELECT MAX(tick) FROM sine_spawner_state_snapshots WHERE session_id = sine_sessions.id) AS latest_tick,
      (SELECT MAX(time) FROM sine_spawner_state_snapshots WHERE session_id = sine_sessions.id) AS latest_time
    FROM sine_sessions
    ORDER BY updated_at DESC
    LIMIT ?
  `),
  updateSineSessionStatus: sineDb.prepare(`
    UPDATE sine_sessions
    SET status = ?, updated_at = ?
    WHERE id = ?
  `),
  deleteSineSession: sineDb.prepare(`
    DELETE FROM sine_sessions
    WHERE id = ?
  `),
  getSineSession: sineDb.prepare(`
    SELECT id, created_at, updated_at, status, settings_json, spawner_config_json
    FROM sine_sessions
    WHERE id = ?
  `),
  getSineBirth: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_births
    WHERE session_id = ? AND spawner_id = ?
  `),
  getSineDeath: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_deaths
    WHERE session_id = ? AND spawner_id = ?
  `),
  getSineGenomeAtTick: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_genome_snapshots
    WHERE session_id = ? AND spawner_id = ? AND tick <= ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineLatestGenome: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_genome_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineStateAtTick: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_state_snapshots
    WHERE session_id = ? AND spawner_id = ? AND tick <= ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineLatestState: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_state_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  listSineFoodAroundTick: sineDb.prepare(`
    SELECT *
    FROM sine_food_events
    WHERE session_id = ? AND spawner_id = ? AND tick BETWEEN ? AND ?
    ORDER BY tick DESC, id DESC
    LIMIT 40
  `),
  listSineEventsAroundTick: sineDb.prepare(`
    SELECT *
    FROM sine_events
    WHERE session_id = ? AND spawner_id = ? AND tick BETWEEN ? AND ?
    ORDER BY tick DESC, id DESC
    LIMIT 60
  `),
  getSineUniquenessAtTick: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_uniqueness_snapshots
    WHERE session_id = ? AND spawner_id = ? AND tick <= ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineLatestUniqueness: sineDb.prepare(`
    SELECT *
    FROM sine_spawner_uniqueness_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  listSinePopulationByTick: sineDb.prepare(`
    SELECT tick, MAX(time) AS time, COUNT(*) AS population
    FROM sine_spawner_state_snapshots
    WHERE session_id = ?
    GROUP BY tick
    ORDER BY tick ASC
  `),
  listSineResolvedFoods: sineDb.prepare(`
    SELECT tick, time, food_json
    FROM sine_food_events
    WHERE session_id = ? AND event_kind = 'resolve'
    ORDER BY tick ASC, id ASC
  `),
  countSineSpawnedFoods: sineDb.prepare(`
    SELECT COUNT(*) AS count
    FROM sine_food_events
    WHERE session_id = ? AND event_kind = 'spawn'
  `),
  listSineLatestSpawnerStates: sineDb.prepare(`
    SELECT state.*
    FROM sine_spawner_state_snapshots state
    JOIN (
      SELECT spawner_id, MAX(tick) AS tick
      FROM sine_spawner_state_snapshots
      WHERE session_id = ?
      GROUP BY spawner_id
    ) latest
      ON latest.spawner_id = state.spawner_id
     AND latest.tick = state.tick
    WHERE state.session_id = ?
    ORDER BY state.tick DESC, state.spawner_id ASC
  `),
  listSineDeathsForSession: sineDb.prepare(`
    SELECT spawner_id, lineage_id, generation, death_tick, death_time
    FROM sine_spawner_deaths
    WHERE session_id = ?
  `),
  listSineBirthLineages: sineDb.prepare(`
    SELECT lineage_id, COUNT(*) AS births
    FROM sine_spawner_births
    WHERE session_id = ?
    GROUP BY lineage_id
  `),
  listSineLatestUniquenessBySpawner: sineDb.prepare(`
    SELECT uniqueness.*
    FROM sine_spawner_uniqueness_snapshots uniqueness
    JOIN (
      SELECT spawner_id, MAX(tick) AS tick
      FROM sine_spawner_uniqueness_snapshots
      WHERE session_id = ?
      GROUP BY spawner_id
    ) latest
      ON latest.spawner_id = uniqueness.spawner_id
     AND latest.tick = uniqueness.tick
    WHERE uniqueness.session_id = ?
    ORDER BY uniqueness.score DESC
  `),
};
