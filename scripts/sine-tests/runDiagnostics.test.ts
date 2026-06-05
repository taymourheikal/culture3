import { strict as assert } from "node:assert";
import type { SineTest } from "./helpers";

async function testRunDiagnosticsGoldenFixture() {
  const diagnostics = await buildDiagnostics(goldenContext());

  assert.deepEqual(diagnostics.range, fullRange());
  assert.equal(diagnostics.health.latestTick, 120);
  assert.equal(diagnostics.health.finalPopulation, 1);
  assert.equal(diagnostics.health.resolvedTrades, 5);
  assert.equal(diagnostics.health.spawnedTrades, 7);
  assert.equal(diagnostics.health.pendingTrades, 2);
  assert.equal(diagnostics.health.wins, 3);
  assert.equal(diagnostics.health.losses, 2);
  assert.equal(round(diagnostics.health.hitRate), 0.6);
  assert.equal(round(diagnostics.health.averagePayoff), 0.35);
  assert.equal(round(diagnostics.health.cumulativePayoff), 1.75);
  assert.equal(round(diagnostics.health.maxCumulativePayoffDrawdown), -2.25);
  assert.equal(round(diagnostics.health.worstSingleTickPayoff), -2);

  assert.equal(diagnostics.resilience.finalPopulation, undefined);
  assert.equal(diagnostics.resilience.minPopulation, 1);
  assert.equal(diagnostics.resilience.maxPopulation, 3);
  assert.equal(round(diagnostics.resilience.timeWeightedAveragePopulation), 2.166667);
  assert.equal(round(diagnostics.resilience.worstPopulationDrawdown), -2);
  assert.equal(round(diagnostics.resilience.averagePopulationDrawdown), -0.666667);
  assert.equal(diagnostics.resilience.worstSingleTickPopulationDrop, -1);
  assert.deepEqual(diagnostics.resilience.thresholdTicks, [
    { threshold: 300, ticks: 120 },
    { threshold: 250, ticks: 120 },
    { threshold: 200, ticks: 120 },
    { threshold: 150, ticks: 120 },
  ]);
  assert.deepEqual(diagnostics.resilience.populationSeries, [
    { tick: 0, population: 2 },
    { tick: 20, population: 3 },
    { tick: 50, population: 2 },
    { tick: 70, population: 3 },
    { tick: 80, population: 2 },
    { tick: 100, population: 1 },
  ]);
  assert.deepEqual(diagnostics.resilience.deathCauseSeries, [
    { bucketStartTick: 48, bucketEndTick: 53, lowEnergyDeaths: 0, lowHealthDeaths: 1, bothDeaths: 0, unknownDeaths: 0 },
    { bucketStartTick: 78, bucketEndTick: 83, lowEnergyDeaths: 1, lowHealthDeaths: 0, bothDeaths: 0, unknownDeaths: 0 },
    { bucketStartTick: 96, bucketEndTick: 101, lowEnergyDeaths: 0, lowHealthDeaths: 0, bothDeaths: 1, unknownDeaths: 0 },
  ]);
  assert.equal(diagnostics.resilience.unknownDeathCauses, 0);

  assert.deepEqual(diagnostics.tradingPerformance.cumulativePayoffSeries, [
    { tick: 10, cumulativePayoff: 1, drawdown: 0, tickPayoff: 1, trades: 1 },
    { tick: 20, cumulativePayoff: 0.75, drawdown: -0.25, tickPayoff: -0.25, trades: 2 },
    { tick: 70, cumulativePayoff: -1.25, drawdown: -2.25, tickPayoff: -2, trades: 1 },
    { tick: 90, cumulativePayoff: 1.75, drawdown: 0, tickPayoff: 3, trades: 1 },
  ]);
  assert.equal(round(diagnostics.tradingPerformance.bucketDownsideVolatility), 1.007782);
  assert.equal(round(diagnostics.tradingPerformance.bucketVaR5), -1.7375);
  assert.equal(round(diagnostics.tradingPerformance.bucketCVaR5), -2);
  assert.deepEqual(diagnostics.tradingPerformance.worstBucket, {
    bucketStartTick: 66,
    bucketEndTick: 71,
    totalPayoff: -2,
    averagePayoff: -2,
    trades: 1,
  });

  assert.equal(round(diagnostics.riskTail.tradeDownsideVolatility), 0.921954);
  assert.equal(round(diagnostics.riskTail.tradeVaR5), -1.7);
  assert.equal(round(diagnostics.riskTail.tradeCVaR5), -2);
  assert.equal(diagnostics.riskTail.payoffHistogram.find((row: { label: string }) => row.label === ">=2")?.count, 1);
  assert.equal(diagnostics.riskTail.byDirection.find((row: { direction: string }) => row.direction === "long")?.trades, 3);
  assert.equal(diagnostics.riskTail.byDirection.find((row: { direction: string }) => row.direction === "short")?.trades, 2);

  assert.equal(diagnostics.populationStructure.maxGenerationEver, 1);
  assert.equal(diagnostics.populationStructure.liveLineageCount, 1);
  assert.equal(diagnostics.populationStructure.topLineageId, 1);
  assert.equal(diagnostics.populationStructure.topLineagePopulationShare, 1);
  assert.equal(diagnostics.populationStructure.ageSummary.count, 4);
  assert.equal(diagnostics.populationStructure.ageSummary.max, 120);
  assert.equal(diagnostics.populationStructure.ageHistogram.find((row: { label: string }) => row.label === "0-99")?.count, 3);

  const allAgentsFilter = diagnostics.tradeQuality.filters.find((row: { label: string }) => row.label === "All agents");
  assert.equal(allAgentsFilter?.eligibleAgents, 4);
  assert.equal(allAgentsFilter?.undefinedSharpeAgents, 3);
  assert.equal(allAgentsFilter?.resolvedTradesHistogram.find((row: { label: string }) => row.label === "0-9")?.count, 4);
}

async function testRunDiagnosticsFilteredRangeGoldenFixture() {
  const diagnostics = await buildDiagnostics(filteredContext());

  assert.equal(diagnostics.range.fromTick, 50);
  assert.equal(diagnostics.range.toTick, 100);
  assert.equal(diagnostics.health.finalPopulation, 1);
  assert.equal(diagnostics.health.resolvedTrades, 2);
  assert.equal(diagnostics.health.wins, 1);
  assert.equal(diagnostics.health.losses, 1);
  assert.equal(round(diagnostics.health.averagePayoff), 0.5);
  assert.equal(round(diagnostics.health.cumulativePayoff), 1);
  assert.equal(round(diagnostics.health.maxCumulativePayoffDrawdown), -2);
  assert.equal(round(diagnostics.health.worstSingleTickPayoff), -2);
  assert.deepEqual(diagnostics.resilience.populationSeries, [
    { tick: 50, population: 2 },
    { tick: 70, population: 3 },
    { tick: 80, population: 2 },
    { tick: 100, population: 1 },
  ]);
  assert.deepEqual(diagnostics.tradingPerformance.cumulativePayoffSeries, [
    { tick: 70, cumulativePayoff: -2, drawdown: -2, tickPayoff: -2, trades: 1 },
    { tick: 90, cumulativePayoff: 1, drawdown: 0, tickPayoff: 3, trades: 1 },
  ]);
  assert.equal(diagnostics.populationStructure.ageSummary.count, 4);
  assert.equal(diagnostics.tradeQuality.filters.find((row: { label: string }) => row.label === "All agents")?.eligibleAgents, 2);
}

async function testRunDiagnosticsEmptyFixture() {
  const diagnostics = await buildDiagnostics(emptyContext());

  assert.equal(diagnostics.health.finalPopulation, 0);
  assert.equal(diagnostics.health.resolvedTrades, 0);
  assert.equal(diagnostics.health.pendingTrades, 0);
  assert.equal(diagnostics.health.hitRate, 0);
  assert.equal(diagnostics.health.averagePayoff, 0);
  assert.equal(diagnostics.health.cumulativePayoff, 0);
  assert.deepEqual(diagnostics.resilience.populationSeries, [{ tick: 0, population: 0 }]);
  assert.deepEqual(diagnostics.resilience.deathCauseSeries, []);
  assert.deepEqual(diagnostics.tradingPerformance.cumulativePayoffSeries, []);
  assert.equal(diagnostics.tradingPerformance.worstBucket, null);
  assert.equal(diagnostics.riskTail.tradeVaR5, null);
  assert.equal(diagnostics.riskTail.tradeCVaR5, null);
  assert.equal(diagnostics.populationStructure.ageSummary.count, 0);
  assert.equal(diagnostics.tradeQuality.filters.find((row: { label: string }) => row.label === "All agents")?.eligibleAgents, 0);
  assertFiniteNumbers(diagnostics);
}

export const tests: SineTest[] = [
  { name: "Run Diagnostics Golden Fixture", run: testRunDiagnosticsGoldenFixture },
  { name: "Run Diagnostics Filtered Range Golden Fixture", run: testRunDiagnosticsFilteredRangeGoldenFixture },
  { name: "Run Diagnostics Empty Fixture", run: testRunDiagnosticsEmptyFixture },
];

function goldenContext() {
  const births = [
    birth(1, 1, 0, 0),
    birth(2, 2, 0, 0),
    birth(3, 1, 1, 20),
    birth(4, 3, 0, 70),
  ];
  const deaths = [
    death(2, 2, 0, 50, "low_health"),
    death(3, 1, 1, 80, "low_energy"),
    death(4, 3, 0, 100, "both"),
  ];
  return {
    sessionId: "diagnostics-golden",
    range: fullRange(),
    startTick: 0,
    latestTick: 120,
    rangeSpanTicks: 120,
    births,
    deaths,
    resolvedTrades: trades(),
    spawnedCount: 7,
    baselinePopulation: 0,
    aliveAgentsAtTo: [births[0]],
    agentAges: [120, 50, 60, 30],
    agentAgeBySpawnerId: new Map([
      [1, 120],
      [2, 50],
      [3, 60],
      [4, 30],
    ]),
  };
}

function filteredContext() {
  const all = goldenContext();
  const range = {
    startTick: 0,
    latestTick: 120,
    fromPercent: 42,
    toPercent: 83,
    fromTick: 50,
    toTick: 100,
  };
  return {
    ...all,
    range,
    startTick: 50,
    latestTick: 100,
    rangeSpanTicks: 50,
    births: all.births.filter((row) => row.tick >= 50 && row.tick <= 100),
    deaths: all.deaths.filter((row) => row.tick >= 50 && row.tick <= 100),
    resolvedTrades: all.resolvedTrades.filter((row) => row.tick >= 50 && row.tick <= 100),
    spawnedCount: 2,
    baselinePopulation: 3,
    aliveAgentsAtTo: [all.births[0]],
    agentAges: [50, 0, 30, 30],
    agentAgeBySpawnerId: new Map([
      [1, 50],
      [2, 0],
      [3, 30],
      [4, 30],
    ]),
  };
}

function emptyContext() {
  return {
    sessionId: "diagnostics-empty",
    range: {
      startTick: 0,
      latestTick: 0,
      fromPercent: 0,
      toPercent: 100,
      fromTick: 0,
      toTick: 0,
    },
    startTick: 0,
    latestTick: 0,
    rangeSpanTicks: 0,
    births: [],
    deaths: [],
    resolvedTrades: [],
    spawnedCount: 0,
    baselinePopulation: 0,
    aliveAgentsAtTo: [],
    agentAges: [],
    agentAgeBySpawnerId: new Map(),
  };
}

function fullRange() {
  return {
    startTick: 0,
    latestTick: 120,
    fromPercent: 0,
    toPercent: 100,
    fromTick: 0,
    toTick: 120,
  };
}

function birth(spawnerId: number, lineageId: number, generation: number, tick: number) {
  return {
    spawnerId,
    parentSpawnerId: generation > 0 ? 1 : null,
    lineageId,
    generation,
    tick,
    sourceTimestamp: null,
    sourceDatetime: null,
  };
}

function death(spawnerId: number, lineageId: number, generation: number, tick: number, deathCause: string) {
  return {
    spawnerId,
    lineageId,
    generation,
    tick,
    deathCause,
    deathEnergyThreshold: 5,
    deathHealthThreshold: 5,
    sourceTimestamp: null,
    sourceDatetime: null,
  };
}

function trades() {
  return [
    trade(10, 1, 1, 1, "win", "long", 8, 0.4),
    trade(20, 2, 2, -0.5, "loss", "short", 15, 0.8),
    trade(20, 1, 1, 0.25, "win", "long", 30, 1.2),
    trade(70, 3, 1, -2, "loss", "short", 50, 0.6),
    trade(90, 4, 3, 3, "win", "long", 100, 0.9),
  ];
}

function trade(tick: number, spawnerId: number, lineageId: number, payoff: number, status: "win" | "loss", direction: "long" | "short", horizonTicks: number, strength: number) {
  return {
    tick,
    spawnTick: Math.max(0, tick - horizonTicks),
    resolveTick: tick,
    spawnerId,
    lineageId,
    payoff,
    status,
    win: status === "win",
    direction,
    strength,
    horizonTicks,
    entrySignal: 1,
    exitSignal: 1 + payoff,
    entryPrice: null,
    exitPrice: null,
    sourceTimestamp: null,
    exitSourceTimestamp: null,
  };
}

function round(value: number | null) {
  assert.notEqual(value, null);
  return Number((value as number).toFixed(6));
}

function assertFiniteNumbers(value: unknown) {
  if (typeof value === "number") {
    assert.equal(Number.isNaN(value), false);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    assertFiniteNumbers(child);
  }
}

async function buildDiagnostics(context: unknown) {
  const module = await import(new URL("../../server/sineRunDiagnostics.mjs", import.meta.url).href);
  return module.buildSineSessionDiagnostics(context);
}
