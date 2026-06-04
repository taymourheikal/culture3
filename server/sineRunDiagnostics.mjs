import { nonNegativeInteger } from "../src/sine/numeric.ts";
import { downsideDeviation, finiteSortedValues, histogram, quantile, summaryStats, tailRiskStats } from "./sineDiagnosticsMath.mjs";
import { historicalBucketSizeForSpan, historicalBucketStart } from "./sineDiagnosticsBuckets.mjs";
import { buildTradeQualityDiagnostics } from "./sineTradeQuality.mjs";

const HISTORICAL_CHART_LIMIT = 700;
const POPULATION_THRESHOLDS = [300, 250, 200, 150];
const AGENT_AGE_BINS = [
  ["0-99", 0, 100],
  ["100-249", 100, 250],
  ["250-499", 250, 500],
  ["500-999", 500, 1000],
  ["1k-2.5k", 1000, 2500],
  ["2.5k-5k", 2500, 5000],
  ["5k-10k", 5000, 10000],
  [">=10k", 10000, null],
];

export function buildSineSessionDiagnostics(context) {
  const population = buildPopulationDiagnostics(context.births, context.deaths, context.range, context.baselinePopulation);
  const deathCauses = buildDeathCauseDiagnostics(context.deaths, context.range);
  const trading = buildTradingDiagnostics(context.resolvedTrades, context.range);
  const tradeQuality = buildTradeQualityDiagnostics(context.resolvedTrades, context.agentAgeBySpawnerId, context.agentAges);
  const riskTail = buildRiskTailDiagnostics(context.resolvedTrades);
  const populationStructure = buildPopulationStructureDiagnostics(context, population);
  const resolvedTrades = context.resolvedTrades.length;
  return {
    range: context.range,
    health: {
      latestTick: context.latestTick,
      finalPopulation: population.finalPopulation,
      minPopulation: population.minPopulation,
      timeWeightedAveragePopulation: population.timeWeightedAveragePopulation,
      resolvedTrades,
      spawnedTrades: context.spawnedCount,
      pendingTrades: Math.max(0, context.spawnedCount - resolvedTrades),
      wins: trading.wins,
      losses: Math.max(0, resolvedTrades - trading.wins),
      hitRate: resolvedTrades > 0 ? trading.wins / resolvedTrades : 0,
      averagePayoff: resolvedTrades > 0 ? trading.cumulativePayoff / resolvedTrades : 0,
      cumulativePayoff: trading.cumulativePayoff,
      maxCumulativePayoffDrawdown: trading.maxCumulativePayoffDrawdown,
      worstSingleTickPayoff: trading.worstSingleTickPayoff,
    },
    resilience: {
      populationSeries: population.populationSeries,
      thresholdTicks: population.thresholdTicks,
      deathCauseSeries: deathCauses.series,
      unknownDeathCauses: deathCauses.unknown,
      churnBuckets: population.churnBuckets,
      worstPopulationDrawdown: population.worstPopulationDrawdown,
      averagePopulationDrawdown: population.averagePopulationDrawdown,
      worstSingleTickPopulationDrop: population.worstSingleTickPopulationDrop,
      minPopulation: population.minPopulation,
      maxPopulation: population.maxPopulation,
      timeWeightedAveragePopulation: population.timeWeightedAveragePopulation,
    },
    tradingPerformance: {
      cumulativePayoffSeries: trading.cumulativePayoffSeries,
      bucketSeries: trading.bucketSeries,
      bucketDownsideVolatility: trading.bucketDownsideVolatility,
      bucketVaR1: trading.bucketVaR1,
      bucketCVaR1: trading.bucketCVaR1,
      bucketVaR5: trading.bucketVaR5,
      bucketCVaR5: trading.bucketCVaR5,
      maxCumulativePayoffDrawdown: trading.maxCumulativePayoffDrawdown,
      worstSingleTickPayoff: trading.worstSingleTickPayoff,
      worstBucket: trading.worstBucket,
    },
    tradeQuality,
    riskTail,
    populationStructure,
  };
}

function buildPopulationDiagnostics(births, deaths, range, baselinePopulation = 0) {
  const deltas = new Map();
  const birthsByBucket = new Map();
  const deathsByBucket = new Map();
  const rangeSpanTicks = Math.max(1, range.toTick - range.fromTick);
  const bucketSize = historicalBucketSizeForSpan(rangeSpanTicks);
  deltas.set(range.fromTick, baselinePopulation);
  for (const birth of births) {
    addToMap(deltas, birth.tick, 1);
    addToMap(birthsByBucket, historicalBucketStart(birth.tick, bucketSize, range.fromTick), 1);
  }
  for (const death of deaths) {
    addToMap(deltas, death.tick, -1);
    addToMap(deathsByBucket, historicalBucketStart(death.tick, bucketSize, range.fromTick), 1);
  }

  const ticks = [...deltas.keys()].sort((left, right) => left - right);
  const points = [];
  let population = 0;
  let minPopulation = Number.POSITIVE_INFINITY;
  let maxPopulation = 0;
  let worstSingleTickPopulationDrop = 0;
  let peak = 0;
  let drawdownSum = 0;
  let worstPopulationDrawdown = 0;
  for (const tick of ticks) {
    const previous = population;
    population += deltas.get(tick) ?? 0;
    const change = population - previous;
    worstSingleTickPopulationDrop = Math.min(worstSingleTickPopulationDrop, change);
    minPopulation = Math.min(minPopulation, population);
    maxPopulation = Math.max(maxPopulation, population);
    peak = Math.max(peak, population);
    const drawdown = population - peak;
    drawdownSum += drawdown;
    worstPopulationDrawdown = Math.min(worstPopulationDrawdown, drawdown);
    points.push({ tick, population });
  }

  const thresholdDurations = new Map(POPULATION_THRESHOLDS.map((threshold) => [threshold, 0]));
  let durationSum = 0;
  let weightedPopulationSum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const nextTick = points[index + 1]?.tick ?? range.toTick;
    const duration = Math.max(0, nextTick - point.tick);
    durationSum += duration;
    weightedPopulationSum += point.population * duration;
    for (const threshold of POPULATION_THRESHOLDS) {
      if (point.population < threshold) thresholdDurations.set(threshold, (thresholdDurations.get(threshold) ?? 0) + duration);
    }
  }

  const bucketStarts = new Set([...birthsByBucket.keys(), ...deathsByBucket.keys()]);
  const churnBuckets = [...bucketStarts].sort((left, right) => left - right).map((start) => {
    const bucketBirths = birthsByBucket.get(start) ?? 0;
    const bucketDeaths = deathsByBucket.get(start) ?? 0;
    return {
      bucketStartTick: start,
      bucketEndTick: Math.min(range.toTick, start + bucketSize - 1),
      births: bucketBirths,
      deaths: bucketDeaths,
      events: bucketBirths + bucketDeaths,
    };
  });

  const finalPopulation = points.at(-1)?.population ?? 0;
  return {
    finalPopulation,
    minPopulation: Number.isFinite(minPopulation) ? minPopulation : 0,
    maxPopulation,
    timeWeightedAveragePopulation: durationSum > 0 ? weightedPopulationSum / durationSum : finalPopulation,
    thresholdTicks: POPULATION_THRESHOLDS.map((threshold) => ({ threshold, ticks: thresholdDurations.get(threshold) ?? 0 })),
    populationSeries: downsample(points, HISTORICAL_CHART_LIMIT),
    churnBuckets,
    worstPopulationDrawdown,
    averagePopulationDrawdown: points.length > 0 ? drawdownSum / points.length : 0,
    worstSingleTickPopulationDrop,
  };
}

function buildDeathCauseDiagnostics(deaths, range) {
  const bucketSize = historicalBucketSizeForSpan(Math.max(1, range.toTick - range.fromTick));
  const rowsByBucket = new Map();
  let unknown = 0;
  for (const death of deaths) {
    const start = historicalBucketStart(death.tick, bucketSize, range.fromTick);
    const row =
      rowsByBucket.get(start) ??
      {
        bucketStartTick: start,
        bucketEndTick: Math.min(range.toTick, start + bucketSize - 1),
        lowEnergyDeaths: 0,
        lowHealthDeaths: 0,
        bothDeaths: 0,
        unknownDeaths: 0,
      };
    if (death.deathCause === "low_energy") row.lowEnergyDeaths += 1;
    else if (death.deathCause === "low_health") row.lowHealthDeaths += 1;
    else if (death.deathCause === "both") row.bothDeaths += 1;
    else {
      row.unknownDeaths += 1;
      unknown += 1;
    }
    rowsByBucket.set(start, row);
  }
  const series = [...rowsByBucket.values()].sort((left, right) => left.bucketStartTick - right.bucketStartTick);
  return {
    series: downsample(series, HISTORICAL_CHART_LIMIT),
    unknown,
  };
}

function buildTradingDiagnostics(trades, range) {
  const byTick = new Map();
  let wins = 0;
  for (const trade of trades) {
    if (trade.win) wins += 1;
    const row = byTick.get(trade.tick) ?? { tick: trade.tick, tickPayoff: 0, trades: 0, wins: 0 };
    row.tickPayoff += trade.payoff;
    row.trades += 1;
    if (trade.win) row.wins += 1;
    byTick.set(trade.tick, row);
  }
  const tickRows = [...byTick.values()].sort((left, right) => left.tick - right.tick);
  let cumulativePayoff = 0;
  let peak = 0;
  let maxCumulativePayoffDrawdown = 0;
  let worstSingleTickPayoff = 0;
  const cumulativePayoffSeries = tickRows.map((row) => {
    cumulativePayoff += row.tickPayoff;
    peak = Math.max(peak, cumulativePayoff);
    const drawdown = cumulativePayoff - peak;
    maxCumulativePayoffDrawdown = Math.min(maxCumulativePayoffDrawdown, drawdown);
    worstSingleTickPayoff = Math.min(worstSingleTickPayoff, row.tickPayoff);
    return {
      tick: row.tick,
      cumulativePayoff,
      drawdown,
      tickPayoff: row.tickPayoff,
      trades: row.trades,
    };
  });

  const bucketSize = historicalBucketSizeForSpan(Math.max(1, range.toTick - range.fromTick));
  const buckets = new Map();
  for (const trade of trades) {
    const start = historicalBucketStart(trade.tick, bucketSize, range.fromTick);
    const row = buckets.get(start) ?? { bucketStartTick: start, bucketEndTick: Math.min(range.toTick, start + bucketSize - 1), trades: 0, wins: 0, totalPayoff: 0 };
    row.trades += 1;
    row.totalPayoff += trade.payoff;
    if (trade.win) row.wins += 1;
    buckets.set(start, row);
  }
  const bucketSeries = [...buckets.values()].sort((left, right) => left.bucketStartTick - right.bucketStartTick).map((row) => ({
    ...row,
    hitRate: row.trades > 0 ? row.wins / row.trades : 0,
    averagePayoff: row.trades > 0 ? row.totalPayoff / row.trades : 0,
  }));
  const bucketRisk = tailRiskStats(bucketSeries.map((row) => row.totalPayoff), [0.01, 0.05]);
  const worstBucket = bucketSeries.reduce((worst, row) => (!worst || row.totalPayoff < worst.totalPayoff ? row : worst), null);
  return {
    wins,
    cumulativePayoff,
    cumulativePayoffSeries: downsample(cumulativePayoffSeries, HISTORICAL_CHART_LIMIT),
    bucketSeries,
    bucketDownsideVolatility: downsideDeviation(bucketSeries.map((row) => row.totalPayoff)),
    bucketVaR1: bucketRisk[0.01].valueAtRisk,
    bucketCVaR1: bucketRisk[0.01].conditionalValueAtRisk,
    bucketVaR5: bucketRisk[0.05].valueAtRisk,
    bucketCVaR5: bucketRisk[0.05].conditionalValueAtRisk,
    maxCumulativePayoffDrawdown,
    worstSingleTickPayoff,
    worstBucket: worstBucket
      ? {
          bucketStartTick: worstBucket.bucketStartTick,
          bucketEndTick: worstBucket.bucketEndTick,
          totalPayoff: worstBucket.totalPayoff,
          averagePayoff: worstBucket.averagePayoff,
          trades: worstBucket.trades,
        }
      : null,
  };
}

function buildRiskTailDiagnostics(trades) {
  const payoffs = finiteSortedValues(trades.map((trade) => trade.payoff));
  const tailRisk = tailRiskStats(payoffs, [0.01, 0.05]);
  return {
    payoffHistogram: histogram(payoffs, [
      ["<-2", null, -2],
      ["-2..-1", -2, -1],
      ["-1..-0.5", -1, -0.5],
      ["-0.5..0", -0.5, 0],
      ["0..0.5", 0, 0.5],
      ["0.5..1", 0.5, 1],
      ["1..2", 1, 2],
      [">=2", 2, null],
    ]),
    worst1PctPayoff: quantile(payoffs, 0.01),
    worst5PctPayoff: quantile(payoffs, 0.05),
    worst10PctPayoff: quantile(payoffs, 0.1),
    best1PctPayoff: quantile(payoffs, 0.99),
    best5PctPayoff: quantile(payoffs, 0.95),
    best10PctPayoff: quantile(payoffs, 0.9),
    tradeVaR1: tailRisk[0.01].valueAtRisk,
    tradeCVaR1: tailRisk[0.01].conditionalValueAtRisk,
    tradeVaR5: tailRisk[0.05].valueAtRisk,
    tradeCVaR5: tailRisk[0.05].conditionalValueAtRisk,
    tradeDownsideVolatility: downsideDeviation(payoffs),
    averageAbsolutePayoff: trades.length > 0 ? trades.reduce((sum, trade) => sum + Math.abs(trade.payoff), 0) / trades.length : 0,
    byDirection: aggregateTrades(trades, (trade) => trade.direction || "unknown").map((row) => ({ ...row, direction: row.bucket, bucket: undefined })),
    byHorizon: aggregateTrades(trades, (trade) => bucketLabel(trade.horizonTicks, [
      [0, 10, "0-10"],
      [11, 20, "11-20"],
      [21, 40, "21-40"],
      [41, 80, "41-80"],
      [81, Number.POSITIVE_INFINITY, ">=81"],
    ])),
    byStrength: aggregateTrades(trades, (trade) => bucketLabel(trade.strength, [
      [0, 0.25, "0-0.25"],
      [0.25, 0.5, "0.25-0.5"],
      [0.5, 0.75, "0.5-0.75"],
      [0.75, 1, "0.75-1"],
      [1, Number.POSITIVE_INFINITY, ">=1"],
    ])),
  };
}

function buildPopulationStructureDiagnostics(context, population) {
  const agentAges = context.agentAges ?? agentAgeValues(context.births, context.deaths, context.latestTick);
  const liveByLineage = new Map();
  for (const birth of context.aliveAgentsAtTo ?? context.births) {
    addToMap(liveByLineage, birth.lineageId, 1);
  }
  const liveCounts = [...liveByLineage.entries()].sort((left, right) => right[1] - left[1]);
  const finalPopulation = Math.max(1, population.finalPopulation);
  const payoffByLineage = new Map();
  let cumulativePayoff = 0;
  for (const trade of context.resolvedTrades) {
    cumulativePayoff += trade.payoff;
    addToMap(payoffByLineage, trade.lineageId, trade.payoff);
  }
  const topPayoffLineage = [...payoffByLineage.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const top3Population = liveCounts.slice(0, 3).reduce((sum, [, count]) => sum + count, 0);
  const generationRows = [...(context.aliveAgentsAtTo ?? []), ...context.births, ...context.deaths];
  const spanTicks = Math.max(1, context.rangeSpanTicks ?? context.latestTick);
  return {
    birthDeathTimeline: population.churnBuckets,
    maxGenerationEver: Math.max(0, ...generationRows.map((row) => row.generation)),
    liveLineageCount: liveCounts.length,
    topLineageId: liveCounts[0]?.[0] ?? null,
    topLineagePopulationShare: (liveCounts[0]?.[1] ?? 0) / finalPopulation,
    topLineagePayoffLineageId: topPayoffLineage?.[0] ?? null,
    topLineagePayoffShare: cumulativePayoff !== 0 && topPayoffLineage ? topPayoffLineage[1] / cumulativePayoff : 0,
    top3LineagePopulationShare: top3Population / finalPopulation,
    birthsPer1000Ticks: (context.births.length / spanTicks) * 1000,
    deathsPer1000Ticks: (context.deaths.length / spanTicks) * 1000,
    ageSummary: summaryStats(agentAges),
    ageHistogram: histogram(agentAges, AGENT_AGE_BINS),
  };
}

function agentAgeValues(births, deaths, latestTick) {
  const deathTickBySpawnerId = new Map(deaths.map((death) => [death.spawnerId, death.tick]));
  const runEndTick = nonNegativeInteger(latestTick, 0);
  return births.map((birth) => {
    const endTick = deathTickBySpawnerId.get(birth.spawnerId) ?? runEndTick;
    return Math.max(0, nonNegativeInteger(endTick, 0) - nonNegativeInteger(birth.tick, 0));
  });
}

function aggregateTrades(trades, keyForTrade) {
  const byKey = new Map();
  for (const trade of trades) {
    const key = keyForTrade(trade);
    const row = byKey.get(key) ?? { bucket: key, trades: 0, wins: 0, totalPayoff: 0 };
    row.trades += 1;
    row.wins += trade.win ? 1 : 0;
    row.totalPayoff += trade.payoff;
    byKey.set(key, row);
  }
  return [...byKey.values()].map((row) => ({
    bucket: row.bucket,
    trades: row.trades,
    hitRate: row.trades > 0 ? row.wins / row.trades : null,
    averagePayoff: row.trades > 0 ? row.totalPayoff / row.trades : 0,
    totalPayoff: row.totalPayoff,
  }));
}

function bucketLabel(value, ranges) {
  for (const [min, max, label] of ranges) {
    if (value >= min && value < max) return label;
  }
  return "unknown";
}

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function downsample(rows, limit) {
  if (rows.length <= limit) return rows;
  const result = [];
  const step = (rows.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    result.push(rows[Math.round(index * step)]);
  }
  return result;
}
