import { createFixedCountBuckets, fixedCountBucketIndex } from "./sineDiagnosticsBuckets.mjs";
import { clampInteger } from "./sineRepositoryUtils.mjs";

const COHORT_BUCKET_COUNT_DEFAULT = 100;
const COHORT_BUCKET_COUNT_MIN = 20;
const COHORT_BUCKET_COUNT_MAX = 200;
const COHORT_OVERLAP_AGENT_LIMIT = 120;
const COHORT_TRENDS = ["up", "flat", "down", "unknown"];
const COHORT_VOLATILITIES = ["low", "medium", "high", "unknown"];

export function buildCohortAnalysis({ context, selection, bucketCount, regimeContext }) {
  const eligibleIds = new Set(selection.eligible.map((agent) => agent.spawnerId));
  const eligibleTrades = context.resolvedTrades.filter((trade) => eligibleIds.has(trade.spawnerId));
  const internalTimeline = buildCohortTimeline(eligibleTrades, context.range, bucketCount, regimeContext);
  const regimeGrid = buildCohortRegimeGrid(internalTimeline);
  const concentration = buildCohortConcentration(eligibleTrades, internalTimeline, bucketCount);
  const timeline = stripCohortTimelineAgentIds(internalTimeline);
  return {
    timeline,
    regimeGrid,
    concentration,
  };
}

export function cohortBucketCount(value, range) {
  const requested = clampInteger(value, COHORT_BUCKET_COUNT_MIN, COHORT_BUCKET_COUNT_MAX, COHORT_BUCKET_COUNT_DEFAULT);
  const spanTicks = Math.max(1, range.toTick - range.fromTick + 1);
  return Math.max(1, Math.min(requested, spanTicks));
}

export function buildCohortTimeline(trades, range, bucketCount, regimeContext) {
  const buckets = createFixedCountBuckets(range, bucketCount).map((bucket, index) => ({
    ...bucket,
    index,
    trades: 0,
    wins: 0,
    losses: 0,
    totalPayoff: 0,
    averagePayoff: 0,
    hitRate: null,
    cumulativePayoff: 0,
    drawdown: 0,
    longCount: 0,
    shortCount: 0,
    uniqueAgents: 0,
    trend: regimeContext.bucketRegimes[index]?.trend ?? "unknown",
    volatility: regimeContext.bucketRegimes[index]?.volatility ?? "unknown",
    agentIds: new Set(),
  }));

  for (const trade of trades) {
    const index = fixedCountBucketIndex(trade.tick, range, bucketCount);
    const bucket = buckets[index];
    if (!bucket) continue;
    bucket.trades += 1;
    bucket.wins += trade.win ? 1 : 0;
    bucket.losses += trade.win ? 0 : 1;
    bucket.totalPayoff += trade.payoff;
    if (trade.direction === "long") bucket.longCount += 1;
    else if (trade.direction === "short") bucket.shortCount += 1;
    bucket.agentIds.add(trade.spawnerId);
  }

  let cumulativePayoff = 0;
  let peak = 0;
  return buckets.map((bucket) => {
    cumulativePayoff += bucket.totalPayoff;
    peak = Math.max(peak, cumulativePayoff);
    const uniqueAgents = bucket.agentIds.size;
    return {
      index: bucket.index,
      bucketStartTick: bucket.bucketStartTick,
      bucketEndTick: bucket.bucketEndTick,
      tick: bucket.bucketStartTick,
      trades: bucket.trades,
      uniqueAgents,
      wins: bucket.wins,
      losses: bucket.losses,
      hitRate: bucket.trades > 0 ? bucket.wins / bucket.trades : null,
      averagePayoff: bucket.trades > 0 ? bucket.totalPayoff / bucket.trades : 0,
      totalPayoff: bucket.totalPayoff,
      cumulativePayoff,
      drawdown: cumulativePayoff - peak,
      longCount: bucket.longCount,
      shortCount: bucket.shortCount,
      trend: bucket.trend,
      volatility: bucket.volatility,
      agentIds: bucket.agentIds,
    };
  });
}

export function buildCohortRegimeGrid(timeline) {
  const cells = new Map();
  for (const trend of COHORT_TRENDS) {
    for (const volatility of COHORT_VOLATILITIES) {
      cells.set(cohortRegimeKey(trend, volatility), {
        trend,
        volatility,
        trades: 0,
        uniqueAgents: 0,
        agentIds: new Set(),
        wins: 0,
        losses: 0,
        hitRate: null,
        averagePayoff: 0,
        totalPayoff: 0,
      });
    }
  }
  for (const bucket of timeline) {
    const key = cohortRegimeKey(bucket.trend, bucket.volatility);
    const cell = cells.get(key) ?? cells.get(cohortRegimeKey("unknown", "unknown"));
    cell.trades += bucket.trades;
    for (const spawnerId of bucket.agentIds ?? []) cell.agentIds.add(spawnerId);
    cell.wins += bucket.wins;
    cell.losses += bucket.losses;
    cell.totalPayoff += bucket.totalPayoff;
  }
  return [...cells.values()].map((cell) => ({
    trend: cell.trend,
    volatility: cell.volatility,
    trades: cell.trades,
    uniqueAgents: cell.agentIds.size,
    wins: cell.wins,
    losses: cell.losses,
    hitRate: cell.trades > 0 ? cell.wins / cell.trades : null,
    averagePayoff: cell.trades > 0 ? cell.totalPayoff / cell.trades : 0,
    totalPayoff: cell.totalPayoff,
  }));
}

export function buildCohortConcentration(trades, timeline, bucketCount) {
  const byAgent = new Map();
  const byLineage = new Map();
  let absolutePayoff = 0;
  for (const trade of trades) {
    const agent = byAgent.get(trade.spawnerId) ?? { spawnerId: trade.spawnerId, lineageId: trade.lineageId, trades: 0, absolutePayoff: 0, bucketIndexes: new Set() };
    agent.trades += 1;
    agent.absolutePayoff += Math.abs(trade.payoff);
    agent.bucketIndexes.add(fixedCountBucketIndex(trade.tick, { fromTick: timeline[0]?.bucketStartTick ?? 0, toTick: timeline.at(-1)?.bucketEndTick ?? 0 }, bucketCount));
    byAgent.set(trade.spawnerId, agent);
    addToMap(byLineage, trade.lineageId, 1);
    absolutePayoff += Math.abs(trade.payoff);
  }
  const totalTrades = trades.length;
  const activeBucketCount = timeline.filter((bucket) => bucket.trades > 0).length;
  const agents = [...byAgent.values()];
  const topAgentsByTrades = [...agents].sort((left, right) => right.trades - left.trades || left.spawnerId - right.spawnerId).slice(0, 10);
  const topAgentsByPayoff = [...agents].sort((left, right) => right.absolutePayoff - left.absolutePayoff || left.spawnerId - right.spawnerId).slice(0, 10);
  const topLineageTrades = Math.max(0, ...byLineage.values());
  return {
    totalTrades,
    activeAgents: agents.length,
    activeBucketCount,
    activeBucketCoverage: bucketCount > 0 ? activeBucketCount / bucketCount : 0,
    topAgentTradeShare: totalTrades > 0 ? topAgentsByTrades.reduce((sum, agent) => sum + agent.trades, 0) / totalTrades : 0,
    topAgentAbsolutePayoffShare: absolutePayoff > 0 ? topAgentsByPayoff.reduce((sum, agent) => sum + agent.absolutePayoff, 0) / absolutePayoff : 0,
    topLineageTradeShare: totalTrades > 0 ? topLineageTrades / totalTrades : 0,
    timingOverlapScore: timingOverlapScore(agents),
  };
}

function stripCohortTimelineAgentIds(timeline) {
  return timeline.map(({ agentIds: _agentIds, ...row }) => row);
}

function cohortRegimeKey(trend, volatility) {
  return `${COHORT_TRENDS.includes(trend) ? trend : "unknown"}:${COHORT_VOLATILITIES.includes(volatility) ? volatility : "unknown"}`;
}

function timingOverlapScore(agents) {
  const sample = agents
    .filter((agent) => agent.bucketIndexes.size > 0)
    .sort((left, right) => right.trades - left.trades || left.spawnerId - right.spawnerId)
    .slice(0, COHORT_OVERLAP_AGENT_LIMIT);
  if (sample.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let leftIndex = 0; leftIndex < sample.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sample.length; rightIndex += 1) {
      sum += jaccard(sample[leftIndex].bucketIndexes, sample[rightIndex].bucketIndexes);
      pairs += 1;
    }
  }
  return pairs > 0 ? sum / pairs : 0;
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}
