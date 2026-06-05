export function deriveAgentStatsRows(facts) {
  const tradesBySpawner = groupBy(facts.resolvedTrades, (trade) => trade.spawnerId);
  return facts.births.map((birth) =>
    derivedStatsRowForBirth(
      birth,
      facts.deathBySpawnerId.get(birth.spawner_id) ?? null,
      tradesBySpawner.get(birth.spawner_id) ?? [],
      facts.childrenByParentSpawnerId.get(birth.spawner_id) ?? 0,
      facts.snapshotCounts.get(birth.spawner_id) ?? 0,
    ),
  );
}

export function toAgentStatsResponse(row) {
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

export function deriveLineageStatsRows(agentStatsRows) {
  const byLineage = new Map();
  for (const metric of agentStatsRows.map(toAgentStatsResponse)) {
    const row = byLineage.get(metric.lineageId) ?? {
      lineageId: metric.lineageId,
      totalAgents: 0,
      aliveAgents: 0,
      eligibleAgents: 0,
      aliveEligibleAgents: 0,
      maxGeneration: 0,
      children: 0,
      resolvedTrades: 0,
      wins: 0,
      losses: 0,
      cumulativePayoff: 0,
      averagePayoff: 0,
      hitRate: 0,
      bestSpawnerId: null,
      bestAveragePayoff: 0,
      bestCumulativePayoff: 0,
      bestHitRate: 0,
      bestResolvedTrades: 0,
    };
    row.totalAgents += 1;
    row.aliveAgents += metric.deathTick === null ? 1 : 0;
    row.eligibleAgents += metric.snapshotCount > 0 ? 1 : 0;
    row.aliveEligibleAgents += metric.snapshotCount > 0 && metric.deathTick === null ? 1 : 0;
    row.maxGeneration = Math.max(row.maxGeneration, metric.generation);
    row.children += metric.children;
    row.resolvedTrades += metric.resolvedTrades;
    row.wins += metric.wins;
    row.losses += metric.losses;
    row.cumulativePayoff += metric.cumulativePayoff;
    if (
      metric.resolvedTrades > row.bestResolvedTrades ||
      (metric.resolvedTrades === row.bestResolvedTrades && metric.averagePayoff > row.bestAveragePayoff)
    ) {
      row.bestSpawnerId = metric.spawnerId;
      row.bestAveragePayoff = metric.averagePayoff;
      row.bestCumulativePayoff = metric.cumulativePayoff;
      row.bestHitRate = metric.hitRate;
      row.bestResolvedTrades = metric.resolvedTrades;
    }
    byLineage.set(metric.lineageId, row);
  }
  return [...byLineage.values()].map((row) => ({
    ...row,
    hitRate: row.resolvedTrades > 0 ? row.wins / row.resolvedTrades : 0,
    averagePayoff: row.resolvedTrades > 0 ? row.cumulativePayoff / row.resolvedTrades : 0,
  }));
}

function derivedStatsRowForBirth(birth, death, trades, children, snapshotCount) {
  const payoffs = trades.map((trade) => trade.payoff ?? 0);
  const cumulativePayoff = payoffs.reduce((sum, payoff) => sum + payoff, 0);
  const resolvedTrades = trades.length;
  const wins = trades.filter((trade) => (trade.payoff ?? 0) > 0).length;
  const losses = Math.max(0, resolvedTrades - wins);
  const mean = resolvedTrades > 0 ? cumulativePayoff / resolvedTrades : 0;
  const variance = resolvedTrades > 0 ? Math.max(0, payoffs.reduce((sum, payoff) => sum + (payoff - mean) ** 2, 0) / resolvedTrades) : 0;
  const longTrades = trades.filter((trade) => trade.direction === "long");
  const shortTrades = trades.filter((trade) => trade.direction === "short");
  const winningTrades = trades.filter((trade) => (trade.payoff ?? 0) > 0);
  const losingTrades = trades.filter((trade) => (trade.payoff ?? 0) <= 0);
  return {
    run_id: birth.session_id,
    spawner_id: birth.spawner_id,
    lineage_id: birth.lineage_id,
    generation: birth.generation,
    parent_spawner_id: birth.parent_spawner_id,
    birth_tick: birth.birth_tick,
    birth_source_timestamp: birth.source_timestamp ?? null,
    birth_source_datetime: birth.source_datetime ?? null,
    death_tick: death?.death_tick ?? null,
    death_source_timestamp: death?.source_timestamp ?? null,
    death_source_datetime: death?.source_datetime ?? null,
    lifespan_ticks: death ? Math.max(0, death.death_tick - birth.birth_tick) : null,
    children,
    resolved_trades: resolvedTrades,
    wins,
    losses,
    hit_rate: resolvedTrades > 0 ? wins / resolvedTrades : 0,
    cumulative_payoff: cumulativePayoff,
    average_payoff: mean,
    average_win: averagePayoff(winningTrades),
    average_loss: averagePayoff(losingTrades),
    payoff_std_dev: Math.sqrt(variance),
    long_trades: longTrades.length,
    short_trades: shortTrades.length,
    long_average_payoff: averagePayoff(longTrades),
    short_average_payoff: averagePayoff(shortTrades),
    average_horizon_ticks: resolvedTrades > 0 ? averageValue(trades, "horizonTicks") : 0,
    average_strength: resolvedTrades > 0 ? averageValue(trades, "strength") : 0,
    last_resolved_tick: resolvedTrades > 0 ? Math.max(...trades.map((trade) => trade.resolveTick)) : null,
    snapshot_count: snapshotCount,
  };
}

function groupBy(rows, keyForRow) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function averagePayoff(trades) {
  return trades.length > 0 ? trades.reduce((sum, trade) => sum + (trade.payoff ?? 0), 0) / trades.length : 0;
}

function averageValue(rows, key) {
  return rows.reduce((sum, row) => sum + (row[key] ?? 0), 0) / rows.length;
}
