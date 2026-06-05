export function summarizeHeadlessCheckpoints(facts) {
  const resolvedTrades = facts.resolvedTrades;
  let tradeIndex = 0;
  let wins = 0;
  let cumulativePayoff = 0;
  return facts.checkpoints.map((row) => {
    while (tradeIndex < resolvedTrades.length && resolvedTrades[tradeIndex].resolveTick <= row.tick) {
      const trade = resolvedTrades[tradeIndex];
      if ((trade.payoff ?? 0) > 0) wins += 1;
      cumulativePayoff += trade.payoff ?? 0;
      tradeIndex += 1;
    }
    return {
      runId: row.session_id,
      tick: row.tick,
      sourceTimestamp: row.source_timestamp,
      sourceDatetime: row.source_datetime,
      population: row.population,
      eligibleAgents: row.eligible_agents,
      resolvedTrades: tradeIndex,
      wins,
      losses: Math.max(0, tradeIndex - wins),
      hitRate: tradeIndex > 0 ? wins / tradeIndex : 0,
      cumulativePayoff,
      averagePayoff: tradeIndex > 0 ? cumulativePayoff / tradeIndex : 0,
      tradesWritten: row.trades_written,
      snapshotsWritten: row.reconstruction_snapshots_written,
      createdAt: row.created_at,
    };
  });
}
