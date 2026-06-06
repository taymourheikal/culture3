import { downsideDeviation, finiteSortedValues, histogram, quantile, sortinoRatio, summaryStats } from "./sineDiagnosticsMath.mjs";
import { clampInteger, finiteNumber } from "./sineRepositoryUtils.mjs";

const TRADE_QUALITY_FILTERS = [
  { label: "All agents", minTrades: 0 },
  { label: ">=25 trades", minTrades: 25 },
  { label: ">=50 trades", minTrades: 50 },
  { label: ">=100 trades", minTrades: 100 },
];
const TRADE_QUALITY_AGE_FILTERS = [
  { label: "No age filter", minAgePercentile: 0 },
  { label: ">=25th percentile", minAgePercentile: 25 },
  { label: ">=50th percentile", minAgePercentile: 50 },
  { label: ">=75th percentile", minAgePercentile: 75 },
];

export function buildTradeQualityDiagnostics(trades, agentAgeBySpawnerId = new Map(), agentAges = []) {
  const model = createTradeQualityModel(trades, agentAgeBySpawnerId, agentAges);
  return {
    filters: TRADE_QUALITY_FILTERS.flatMap((tradeFilter) =>
      TRADE_QUALITY_AGE_FILTERS.map((ageFilter) => {
        const selection = selectTradeQualityAgents(model, {
          minTrades: tradeFilter.minTrades,
          minAgePercentile: ageFilter.minAgePercentile,
        });
        return buildTradeQualityFilterRow(selection);
      })
    ),
  };
}

export function createTradeQualityModel(trades, agentAgeBySpawnerId = new Map(), agentAges = []) {
  return {
    agents: createAgentTradeSummaries(trades, agentAgeBySpawnerId),
    ageThresholds: tradeQualityAgeThresholds(agentAges),
  };
}

export function selectTradeQualityAgents(model, input = {}) {
  const tradeFilter = tradeQualityTradeFilter(input.minTrades);
  const ageFilter = tradeQualityAgeFilter(input.minAgePercentile);
  const minAgeTicks = model.ageThresholds.get(ageFilter.minAgePercentile) ?? 0;
  const eligible = model.agents.filter((agent) =>
    agent.trades >= tradeFilter.minTrades &&
    (ageFilter.minAgePercentile === 0 || agent.ageTicks >= minAgeTicks)
  );
  return {
    tradeFilter,
    ageFilter,
    minAgeTicks,
    eligible,
  };
}

function tradeQualityTradeFilter(value) {
  const requested = clampInteger(value, 0, Number.POSITIVE_INFINITY, 50);
  return TRADE_QUALITY_FILTERS.find((filter) => filter.minTrades === requested) ?? { label: `>=${requested} trades`, minTrades: requested };
}

function tradeQualityAgeFilter(value) {
  const requested = clampInteger(value, 0, 100, 0);
  return TRADE_QUALITY_AGE_FILTERS.find((filter) => filter.minAgePercentile === requested) ?? TRADE_QUALITY_AGE_FILTERS[0];
}

function tradeQualityAgeThresholds(agentAges) {
  const sortedAges = finiteSortedValues(agentAges);
  return new Map(TRADE_QUALITY_AGE_FILTERS.map((filter) => [
    filter.minAgePercentile,
    filter.minAgePercentile === 0 ? 0 : quantile(sortedAges, filter.minAgePercentile / 100) ?? 0,
  ]));
}

export function createAgentTradeSummaries(trades, agentAgeBySpawnerId = new Map()) {
  const byAgent = new Map();
  for (const trade of trades) {
    const row = byAgent.get(trade.spawnerId) ?? { spawnerId: trade.spawnerId, lineageId: trade.lineageId, trades: 0, wins: 0, sum: 0, sumSquares: 0, payoffs: [] };
    const payoff = finiteNumber(trade.payoff, 0);
    row.trades += 1;
    row.wins += trade.win === undefined ? (payoff > 0 ? 1 : 0) : trade.win ? 1 : 0;
    row.sum += payoff;
    row.sumSquares += payoff * payoff;
    row.payoffs.push(payoff);
    byAgent.set(trade.spawnerId, row);
  }
  return [...byAgent.values()].map((row) => {
    const averagePayoff = row.trades > 0 ? row.sum / row.trades : 0;
    const variance = row.trades > 1 ? Math.max(0, (row.sumSquares - (row.sum * row.sum) / row.trades) / (row.trades - 1)) : 0;
    const stdDev = Math.sqrt(variance);
    return {
      ...row,
      ageTicks: finiteNumber(agentAgeBySpawnerId.get(row.spawnerId), 0),
      averagePayoff,
      hitRate: row.trades > 0 ? row.wins / row.trades : 0,
      sharpe: row.trades > 1 && stdDev > 1e-12 ? averagePayoff / stdDev : null,
      downsideVolatility: downsideDeviation(row.payoffs),
      sortino: sortinoRatio(row.payoffs),
    };
  });
}

function buildTradeQualityFilterRow({ tradeFilter, ageFilter, minAgeTicks, eligible }) {
  const definedSharpe = eligible.map((agent) => agent.sharpe).filter((value) => value !== null);
  const definedSortino = eligible.map((agent) => agent.sortino).filter((value) => value !== null);
  return {
    label: ageFilter.minAgePercentile === 0 ? tradeFilter.label : `${tradeFilter.label} · ${ageFilter.label}`,
    ageLabel: ageFilter.label,
    minTrades: tradeFilter.minTrades,
    minAgePercentile: ageFilter.minAgePercentile,
    minAgeTicks,
    eligibleAgents: eligible.length,
    undefinedSharpeAgents: eligible.length - definedSharpe.length,
    agentsAboveSharpe075: eligible.filter((agent) => agent.sharpe !== null && agent.sharpe > 0.75).length,
    undefinedSortinoAgents: eligible.length - definedSortino.length,
    agentsAboveSortino075: eligible.filter((agent) => agent.sortino !== null && agent.sortino > 0.75).length,
    sharpeSummary: summaryStats(definedSharpe),
    sortinoSummary: summaryStats(definedSortino),
    downsideVolatilitySummary: summaryStats(eligible.map((agent) => agent.downsideVolatility)),
    sharpeHistogram: histogram(definedSharpe, [
      ["<-0.5", null, -0.5],
      ["-0.5..0", -0.5, 0],
      ["0..0.25", 0, 0.25],
      ["0.25..0.5", 0.25, 0.5],
      ["0.5..0.75", 0.5, 0.75],
      ["0.75..1", 0.75, 1],
      ["1..1.5", 1, 1.5],
      ["1.5..2", 1.5, 2],
      [">=2", 2, null],
    ]),
    sortinoHistogram: histogram(definedSortino, [
      ["<-0.5", null, -0.5],
      ["-0.5..0", -0.5, 0],
      ["0..0.25", 0, 0.25],
      ["0.25..0.5", 0.25, 0.5],
      ["0.5..0.75", 0.5, 0.75],
      ["0.75..1", 0.75, 1],
      ["1..1.5", 1, 1.5],
      ["1.5..2", 1.5, 2],
      [">=2", 2, null],
    ]),
    downsideVolatilityHistogram: histogram(eligible.map((agent) => agent.downsideVolatility), [
      ["0", 0, 0.000001],
      ["0..0.1", 0.000001, 0.1],
      ["0.1..0.25", 0.1, 0.25],
      ["0.25..0.5", 0.25, 0.5],
      ["0.5..1", 0.5, 1],
      ["1..2", 1, 2],
      [">=2", 2, null],
    ]),
    averagePayoffHistogram: histogram(eligible.map((agent) => agent.averagePayoff), [
      ["<-1", null, -1],
      ["-1..-0.5", -1, -0.5],
      ["-0.5..0", -0.5, 0],
      ["0..0.25", 0, 0.25],
      ["0.25..0.5", 0.25, 0.5],
      ["0.5..1", 0.5, 1],
      [">=1", 1, null],
    ]),
    hitRateHistogram: histogram(eligible.map((agent) => agent.hitRate), [
      ["<40%", null, 0.4],
      ["40-50%", 0.4, 0.5],
      ["50-60%", 0.5, 0.6],
      ["60-70%", 0.6, 0.7],
      ["70-80%", 0.7, 0.8],
      ["80-90%", 0.8, 0.9],
      [">=90%", 0.9, null],
    ]),
    resolvedTradesHistogram: histogram(eligible.map((agent) => agent.trades), [
      ["0-9", 0, 10],
      ["10-24", 10, 25],
      ["25-49", 25, 50],
      ["50-99", 50, 100],
      ["100-249", 100, 250],
      ["250-499", 250, 500],
      [">=500", 500, null],
    ]),
  };
}
