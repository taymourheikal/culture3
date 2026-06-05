export function buildHeadlessTradeBreakdown(facts) {
  return {
    byDirection: aggregateTrades(facts.resolvedTrades, (trade) => trade.direction, "direction"),
    byHorizon: aggregateTrades(facts.resolvedTrades, horizonBucket),
    byStrength: aggregateTrades(facts.resolvedTrades, strengthBucket),
    payoffBins: aggregateTrades(facts.resolvedTrades, payoffBucket).map(({ bucket, trades, averagePayoff, cumulativePayoff }) => ({
      bucket,
      trades,
      averagePayoff,
      cumulativePayoff,
    })),
  };
}

function aggregateTrades(trades, bucketForTrade, bucketField = "bucket") {
  const groups = new Map();
  for (const trade of trades) {
    const key = bucketForTrade(trade);
    const group = groups.get(key) ?? { key, trades: [], wins: 0, cumulativePayoff: 0 };
    group.trades.push(trade);
    if ((trade.payoff ?? 0) > 0) group.wins += 1;
    group.cumulativePayoff += trade.payoff ?? 0;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    [bucketField]: group.key,
    trades: group.trades.length,
    wins: group.wins,
    losses: Math.max(0, group.trades.length - group.wins),
    hitRate: group.trades.length > 0 ? group.wins / group.trades.length : 0,
    averagePayoff: group.trades.length > 0 ? group.cumulativePayoff / group.trades.length : 0,
    cumulativePayoff: group.cumulativePayoff,
  }));
}

function horizonBucket(trade) {
  if (trade.horizonTicks <= 5) return "0-5";
  if (trade.horizonTicks <= 10) return "6-10";
  if (trade.horizonTicks <= 20) return "11-20";
  if (trade.horizonTicks <= 35) return "21-35";
  return "36+";
}

function strengthBucket(trade) {
  if (trade.strength < 0.25) return "0.00-0.24";
  if (trade.strength < 0.5) return "0.25-0.49";
  if (trade.strength < 0.75) return "0.50-0.74";
  if (trade.strength < 1) return "0.75-0.99";
  return "1.00+";
}

function payoffBucket(trade) {
  const payoff = trade.payoff ?? 0;
  if (payoff < -2) return "< -2";
  if (payoff < -1) return "-2 to -1";
  if (payoff < -0.5) return "-1 to -0.5";
  if (payoff < 0) return "-0.5 to 0";
  if (payoff === 0) return "0";
  if (payoff <= 0.5) return "0 to 0.5";
  if (payoff <= 1) return "0.5 to 1";
  if (payoff <= 2) return "1 to 2";
  return "> 2";
}
