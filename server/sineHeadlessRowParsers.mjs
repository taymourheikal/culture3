import { parseJson } from "./sineHeadlessRepositoryUtils.mjs";

export function parseTradeRow(row) {
  return {
    runId: row.run_id,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    foodId: row.food_id,
    spawnTick: row.spawn_tick,
    resolveTick: row.resolve_tick,
    direction: row.direction,
    strength: row.strength,
    horizonTicks: row.horizon_ticks,
    entrySignal: row.entry_signal,
    exitSignal: row.exit_signal,
    entryPayoffScale: row.entry_payoff_scale,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    sourceTimestamp: row.source_timestamp,
    sourceDatetime: row.source_datetime,
    exitSourceTimestamp: row.exit_source_timestamp,
    exitSourceDatetime: row.exit_source_datetime,
    status: row.status,
    payoff: row.payoff,
    food: parseJson(row.food_json, null),
  };
}

export function parseAgentMetricsRow(row) {
  return {
    runId: row.run_id,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    generation: row.generation,
    parentSpawnerId: row.parent_spawner_id,
    birthTick: row.birth_tick,
    birthSourceTimestamp: row.birth_source_timestamp,
    birthSourceDatetime: row.birth_source_datetime,
    deathTick: row.death_tick,
    deathSourceTimestamp: row.death_source_timestamp,
    deathSourceDatetime: row.death_source_datetime,
    lifespanTicks: row.lifespan_ticks,
    children: row.children,
    resolvedTrades: row.resolved_trades,
    wins: row.wins,
    losses: row.losses,
    hitRate: row.hit_rate,
    cumulativePayoff: row.cumulative_payoff,
    averagePayoff: row.average_payoff,
    averageWin: row.average_win,
    averageLoss: row.average_loss,
    payoffStdDev: row.payoff_std_dev,
    longTrades: row.long_trades,
    shortTrades: row.short_trades,
    longAveragePayoff: row.long_average_payoff,
    shortAveragePayoff: row.short_average_payoff,
    averageHorizonTicks: row.average_horizon_ticks,
    averageStrength: row.average_strength,
    lastResolvedTick: row.last_resolved_tick,
    snapshotCount: row.snapshot_count ?? 0,
  };
}

export function parseAgentEventRow(row) {
  return {
    id: row.id,
    runId: row.run_id,
    eventId: row.event_id,
    kind: row.event_kind,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    tick: row.tick,
    sourceTimestamp: row.source_timestamp,
    sourceDatetime: row.source_datetime,
    childSpawnerId: row.child_spawner_id,
    parentSpawnerId: row.parent_spawner_id,
    event: parseJson(row.event_json, null),
  };
}

export function parseSnapshotRow(row) {
  return {
    runId: row.run_id,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    generation: row.generation,
    tick: row.tick,
    sourceTimestamp: row.source_timestamp,
    sourceDatetime: row.source_datetime,
    reason: row.reason,
    schemaVersion: row.schema_version,
    snapshot: parseJson(row.snapshot_json, null),
  };
}

export function parseLineageRow(row) {
  return {
    lineageId: row.lineage_id,
    totalAgents: row.total_agents,
    aliveAgents: row.alive_agents,
    eligibleAgents: row.eligible_agents,
    aliveEligibleAgents: row.alive_eligible_agents,
    maxGeneration: row.max_generation,
    children: row.children,
    resolvedTrades: row.resolved_trades,
    wins: row.wins,
    losses: row.losses,
    hitRate: row.hit_rate,
    cumulativePayoff: row.cumulative_payoff,
    averagePayoff: row.average_payoff,
    bestSpawnerId: row.best_spawner_id,
    bestAveragePayoff: row.best_average_payoff,
    bestCumulativePayoff: row.best_cumulative_payoff,
    bestHitRate: row.best_hit_rate,
    bestResolvedTrades: row.best_resolved_trades,
  };
}

export function parseTradeAggregateRow(row) {
  return {
    bucket: row.bucket ?? row.direction,
    direction: row.direction,
    trades: row.trades,
    wins: row.wins,
    losses: row.losses,
    hitRate: row.trades > 0 ? row.wins / row.trades : 0,
    averagePayoff: row.average_payoff ?? 0,
    cumulativePayoff: row.cumulative_payoff ?? 0,
  };
}

export function parseCheckpointRow(row) {
  return {
    runId: row.run_id,
    tick: row.tick,
    sourceTimestamp: row.source_timestamp,
    sourceDatetime: row.source_datetime,
    population: row.population,
    eligibleAgents: row.eligible_agents,
    resolvedTrades: row.resolved_trades,
    wins: row.wins,
    losses: row.losses,
    hitRate: row.hit_rate,
    cumulativePayoff: row.cumulative_payoff,
    averagePayoff: row.average_payoff,
    tradesWritten: row.trades_written,
    snapshotsWritten: row.snapshots_written,
    createdAt: row.created_at,
  };
}
