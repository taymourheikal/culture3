import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, getSineSessionAnalysis, getSineSessionCohortAnalysis, saveSinePersistenceBatch } from "../../server/sineRepository.mjs";
// @ts-expect-error The market DB is runtime ESM loaded by tsx for integration coverage.
import { marketDataDb } from "../../server/marketDataDb.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";
import { cloneSpawnerWith, stateSnapshotFor, tradeEventsForAgent } from "./sinePersistenceFixtures";

function testSineRepositoryDerivesFilteredCohortAnalysis() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const oldFrequent = cloneSpawnerWith(founder, { id: 1, lineageId: 1, birthTick: 0 });
  const oldInfrequent = cloneSpawnerWith(founder, { id: 2, lineageId: 2, birthTick: 20 });
  const youngFrequent = cloneSpawnerWith(founder, { id: 3, lineageId: 3, birthTick: 90 });
  const sessionId = uniqueTestSessionId("test-sine-cohort-analysis");

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

  const diagnostics = getSineSessionAnalysis(sessionId);
  const cohort = getSineSessionCohortAnalysis(sessionId, { minTrades: 50, minAgePercentile: 50, bucketCount: 20 });
  assert.ok(diagnostics);
  assert.ok(cohort);
  const matchingFilter = tradeQualityFilter(diagnostics, 50, 50);
  assert.equal(cohort.filter.eligibleAgents, matchingFilter.eligibleAgents);
  assert.equal(cohort.filter.minAgeTicks, matchingFilter.minAgeTicks);
  assert.equal(cohort.bucketCount, 20);
  assert.deepEqual(
    cohort.timeline.slice(0, 3).map((row: any) => ({
      index: row.index,
      bucketStartTick: row.bucketStartTick,
      bucketEndTick: row.bucketEndTick,
      trades: row.trades,
      uniqueAgents: row.uniqueAgents,
      hitRate: row.hitRate,
      totalPayoff: row.totalPayoff,
      trend: row.trend,
      volatility: row.volatility,
    })),
    [
      { index: 0, bucketStartTick: 0, bucketEndTick: 4, trades: 0, uniqueAgents: 0, hitRate: null, totalPayoff: 0, trend: "unknown", volatility: "unknown" },
      { index: 1, bucketStartTick: 5, bucketEndTick: 9, trades: 0, uniqueAgents: 0, hitRate: null, totalPayoff: 0, trend: "unknown", volatility: "unknown" },
      { index: 2, bucketStartTick: 10, bucketEndTick: 14, trades: 0, uniqueAgents: 0, hitRate: null, totalPayoff: 0, trend: "unknown", volatility: "unknown" },
    ],
  );
  assert.equal(cohort.concentration.totalTrades, 60);
  assert.equal(cohort.concentration.activeAgents, 1);
  assert.equal(cohort.concentration.activeBucketCount, 1);
  assertClose(cohort.concentration.activeBucketCoverage, 0.05);
  assertClose(cohort.concentration.topAgentTradeShare, 1);
  assertClose(cohort.concentration.topAgentAbsolutePayoffShare, 1);
  assertClose(cohort.concentration.topLineageTradeShare, 1);
  assert.equal(cohort.timeline.find((row: any) => row.trades > 0)?.bucketStartTick, 50);
  assert.equal(cohort.timeline.find((row: any) => row.trades > 0)?.bucketEndTick, 54);
  assertClose(cohort.timeline.find((row: any) => row.trades > 0)?.hitRate, 0.5);
  assertClose(cohort.timeline.find((row: any) => row.trades > 0)?.totalPayoff, 15);
  assert.equal(cohort.timeline.reduce((sum: number, row: any) => sum + row.trades, 0), 60);
  assert.equal(cohort.regimeGrid.reduce((sum: number, row: any) => sum + row.trades, 0), 60);
  assert.equal(cohort.regimeGrid.find((row: any) => row.trend === "unknown" && row.volatility === "unknown")?.trades, 60);
  assert.equal(cohort.market.regimeStatus, "unknown");
  assert.equal(cohort.timeline.some((row: any) => row.agentIds), false);
  assert.equal(Number.isFinite(cohort.concentration.timingOverlapScore), true);

  const empty = getSineSessionCohortAnalysis(sessionId, { minTrades: 100, minAgePercentile: 75, bucketCount: 20 });
  assert.ok(empty);
  assert.equal(empty.filter.eligibleAgents, 0);
  assert.equal(empty.concentration.totalTrades, 0);
  assert.equal(empty.timeline.length, 20);
  assert.equal(empty.timeline.every((row: any) => row.trades === 0 && row.hitRate === null), true);
  assert.equal(empty.regimeGrid.reduce((sum: number, row: any) => sum + row.trades, 0), 0);

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
}

function testSineRepositoryDerivesCohortRegimesFromBtcCandles() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const spawner = cloneSpawnerWith(founder, { id: 1, lineageId: 1, birthTick: 0 });
  const availableSessionId = uniqueTestSessionId("test-sine-cohort-btc-available");
  const partialSessionId = uniqueTestSessionId("test-sine-cohort-btc-partial");
  const missingSessionId = uniqueTestSessionId("test-sine-cohort-btc-missing");
  const source = "btcusd_5m";
  const startTimestamp = 4_100_000_000;
  const cleanupEndTimestamp = startTimestamp + 60_000;
  const cleanup = marketDataDb.prepare("DELETE FROM market_candles WHERE source = ? AND timestamp BETWEEN ? AND ?");
  const insert = marketDataDb.prepare(`
    INSERT OR REPLACE INTO market_candles (source, timestamp, datetime, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedCandles = (count: number) => {
    cleanup.run(source, startTimestamp, cleanupEndTimestamp);
    for (let index = 0; index < count; index += 1) {
      const timestamp = startTimestamp + index * 300;
      const close = 100 + index * 0.25 + Math.sin(index / 3) * 0.2;
      insert.run(source, timestamp, new Date(timestamp * 1000).toISOString(), close - 0.1, close + 0.2, close - 0.2, close, 10 + index);
    }
  };
  const saveCohortSession = (sessionId: string, start = startTimestamp) => {
    saveSinePersistenceBatch({
      persistentSessionId: sessionId,
      tick: 100,
      marketConfig: {
        source,
        generated: INITIAL_SETTINGS,
        playback: { rocLengthBars: 50, startDateTime: new Date(start * 1000).toISOString(), generatedTicksPerSecond: 5, barsPerSecond: 30 },
      },
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      births: [{ tick: spawner.birthTick, spawner }],
      deaths: [],
      genomeSnapshots: [],
      stateSnapshots: [stateSnapshotFor(spawner, 100)],
      uniquenessSnapshots: [],
      foodEvents: tradeEventsForAgent(spawner, 1, 60, 51, (index) => (index % 2 === 0 ? 1 : -0.5)),
      events: [],
    });
  };

  let marketTransactionOpen = false;
  try {
    marketDataDb.exec("BEGIN");
    marketTransactionOpen = true;
    seedCandles(120);
    saveCohortSession(availableSessionId);
    const available = getSineSessionCohortAnalysis(availableSessionId, { minTrades: 50, minAgePercentile: 0, bucketCount: 20 });
    assert.ok(available);
    assert.equal(available.market.regimeStatus, "available");
    assert.equal(available.timeline.some((row: any) => row.trend !== "unknown" && row.volatility !== "unknown"), true);
    assert.equal(available.regimeGrid.reduce((sum: number, row: any) => sum + row.trades, 0), available.concentration.totalTrades);

    seedCandles(60);
    saveCohortSession(partialSessionId);
    const partial = getSineSessionCohortAnalysis(partialSessionId, { minTrades: 50, minAgePercentile: 0, bucketCount: 20 });
    assert.ok(partial);
    assert.equal(partial.market.regimeStatus, "partial");
    assert.equal(partial.timeline.some((row: any) => row.trend !== "unknown" && row.volatility !== "unknown"), true);
    assert.equal(partial.timeline.some((row: any) => row.trend === "unknown" || row.volatility === "unknown"), true);

    cleanup.run(source, startTimestamp, cleanupEndTimestamp);
    saveCohortSession(missingSessionId);
    const missing = getSineSessionCohortAnalysis(missingSessionId, { minTrades: 50, minAgePercentile: 0, bucketCount: 20 });
    assert.ok(missing);
    assert.equal(missing.market.regimeStatus, "missing");
  } finally {
    deleteSineSession(availableSessionId);
    deleteSineSession(partialSessionId);
    deleteSineSession(missingSessionId);
    if (marketTransactionOpen) {
      marketDataDb.exec("ROLLBACK");
    }
  }
}

function tradeQualityFilter(analysis: NonNullable<ReturnType<typeof getSineSessionAnalysis>>, minTrades: number, minAgePercentile: number) {
  const filter = analysis.diagnostics.tradeQuality.filters.find((row: any) => row.minTrades === minTrades && row.minAgePercentile === minAgePercentile);
  assert.ok(filter, `Missing trade-quality filter ${minTrades}/${minAgePercentile}`);
  return filter;
}

function assertClose(actual: number | null | undefined, expected: number, epsilon = 1e-9) {
  assert.equal(typeof actual, "number");
  if (typeof actual !== "number") throw new Error(`Expected number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

export const tests: SineTest[] = [
  { name: "Sine Repository Derives Filtered Cohort Analysis", run: testSineRepositoryDerivesFilteredCohortAnalysis },
  { name: "Sine Repository Derives Cohort Regimes From Btc Candles", run: testSineRepositoryDerivesCohortRegimesFromBtcCandles },
];

