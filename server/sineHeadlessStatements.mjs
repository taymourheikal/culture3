export function createSineHeadlessStatements(db) {
  return {
    upsertRun: db.prepare(`
      INSERT INTO sine_headless_runs (
        id, created_at, completed_at, status, seed, tick,
        target_ticks, checkpoint_interval_ticks, market_source,
        minimum_resolved_trades, market_config_json, spawner_config_json,
        termination_reason, error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        completed_at = excluded.completed_at,
        status = excluded.status,
        seed = excluded.seed,
        tick = excluded.tick,
        target_ticks = excluded.target_ticks,
        checkpoint_interval_ticks = excluded.checkpoint_interval_ticks,
        market_source = excluded.market_source,
        minimum_resolved_trades = excluded.minimum_resolved_trades,
        market_config_json = excluded.market_config_json,
        spawner_config_json = excluded.spawner_config_json,
        termination_reason = excluded.termination_reason,
        error = excluded.error
    `),
    completeRun: db.prepare(`
      UPDATE sine_headless_runs
      SET completed_at = ?, status = ?, tick = ?, termination_reason = ?, error = ?
      WHERE id = ?
    `),
    upsertCheckpoint: db.prepare(`
      INSERT INTO sine_headless_run_checkpoints (
        run_id, tick, source_timestamp, source_datetime, population,
        eligible_agents, resolved_trades, wins, losses, hit_rate,
        cumulative_payoff, average_payoff, trades_written, snapshots_written,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, tick) DO UPDATE SET
        source_timestamp = excluded.source_timestamp,
        source_datetime = excluded.source_datetime,
        population = excluded.population,
        eligible_agents = excluded.eligible_agents,
        resolved_trades = excluded.resolved_trades,
        wins = excluded.wins,
        losses = excluded.losses,
        hit_rate = excluded.hit_rate,
        cumulative_payoff = excluded.cumulative_payoff,
        average_payoff = excluded.average_payoff,
        trades_written = excluded.trades_written,
        snapshots_written = excluded.snapshots_written,
        created_at = excluded.created_at
    `),
    updateRunTick: db.prepare(`
      UPDATE sine_headless_runs
      SET tick = MAX(tick, ?)
      WHERE id = ? AND status = 'running'
    `),
    upsertAgent: db.prepare(`
      INSERT INTO sine_headless_agents (
        run_id, spawner_id, lineage_id, generation, parent_spawner_id, birth_tick,
        birth_source_timestamp, birth_source_datetime, eligible
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, spawner_id) DO UPDATE SET
        lineage_id = excluded.lineage_id,
        generation = excluded.generation,
        parent_spawner_id = excluded.parent_spawner_id,
        birth_tick = excluded.birth_tick,
        birth_source_timestamp = excluded.birth_source_timestamp,
        birth_source_datetime = excluded.birth_source_datetime,
        eligible = CASE WHEN sine_headless_agents.eligible = 1 THEN 1 ELSE excluded.eligible END
    `),
    markAgentEligible: db.prepare(`
      UPDATE sine_headless_agents
      SET eligible = ?, eligible_tick = ?
      WHERE run_id = ? AND spawner_id = ?
    `),
    markAgentDead: db.prepare(`
      UPDATE sine_headless_agents
      SET death_tick = ?, death_source_timestamp = ?, death_source_datetime = ?
      WHERE run_id = ? AND spawner_id = ?
    `),
    insertEvent: db.prepare(`
      INSERT INTO sine_headless_agent_events (
        run_id, event_id, event_kind, spawner_id, lineage_id, tick,
        source_timestamp, source_datetime, child_spawner_id, parent_spawner_id, event_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    upsertTrade: db.prepare(`
      INSERT INTO sine_headless_agent_trades (
        run_id, spawner_id, lineage_id, food_id, spawn_tick, resolve_tick, direction,
        strength, horizon_ticks, entry_signal, exit_signal, entry_payoff_scale,
        entry_price, exit_price, source_timestamp, source_datetime, exit_source_timestamp,
        exit_source_datetime, status, payoff, food_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, food_id) DO UPDATE SET
        spawner_id = excluded.spawner_id,
        lineage_id = excluded.lineage_id,
        resolve_tick = excluded.resolve_tick,
        exit_signal = excluded.exit_signal,
        exit_price = excluded.exit_price,
        exit_source_timestamp = excluded.exit_source_timestamp,
        exit_source_datetime = excluded.exit_source_datetime,
        status = excluded.status,
        payoff = excluded.payoff,
        food_json = excluded.food_json
    `),
    upsertSnapshot: db.prepare(`
      INSERT INTO sine_headless_agent_snapshots (
        run_id, spawner_id, lineage_id, generation, tick, source_timestamp,
        source_datetime, reason, schema_version, snapshot_json, genome_json,
        hidden_state_json, learned_state_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, spawner_id, tick, reason) DO UPDATE SET
        lineage_id = excluded.lineage_id,
        generation = excluded.generation,
        source_timestamp = excluded.source_timestamp,
        source_datetime = excluded.source_datetime,
        schema_version = excluded.schema_version,
        snapshot_json = excluded.snapshot_json,
        genome_json = excluded.genome_json,
        hidden_state_json = excluded.hidden_state_json,
        learned_state_json = excluded.learned_state_json
    `),
    upsertMetrics: db.prepare(`
      INSERT INTO sine_headless_agent_metrics (
        run_id, spawner_id, lineage_id, generation, parent_spawner_id, birth_tick,
        birth_source_timestamp, birth_source_datetime, death_tick, death_source_timestamp,
        death_source_datetime, lifespan_ticks, children, resolved_trades, wins, losses,
        hit_rate, cumulative_payoff, average_payoff, average_win, average_loss,
        payoff_std_dev, long_trades, short_trades, long_average_payoff,
        short_average_payoff, average_horizon_ticks, average_strength, last_resolved_tick
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, spawner_id) DO UPDATE SET
        lineage_id = excluded.lineage_id,
        generation = excluded.generation,
        parent_spawner_id = excluded.parent_spawner_id,
        birth_tick = excluded.birth_tick,
        death_tick = excluded.death_tick,
        death_source_timestamp = excluded.death_source_timestamp,
        death_source_datetime = excluded.death_source_datetime,
        lifespan_ticks = excluded.lifespan_ticks,
        children = excluded.children,
        resolved_trades = excluded.resolved_trades,
        wins = excluded.wins,
        losses = excluded.losses,
        hit_rate = excluded.hit_rate,
        cumulative_payoff = excluded.cumulative_payoff,
        average_payoff = excluded.average_payoff,
        average_win = excluded.average_win,
        average_loss = excluded.average_loss,
        payoff_std_dev = excluded.payoff_std_dev,
        long_trades = excluded.long_trades,
        short_trades = excluded.short_trades,
        long_average_payoff = excluded.long_average_payoff,
        short_average_payoff = excluded.short_average_payoff,
        average_horizon_ticks = excluded.average_horizon_ticks,
        average_strength = excluded.average_strength,
        last_resolved_tick = excluded.last_resolved_tick
    `),
    countRuns: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_runs WHERE id = ?"),
    countAgents: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_agents WHERE run_id = ?"),
    countEvents: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_events WHERE run_id = ?"),
    countTrades: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_trades WHERE run_id = ?"),
    countSnapshots: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_snapshots WHERE run_id = ?"),
    countMetrics: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_metrics WHERE run_id = ?"),
    countCheckpoints: db.prepare("SELECT COUNT(*) AS count FROM sine_headless_run_checkpoints WHERE run_id = ?"),
    listRunCheckpoints: db.prepare(`
      SELECT *
      FROM sine_headless_run_checkpoints
      WHERE run_id = ?
      ORDER BY tick
    `),
    listAgentTrades: db.prepare(`
      SELECT *
      FROM sine_headless_agent_trades
      WHERE run_id = ? AND spawner_id = ?
      ORDER BY spawn_tick, food_id
    `),
    listAgentEvents: db.prepare(`
      SELECT *
      FROM sine_headless_agent_events
      WHERE run_id = ? AND spawner_id = ?
      ORDER BY tick, id
    `),
    listAgentSnapshots: db.prepare(`
      SELECT *
      FROM sine_headless_agent_snapshots
      WHERE run_id = ? AND spawner_id = ?
      ORDER BY tick, reason
    `),
    getAgentMetrics: db.prepare("SELECT * FROM sine_headless_agent_metrics WHERE run_id = ? AND spawner_id = ?"),
    getRun: db.prepare("SELECT * FROM sine_headless_runs WHERE id = ?"),
    getLatestRun: db.prepare(`
      SELECT *
      FROM sine_headless_runs
      ORDER BY COALESCE(completed_at, created_at) DESC, created_at DESC
      LIMIT 1
    `),
    deleteRun: db.prepare("DELETE FROM sine_headless_runs WHERE id = ?"),
  };
}
