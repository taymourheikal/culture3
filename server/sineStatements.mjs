export function createSineStatements(db) {
  return {
  upsertSineSession: db.prepare(`
    INSERT INTO sine_sessions (id, created_at, updated_at, status, settings_json, spawner_config_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      status = excluded.status,
      settings_json = excluded.settings_json,
      spawner_config_json = excluded.spawner_config_json
  `),
  upsertHeadlessSineSessionStart: db.prepare(`
    INSERT INTO sine_sessions (
      id,
      created_at,
      updated_at,
      status,
      settings_json,
      spawner_config_json,
      run_mode,
      seed,
      target_ticks,
      checkpoint_interval_ticks,
      minimum_resolved_trades,
      completed_at,
      termination_reason,
      error
    )
    VALUES (?, ?, ?, ?, ?, ?, 'headless', ?, ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      status = excluded.status,
      settings_json = excluded.settings_json,
      spawner_config_json = excluded.spawner_config_json,
      run_mode = 'headless',
      seed = excluded.seed,
      target_ticks = excluded.target_ticks,
      checkpoint_interval_ticks = excluded.checkpoint_interval_ticks,
      minimum_resolved_trades = excluded.minimum_resolved_trades,
      completed_at = NULL,
      termination_reason = NULL,
      error = NULL
  `),
  completeHeadlessSineSession: db.prepare(`
    UPDATE sine_sessions
    SET
      updated_at = ?,
      status = ?,
      run_mode = 'headless',
      completed_at = ?,
      termination_reason = ?,
      error = ?
    WHERE id = ?
  `),
  upsertHeadlessSineCheckpoint: db.prepare(`
    INSERT INTO sine_headless_run_checkpoints (
      session_id,
      tick,
      source_timestamp,
      source_datetime,
      population,
      eligible_agents,
      trades_written,
      reconstruction_snapshots_written,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, tick) DO UPDATE SET
      source_timestamp = excluded.source_timestamp,
      source_datetime = excluded.source_datetime,
      population = excluded.population,
      eligible_agents = excluded.eligible_agents,
      trades_written = excluded.trades_written,
      reconstruction_snapshots_written = excluded.reconstruction_snapshots_written,
      created_at = excluded.created_at
  `),
  upsertHeadlessSineEligibility: db.prepare(`
    INSERT INTO sine_headless_agent_eligibility (
      session_id,
      spawner_id,
      eligible_tick,
      resolved_trades,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, spawner_id) DO UPDATE SET
      eligible_tick = excluded.eligible_tick,
      resolved_trades = excluded.resolved_trades,
      created_at = excluded.created_at
  `),
  upsertHeadlessSineReconstructionSnapshot: db.prepare(`
    INSERT INTO sine_headless_reconstruction_snapshots (
      session_id,
      spawner_id,
      lineage_id,
      generation,
      parent_spawner_id,
      tick,
      source_timestamp,
      source_datetime,
      reason,
      schema_version,
      genome_json,
      hidden_state_json,
      learned_state_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, spawner_id, tick, reason) DO UPDATE SET
      lineage_id = excluded.lineage_id,
      generation = excluded.generation,
      parent_spawner_id = excluded.parent_spawner_id,
      source_timestamp = excluded.source_timestamp,
      source_datetime = excluded.source_datetime,
      schema_version = excluded.schema_version,
      genome_json = excluded.genome_json,
      hidden_state_json = excluded.hidden_state_json,
      learned_state_json = excluded.learned_state_json,
      created_at = excluded.created_at
  `),
    insertSineBirth: db.prepare(`
      INSERT OR IGNORE INTO sine_spawner_births (
        session_id, spawner_id, parent_spawner_id, lineage_id, generation, birth_tick, birth_time,
        source_timestamp, source_datetime, spawner_json,
        plasticity_profile_json, plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertSineDeath: db.prepare(`
      INSERT OR IGNORE INTO sine_spawner_deaths (
        session_id, spawner_id, lineage_id, generation, death_tick, death_time,
        source_timestamp, source_datetime, spawner_json,
        death_cause, death_energy_threshold, death_health_threshold
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertSineGenomeSnapshot: db.prepare(`
      INSERT OR IGNORE INTO sine_spawner_genome_snapshots (
        session_id, spawner_id, tick, time, reason, genome_json, spawner_json,
        plasticity_profile_json, plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertSineStateSnapshot: db.prepare(`
      INSERT OR IGNORE INTO sine_spawner_state_snapshots (
        session_id, spawner_id, lineage_id, generation, tick, time, state_json,
        learned_delta_norm, recent_learning_signal, learning_update_count, reproduction_learning_count,
        plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta,
        learned_state_json, plasticity_profile_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
  insertSineFoodEvent: db.prepare(`
    INSERT OR IGNORE INTO sine_food_events (
      session_id, food_id, event_kind, spawner_id, lineage_id, tick, time, food_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineEvent: db.prepare(`
    INSERT OR IGNORE INTO sine_events (
      session_id, event_id, event_kind, spawner_id, lineage_id, tick, time, event_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSineUniquenessSnapshot: db.prepare(`
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
  listSineSessions: db.prepare(`
    WITH recent_sessions AS (
      SELECT
        id,
        created_at,
        updated_at,
        status,
        settings_json,
        spawner_config_json,
        run_mode,
        seed,
        target_ticks,
        checkpoint_interval_ticks,
        minimum_resolved_trades,
        completed_at,
        termination_reason,
        error
      FROM sine_sessions
      ORDER BY updated_at DESC
      LIMIT ?
    )
    SELECT
      id,
      created_at,
      updated_at,
      status,
      settings_json,
      spawner_config_json,
      run_mode,
      seed,
      target_ticks,
      checkpoint_interval_ticks,
      minimum_resolved_trades,
      completed_at,
      termination_reason,
      error,
      (SELECT COUNT(*) FROM sine_spawner_births WHERE session_id = recent_sessions.id) AS births,
      (SELECT COUNT(*) FROM sine_spawner_deaths WHERE session_id = recent_sessions.id) AS deaths,
      (SELECT COUNT(*) FROM sine_spawner_state_snapshots WHERE session_id = recent_sessions.id) AS state_snapshots,
      (SELECT COUNT(*) FROM sine_headless_run_checkpoints WHERE session_id = recent_sessions.id) AS headless_checkpoints,
      (SELECT COUNT(*) FROM sine_headless_agent_eligibility WHERE session_id = recent_sessions.id) AS eligible_agents,
      (SELECT COUNT(*) FROM sine_headless_reconstruction_snapshots WHERE session_id = recent_sessions.id) AS reconstruction_snapshots,
      (SELECT COUNT(DISTINCT spawner_id) FROM sine_headless_reconstruction_snapshots WHERE session_id = recent_sessions.id) AS reconstructable_agents,
      MAX(
        COALESCE((SELECT MAX(tick) FROM sine_spawner_state_snapshots WHERE session_id = recent_sessions.id), 0),
        COALESCE((SELECT MAX(birth_tick) FROM sine_spawner_births WHERE session_id = recent_sessions.id), 0),
        COALESCE((SELECT MAX(death_tick) FROM sine_spawner_deaths WHERE session_id = recent_sessions.id), 0),
        COALESCE((SELECT MAX(tick) FROM sine_food_events WHERE session_id = recent_sessions.id), 0),
        COALESCE((SELECT MAX(tick) FROM sine_events WHERE session_id = recent_sessions.id), 0),
        COALESCE((SELECT MAX(tick) FROM sine_headless_run_checkpoints WHERE session_id = recent_sessions.id), 0)
      ) AS latest_tick,
      (SELECT MAX(time) FROM sine_spawner_state_snapshots WHERE session_id = recent_sessions.id) AS latest_time
    FROM recent_sessions
    ORDER BY updated_at DESC
  `),
  updateSineSessionStatus: db.prepare(`
    UPDATE sine_sessions
    SET status = ?, updated_at = ?
    WHERE id = ?
  `),
  deleteSineSession: db.prepare(`
    DELETE FROM sine_sessions
    WHERE id = ?
  `),
  getSineSession: db.prepare(`
    SELECT
      id,
      created_at,
      updated_at,
      status,
      settings_json,
      spawner_config_json,
      run_mode,
      seed,
      target_ticks,
      checkpoint_interval_ticks,
      minimum_resolved_trades,
      completed_at,
      termination_reason,
      error
    FROM sine_sessions
    WHERE id = ?
  `),
  getSineBirth: db.prepare(`
    SELECT *
    FROM sine_spawner_births
    WHERE session_id = ? AND spawner_id = ?
  `),
  getSineDeath: db.prepare(`
    SELECT *
    FROM sine_spawner_deaths
    WHERE session_id = ? AND spawner_id = ?
  `),
  getSineGenomeAtTick: db.prepare(`
    SELECT *
    FROM sine_spawner_genome_snapshots
    WHERE session_id = ? AND spawner_id = ? AND tick <= ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineLatestGenome: db.prepare(`
    SELECT *
    FROM sine_spawner_genome_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineStateAtTick: db.prepare(`
    SELECT *
    FROM sine_spawner_state_snapshots
    WHERE session_id = ? AND spawner_id = ? AND tick <= ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineLatestState: db.prepare(`
    SELECT *
    FROM sine_spawner_state_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  listSineFoodAroundTick: db.prepare(`
    SELECT *
    FROM sine_food_events
    WHERE session_id = ? AND spawner_id = ? AND tick BETWEEN ? AND ?
    ORDER BY tick DESC, id DESC
    LIMIT 40
  `),
  listSineEventsAroundTick: db.prepare(`
    SELECT *
    FROM sine_events
    WHERE session_id = ? AND spawner_id = ? AND tick BETWEEN ? AND ?
    ORDER BY tick DESC, id DESC
    LIMIT 60
  `),
  getSineUniquenessAtTick: db.prepare(`
    SELECT *
    FROM sine_spawner_uniqueness_snapshots
    WHERE session_id = ? AND spawner_id = ? AND tick <= ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  getSineLatestUniqueness: db.prepare(`
    SELECT *
    FROM sine_spawner_uniqueness_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick DESC, id DESC
    LIMIT 1
  `),
  listSinePopulationByTick: db.prepare(`
    SELECT tick, MAX(time) AS time, COUNT(*) AS population
    FROM sine_spawner_state_snapshots
    WHERE session_id = ?
    GROUP BY tick
    ORDER BY tick ASC
  `),
  listSineResolvedFoods: db.prepare(`
    SELECT tick, time, food_json
    FROM sine_food_events
    WHERE session_id = ? AND event_kind = 'resolve'
    ORDER BY tick ASC, id ASC
  `),
  listSineSpawnedFoods: db.prepare(`
    SELECT tick, time, food_json
    FROM sine_food_events
    WHERE session_id = ? AND event_kind = 'spawn'
    ORDER BY tick ASC, id ASC
  `),
  listSineBirthsForSession: db.prepare(`
    SELECT spawner_id, parent_spawner_id, lineage_id, generation, birth_tick, birth_time, source_timestamp, source_datetime
    FROM sine_spawner_births
    WHERE session_id = ?
    ORDER BY birth_tick ASC, id ASC
  `),
  countSineSpawnedFoods: db.prepare(`
    SELECT COUNT(*) AS count
    FROM sine_food_events
    WHERE session_id = ? AND event_kind = 'spawn'
  `),
  getSineSessionTickExtents: db.prepare(`
    SELECT
      COALESCE((SELECT MAX(tick) FROM sine_spawner_state_snapshots WHERE session_id = ?), 0) AS latest_state_tick,
      COALESCE((SELECT MAX(birth_tick) FROM sine_spawner_births WHERE session_id = ?), 0) AS latest_birth_tick,
      COALESCE((SELECT MAX(death_tick) FROM sine_spawner_deaths WHERE session_id = ?), 0) AS latest_death_tick,
      COALESCE((SELECT MAX(tick) FROM sine_food_events WHERE session_id = ?), 0) AS latest_food_tick
  `),
  listSineLatestSpawnerStates: db.prepare(`
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
  listSineDeathsForSession: db.prepare(`
    SELECT spawner_id, lineage_id, generation, death_tick, death_time, source_timestamp, source_datetime, death_cause, death_energy_threshold, death_health_threshold, spawner_json
    FROM sine_spawner_deaths
    WHERE session_id = ?
  `),
  listSineBirthLineages: db.prepare(`
    SELECT lineage_id, COUNT(*) AS births
    FROM sine_spawner_births
    WHERE session_id = ?
    GROUP BY lineage_id
  `),
    listSineLatestUniquenessBySpawner: db.prepare(`
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
}
