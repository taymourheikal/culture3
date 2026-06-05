import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, getSineSessionAnalysis, saveSinePersistenceBatch } from "../../server/sineRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../../server/sineDb.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";
import { cloneSpawnerWith, resolvedFoodEvent, resolvedTradeEventFor, stateSnapshotFor, tradeEventsForAgent } from "./sinePersistenceFixtures";

function testSineRepositoryDerivesSavedRunRiskDiagnostics() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const spawnerTwo = cloneSpawnerWith(spawner, { id: spawner.id + 1, lineageId: spawner.lineageId + 1 });
  const sessionId = uniqueTestSessionId("test-sine-risk-diagnostics");
  const payoffs = [
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 1, payoff: 3, direction: "long" as const },
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 6, payoff: -1, direction: "long" as const },
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 11, payoff: 4, direction: "short" as const },
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 16, payoff: -2, direction: "short" as const },
    { spawnerId: spawnerTwo.id, lineageId: spawnerTwo.lineageId, tick: 21, payoff: 1, direction: "long" as const },
    { spawnerId: spawnerTwo.id, lineageId: spawnerTwo.lineageId, tick: 26, payoff: 2, direction: "short" as const },
  ];

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 100,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [
      { tick: spawner.birthTick, spawner },
      { tick: spawnerTwo.birthTick, spawner: spawnerTwo },
    ],
    deaths: [],
    genomeSnapshots: [],
    stateSnapshots: [
      stateSnapshotFor(spawner, 100),
      stateSnapshotFor(spawnerTwo, 100),
    ],
    uniquenessSnapshots: [],
    foodEvents: payoffs.map((trade, index) => resolvedTradeEventFor({ id: index + 1, ...trade })),
    events: [],
  });

  const analysis = getSineSessionAnalysis(sessionId);
  assert.ok(analysis);
  const allAgents = analysis.diagnostics.tradeQuality.filters.find((filter: any) => filter.minTrades === 0);
  assert.ok(allAgents);
  assert.equal(allAgents.eligibleAgents, 2);
  assert.equal(allAgents.undefinedSortinoAgents, 1);
  assert.equal(allAgents.agentsAboveSortino075, 1);
  assertClose(allAgents.sortinoSummary.median, 0.8944271909999159);
  assertClose(allAgents.downsideVolatilitySummary.median, 0.5590169943749475);

  const risk = analysis.diagnostics.riskTail;
  assertClose(risk.tradeDownsideVolatility, 0.9128709291752769);
  assertClose(risk.tradeVaR5, -1.75);
  assertClose(risk.tradeCVaR5, -2);
  assertClose(risk.tradeVaR1, -1.95);
  assertClose(risk.tradeCVaR1, -2);
  assert.ok((risk.tradeCVaR5 ?? 0) <= (risk.tradeVaR5 ?? 0));
  assert.ok((risk.tradeCVaR1 ?? 0) <= (risk.tradeVaR1 ?? 0));

  const performance = analysis.diagnostics.tradingPerformance;
  assertClose(performance.bucketDownsideVolatility, 0.9128709291752769);
  assertClose(performance.bucketVaR5, -1.75);
  assertClose(performance.bucketCVaR5, -2);
  assertClose(performance.bucketVaR1, -1.95);
  assertClose(performance.bucketCVaR1, -2);

  const structure = analysis.diagnostics.populationStructure;
  assert.equal(structure.ageSummary.count, 2);
  assert.equal(structure.ageSummary.median, 100);
  assert.equal(structure.ageSummary.max, 100);
  assert.equal(structure.ageHistogram.find((row: any) => row.label === "100-249")?.count, 2);

  const noRiskAgents = analysis.diagnostics.tradeQuality.filters.find((filter: any) => filter.minTrades === 25);
  assert.ok(noRiskAgents);
  assert.equal(noRiskAgents.eligibleAgents, 0);
  assert.equal(noRiskAgents.sortinoSummary.median, null);

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
}

function testSineRepositoryFiltersSavedRunDiagnosticsByPercentRange() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const first = cloneSpawnerWith(founder, { id: 1, lineageId: 1, birthTick: 0 });
  const firstDead = cloneSpawnerWith(first, { energy: DEFAULT_SPAWNER_CONFIG.deathEnergy - 1 });
  const second = cloneSpawnerWith(founder, { id: 2, lineageId: 2, birthTick: 60 });
  const sessionId = uniqueTestSessionId("test-sine-ranged-diagnostics");

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 100,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [
      { tick: 0, spawner: first },
      { tick: 60, spawner: second },
    ],
    deaths: [
      { tick: 75, spawner: firstDead, deathCause: "low_energy", deathEnergyThreshold: DEFAULT_SPAWNER_CONFIG.deathEnergy, deathHealthThreshold: DEFAULT_SPAWNER_CONFIG.deathHealth },
    ],
    genomeSnapshots: [],
    stateSnapshots: [
      stateSnapshotFor(second, 100),
    ],
    uniquenessSnapshots: [],
    foodEvents: [
      resolvedFoodEvent("spawn", 9, first, 1, 3),
      resolvedFoodEvent("resolve", 10, first, 1, 3),
      resolvedFoodEvent("spawn", 69, second, 2, -2),
      resolvedFoodEvent("resolve", 70, second, 2, -2),
    ],
    events: [],
  });

  const full = getSineSessionAnalysis(sessionId);
  const ranged = getSineSessionAnalysis(sessionId, { fromPercent: 50, toPercent: 100 });

  assert.ok(full);
  assert.ok(ranged);
  assert.deepEqual(full.diagnostics.range, { startTick: 0, latestTick: 100, fromPercent: 0, toPercent: 100, fromTick: 0, toTick: 100 });
  assert.equal(full.diagnostics.health.finalPopulation, 1);
  assert.equal(full.diagnostics.health.minPopulation, 1);
  assert.equal(full.diagnostics.health.resolvedTrades, 2);
  assert.equal(full.diagnostics.health.spawnedTrades, 2);
  assert.equal(full.diagnostics.health.pendingTrades, 0);
  assert.equal(full.diagnostics.health.wins, 1);
  assert.equal(full.diagnostics.health.losses, 1);
  assert.equal(full.diagnostics.health.cumulativePayoff, 1);
  assert.equal(full.diagnostics.tradingPerformance.bucketSeries.length, 2);
  assert.deepEqual(
    full.diagnostics.tradingPerformance.bucketSeries.map((row: any) => ({
      bucketStartTick: row.bucketStartTick,
      bucketEndTick: row.bucketEndTick,
      trades: row.trades,
      wins: row.wins,
      totalPayoff: row.totalPayoff,
    })),
    [
      { bucketStartTick: 10, bucketEndTick: 14, trades: 1, wins: 1, totalPayoff: 3 },
      { bucketStartTick: 70, bucketEndTick: 74, trades: 1, wins: 0, totalPayoff: -2 },
    ],
  );
  assert.deepEqual(
    full.diagnostics.resilience.deathCauseSeries.map((row: any) => ({
      bucketStartTick: row.bucketStartTick,
      bucketEndTick: row.bucketEndTick,
      lowEnergyDeaths: row.lowEnergyDeaths,
      lowHealthDeaths: row.lowHealthDeaths,
      bothDeaths: row.bothDeaths,
      unknownDeaths: row.unknownDeaths,
    })),
    [
      { bucketStartTick: 75, bucketEndTick: 79, lowEnergyDeaths: 1, lowHealthDeaths: 0, bothDeaths: 0, unknownDeaths: 0 },
    ],
  );
  assert.equal(full.diagnostics.resilience.churnBuckets.length, 3);
  assert.equal(full.diagnostics.riskTail.payoffHistogram.find((row: any) => row.label === "1..2")?.count, 0);
  assert.equal(full.diagnostics.riskTail.payoffHistogram.find((row: any) => row.label === ">=2")?.count, 1);
  assert.equal(full.diagnostics.riskTail.payoffHistogram.find((row: any) => row.label === "-2..-1")?.count, 1);
  assert.equal(full.diagnostics.riskTail.payoffHistogram.find((row: any) => row.label === "<-2")?.count, 0);
  assert.equal(full.diagnostics.riskTail.byDirection.find((row: any) => row.direction === "long")?.trades, 2);
  assert.equal(full.diagnostics.populationStructure.ageHistogram.reduce((sum: number, row: any) => sum + row.count, 0), 2);
  assert.deepEqual(ranged.diagnostics.range, { startTick: 0, latestTick: 100, fromPercent: 50, toPercent: 100, fromTick: 50, toTick: 100 });
  assert.equal(full.diagnostics.health.resolvedTrades, 2);
  assert.equal(ranged.diagnostics.health.latestTick, 100);
  assert.equal(ranged.diagnostics.health.resolvedTrades, 1);
  assert.equal(ranged.diagnostics.health.spawnedTrades, 1);
  assert.equal(ranged.diagnostics.health.finalPopulation, 1);
  assert.equal(ranged.diagnostics.health.minPopulation, 1);
  assert.equal(ranged.diagnostics.resilience.maxPopulation, 2);
  assert.equal(ranged.diagnostics.resilience.worstPopulationDrawdown, -1);
  assert.equal(ranged.diagnostics.resilience.deathCauseSeries.reduce((sum: number, row: any) => sum + row.lowEnergyDeaths, 0), 1);
  assert.deepEqual(
    ranged.diagnostics.tradingPerformance.bucketSeries.map((row: any) => ({
      bucketStartTick: row.bucketStartTick,
      bucketEndTick: row.bucketEndTick,
      trades: row.trades,
      wins: row.wins,
      totalPayoff: row.totalPayoff,
    })),
    [
      { bucketStartTick: 68, bucketEndTick: 70, trades: 1, wins: 0, totalPayoff: -2 },
    ],
  );
  assert.equal(ranged.diagnostics.tradingPerformance.worstBucket?.bucketStartTick, 68);
  assert.equal(ranged.diagnostics.tradingPerformance.worstBucket?.totalPayoff, -2);
  assert.equal(ranged.diagnostics.populationStructure.liveLineageCount, 1);
  assert.equal(ranged.diagnostics.populationStructure.topLineageId, 2);
  assertClose(ranged.diagnostics.populationStructure.birthsPer1000Ticks, 20);
  assertClose(ranged.diagnostics.populationStructure.deathsPer1000Ticks, 20);
  assert.equal(ranged.diagnostics.populationStructure.ageSummary.count, 2);
  assertClose(ranged.diagnostics.populationStructure.ageSummary.median, 32.5);
  assert.equal(ranged.diagnostics.populationStructure.ageHistogram.find((row: any) => row.label === "0-99")?.count, 2);
  assert.equal(ranged.diagnostics.riskTail.payoffHistogram.reduce((sum: number, row: any) => sum + row.count, 0), 1);

  const invalidRange = getSineSessionAnalysis(sessionId, { fromPercent: 90, toPercent: 10 });
  assert.equal(invalidRange?.diagnostics.range.fromPercent, 0);
  assert.equal(invalidRange?.diagnostics.range.toPercent, 100);

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
}

function testSineRepositoryFiltersTradeQualityByAgePercentile() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const oldFrequent = cloneSpawnerWith(founder, { id: 1, lineageId: 1, birthTick: 0 });
  const oldInfrequent = cloneSpawnerWith(founder, { id: 2, lineageId: 2, birthTick: 20 });
  const youngFrequent = cloneSpawnerWith(founder, { id: 3, lineageId: 3, birthTick: 90 });
  const sessionId = uniqueTestSessionId("test-sine-trade-quality-age-filter");

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 100,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [
      { tick: oldFrequent.birthTick, spawner: oldFrequent },
      { tick: oldInfrequent.birthTick, spawner: oldInfrequent },
      { tick: youngFrequent.birthTick, spawner: youngFrequent },
    ],
    deaths: [],
    genomeSnapshots: [],
    stateSnapshots: [
      stateSnapshotFor(oldFrequent, 100),
      stateSnapshotFor(oldInfrequent, 100),
      stateSnapshotFor(youngFrequent, 100),
    ],
    uniquenessSnapshots: [],
    foodEvents: [
      ...tradeEventsForAgent(oldFrequent, 1, 60, 51, (index) => (index % 2 === 0 ? 1 : -0.5)),
      ...tradeEventsForAgent(oldInfrequent, 101, 40, 52, (index) => (index % 2 === 0 ? 0.75 : -0.25)),
      ...tradeEventsForAgent(youngFrequent, 201, 60, 91, (index) => (index % 2 === 0 ? 0.5 : -1)),
    ],
    events: [],
  });

  const full = getSineSessionAnalysis(sessionId);
  const ranged = getSineSessionAnalysis(sessionId, { fromPercent: 50, toPercent: 100 });
  assert.ok(full);
  assert.ok(ranged);

  const fullFilters = full.diagnostics.tradeQuality.filters;
  assert.equal(fullFilters.length, 16);
  assert.equal(fullFilters.filter((filter: any) => filter.minTrades === 50).length, 4);
  assert.equal(fullFilters.filter((filter: any) => filter.minAgePercentile === 50).length, 4);

  const allAge50 = tradeQualityFilter(full, 0, 50);
  const trades50NoAge = tradeQualityFilter(full, 50, 0);
  const trades50Age50 = tradeQualityFilter(full, 50, 50);
  const trades50Age75 = tradeQualityFilter(full, 50, 75);
  assert.equal(trades50NoAge.minAgeTicks, 0);
  assert.equal(trades50NoAge.eligibleAgents, 2);
  assert.equal(allAge50.minAgeTicks, 80);
  assert.equal(allAge50.eligibleAgents, 2);
  assert.equal(trades50Age50.minAgeTicks, 80);
  assert.equal(trades50Age50.eligibleAgents, 1);
  assert.equal(trades50Age75.minAgeTicks, 90);
  assert.equal(trades50Age75.eligibleAgents, 1);
  assert.equal(histogramCount(trades50NoAge.averagePayoffHistogram), 2);
  assert.equal(histogramCount(trades50Age50.averagePayoffHistogram), 1);

  const rangedTrades50Age50 = tradeQualityFilter(ranged, 50, 50);
  assert.equal(rangedTrades50Age50.minAgeTicks, 50);
  assert.equal(rangedTrades50Age50.eligibleAgents, 1);

  const empty = tradeQualityFilter(full, 100, 75);
  assert.equal(empty.eligibleAgents, 0);
  assert.equal(empty.sharpeSummary.median, null);

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
}

function testSineRepositoryDerivesDeathCauseSeries() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const sessionId = uniqueTestSessionId("test-sine-death-causes");
  const spawners = [0, 1, 2].map((index) => cloneSpawnerWith(founder, { id: index + 1, lineageId: index + 1 }));
  const [lowEnergy, lowHealth, both] = spawners;
  assert.ok(lowEnergy);
  assert.ok(lowHealth);
  assert.ok(both);
  lowEnergy.energy = DEFAULT_SPAWNER_CONFIG.deathEnergy - 1;
  lowEnergy.health = DEFAULT_SPAWNER_CONFIG.deathHealth + 50;
  lowHealth.energy = DEFAULT_SPAWNER_CONFIG.deathEnergy + 50;
  lowHealth.health = DEFAULT_SPAWNER_CONFIG.deathHealth;
  both.energy = DEFAULT_SPAWNER_CONFIG.deathEnergy;
  both.health = DEFAULT_SPAWNER_CONFIG.deathHealth;

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 30,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: spawners.map((spawner) => ({ tick: 0, spawner })),
    deaths: [
      { tick: 5, spawner: lowEnergy, deathCause: "low_energy", deathEnergyThreshold: DEFAULT_SPAWNER_CONFIG.deathEnergy, deathHealthThreshold: DEFAULT_SPAWNER_CONFIG.deathHealth },
      { tick: 10, spawner: lowHealth, deathCause: "low_health", deathEnergyThreshold: DEFAULT_SPAWNER_CONFIG.deathEnergy, deathHealthThreshold: DEFAULT_SPAWNER_CONFIG.deathHealth },
      { tick: 15, spawner: both, deathCause: "both", deathEnergyThreshold: DEFAULT_SPAWNER_CONFIG.deathEnergy, deathHealthThreshold: DEFAULT_SPAWNER_CONFIG.deathHealth },
    ],
    genomeSnapshots: spawners.map((spawner) => ({ tick: 0, reason: "initial", spawner })),
    stateSnapshots: [],
    uniquenessSnapshots: [],
    foodEvents: [],
    events: [],
  });

  const storedCauses = sineDb
    .prepare("SELECT death_cause FROM sine_spawner_deaths WHERE session_id = ? ORDER BY death_tick ASC")
    .all(sessionId)
    .map((row: any) => row.death_cause);
  const analysis = getSineSessionAnalysis(sessionId);
  const deathCauseSeries = analysis?.diagnostics.resilience.deathCauseSeries ?? [];
  const totals = deathCauseSeries.reduce(
    (
      sum: { lowEnergyDeaths: number; lowHealthDeaths: number; bothDeaths: number; unknownDeaths: number },
      row: { lowEnergyDeaths: number; lowHealthDeaths: number; bothDeaths: number; unknownDeaths: number },
    ) => ({
      lowEnergyDeaths: sum.lowEnergyDeaths + row.lowEnergyDeaths,
      lowHealthDeaths: sum.lowHealthDeaths + row.lowHealthDeaths,
      bothDeaths: sum.bothDeaths + row.bothDeaths,
      unknownDeaths: sum.unknownDeaths + row.unknownDeaths,
    }),
    { lowEnergyDeaths: 0, lowHealthDeaths: 0, bothDeaths: 0, unknownDeaths: 0 },
  );

  assert.deepEqual(storedCauses, ["low_energy", "low_health", "both"]);
  assert.deepEqual(totals, { lowEnergyDeaths: 1, lowHealthDeaths: 1, bothDeaths: 1, unknownDeaths: 0 });
  assert.equal(analysis?.diagnostics.resilience.unknownDeathCauses, 0);
}

function testSineRepositoryUsesAbsoluteTopLineagePayoffShare() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const losingLarge = cloneSpawnerWith(founder, { id: 1, lineageId: 1 });
  const losingSmall = cloneSpawnerWith(founder, { id: 2, lineageId: 2 });
  const winningSmall = cloneSpawnerWith(founder, { id: 3, lineageId: 3 });
  const sessionId = uniqueTestSessionId("test-sine-payoff-share");

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 20,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [
      { tick: 0, spawner: losingLarge },
      { tick: 0, spawner: losingSmall },
      { tick: 0, spawner: winningSmall },
    ],
    deaths: [],
    genomeSnapshots: [],
    stateSnapshots: [],
    uniquenessSnapshots: [],
    foodEvents: [
      resolvedFoodEvent("resolve", 10, losingLarge, 1, -10),
      resolvedFoodEvent("resolve", 11, losingSmall, 2, -5),
      resolvedFoodEvent("resolve", 12, winningSmall, 3, 5),
    ],
    events: [],
  });

  const analysis = getSineSessionAnalysis(sessionId);

  assert.equal(analysis?.diagnostics.populationStructure.topLineagePayoffLineageId, 3);
  assertClose(analysis?.diagnostics.populationStructure.topLineagePayoffShare, 0.25);
  deleteSineSession(sessionId);
}

function tradeQualityFilter(analysis: NonNullable<ReturnType<typeof getSineSessionAnalysis>>, minTrades: number, minAgePercentile: number) {
  const filter = analysis.diagnostics.tradeQuality.filters.find((row: any) => row.minTrades === minTrades && row.minAgePercentile === minAgePercentile);
  assert.ok(filter, `Missing trade-quality filter ${minTrades}/${minAgePercentile}`);
  return filter;
}

function histogramCount(rows: Array<{ count: number }>) {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

function assertClose(actual: number | null | undefined, expected: number, epsilon = 1e-9) {
  assert.equal(typeof actual, "number");
  if (typeof actual !== "number") throw new Error(`Expected number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

export const tests: SineTest[] = [
  { name: "Sine Repository Derives Saved Run Risk Diagnostics", run: testSineRepositoryDerivesSavedRunRiskDiagnostics },
  { name: "Sine Repository Filters Saved Run Diagnostics By Percent Range", run: testSineRepositoryFiltersSavedRunDiagnosticsByPercentRange },
  { name: "Sine Repository Filters Trade Quality By Age Percentile", run: testSineRepositoryFiltersTradeQualityByAgePercentile },
  { name: "Sine Repository Derives Death Cause Series", run: testSineRepositoryDerivesDeathCauseSeries },
  { name: "Sine Repository Uses Absolute Top Lineage Payoff Share", run: testSineRepositoryUsesAbsoluteTopLineagePayoffShare },
];
