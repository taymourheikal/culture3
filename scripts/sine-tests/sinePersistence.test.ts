import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import {
  DEFAULT_SPAWNER_CONFIG,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
  computeSpawnerUniqueness,
  type SpawnerAgent,
  type SpawnerEvent,
} from "../../src/sine/spawnerSimulation";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import { buildSinePersistencePacket } from "../../src/sine/persistence/buildSinePersistencePacket";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, getSineSessionAnalysis, getSineSessionCohortAnalysis, getSineSpawnerInspection, listSineSessions, saveSinePersistenceBatch, updateSineSessionStatus, upsertSineSession } from "../../server/sineRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../../server/sineDb.mjs";
// @ts-expect-error The market DB is runtime ESM loaded by tsx for integration coverage.
import { marketDataDb } from "../../server/marketDataDb.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";
import { persistenceBatchForSpawner, resolvedFoodEvent, stateSnapshotFor, tradeEventsForAgent } from "./sinePersistenceFixtures";

function testSineRepositoryPersistsAndReconstructsSpawner() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine");

  upsertSineSession({ id: sessionId, settings: INITIAL_SETTINGS, spawnerConfig: DEFAULT_SPAWNER_CONFIG });
  const result = saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: simulation.world.tick,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [{ tick: spawner.birthTick, spawner }],
    deaths: [],
    genomeSnapshots: [{ tick: spawner.birthTick, reason: "initial", spawner }],
    stateSnapshots: [stateSnapshotFor(spawner, simulation.world.tick)],
    uniquenessSnapshots: [{ spawnerId: spawner.id, ...uniqueness }],
    foodEvents: [],
    events: [],
  });
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.equal(result.ok, true);
  assert.ok(inspection);
  assert.equal(inspection?.source, "historical");
  assert.equal(inspection?.sessionId, sessionId);
  assert.equal(inspection?.spawnerId, spawner.id);
  assert.equal(inspection?.exact, true);
  assert.equal(inspection?.genome.units.length, spawner.genome.units.length);
  assert.deepEqual(inspection?.genome.perception, spawner.genome.perception);
  assert.deepEqual(inspection?.genome.mutationProfile, spawner.genome.mutationProfile);
  assert.deepEqual(inspection?.spawner.learnedState.connectionDeltas, {});
  assert.equal(inspection?.spawner.learnedState.learningUpdateCount, 0);
  assert.equal(inspection?.stateSnapshotTick, simulation.world.tick);
  assert.equal(inspection?.uniqueness?.version, uniqueness.version);
  assert.equal(inspection?.uniqueness?.vectorVersion, uniqueness.vectorVersion);
  assert.equal(inspection?.uniqueness?.score, uniqueness.score);
  assert.equal(inspection?.uniqueness?.comparisonPopulationSize, uniqueness.comparisonPopulationSize);
  assert.ok(Array.isArray(inspection?.uniqueness?.mostDissimilarFeatures));
}

function testSineRepositoryNormalizesLegacyGenomeWithoutPerceptionFields() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const legacySpawner = structuredClone(spawner) as any;
  delete legacySpawner.genome.perception;
  delete legacySpawner.genome.mutationProfile;
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-legacy-genome");

  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, legacySpawner, uniqueness));
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.ok(inspection);
  assert.equal(inspection?.genome.perception.deltaLagPairs.length, 5);
  assert(Number.isFinite(inspection?.genome.mutationProfile.weightMutationStdDev));
}

function testSineRepositoryReturnsNullForUnknownSpawner() {
  const sessionId = uniqueTestSessionId("test-sine");
  upsertSineSession({ id: sessionId, settings: INITIAL_SETTINGS, spawnerConfig: DEFAULT_SPAWNER_CONFIG });
  assert.equal(getSineSpawnerInspection(sessionId, 999999, 0), null);
}

function testSineRepositoryUpsertsRicherUniquenessDetail() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = uniqueTestSessionId("test-sine-upsert");
  const lightweight = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  const detailed = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick, { detailSpawnerId: spawner.id }).get(spawner.id);
  assert.ok(lightweight);
  assert.ok(detailed);
  assert.equal(lightweight.mostDissimilarFeatures.length, 0);
  assert.ok(detailed.mostDissimilarFeatures.length > 0);

  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, spawner, lightweight));
  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, spawner, detailed, false));
  const upgraded = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  assert.ok((upgraded?.uniqueness?.mostDissimilarFeatures.length ?? 0) > 0);

  saveSinePersistenceBatch(persistenceBatchForSpawner(sessionId, simulation, spawner, lightweight, false));
  const stillDetailed = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  assert.ok((stillDetailed?.uniqueness?.mostDissimilarFeatures.length ?? 0) > 0);
}

function testSineRepositoryPreservesStoppedStatusAndAnalyzesRuns() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-lifecycle");

  saveSinePersistenceBatch({ ...persistenceBatchForSpawner(sessionId, simulation, spawner, uniqueness), status: "stopped" });
  saveSinePersistenceBatch({ ...persistenceBatchForSpawner(sessionId, simulation, spawner, uniqueness, false), status: "running" });

  const saved = listSineSessions(200).find((session: any) => session.id === sessionId);
  assert.equal(saved?.status, "stopped");
  assert.equal(saved?.latestTick, simulation.world.tick);

  const analysis = getSineSessionAnalysis(sessionId);
  assert.ok(analysis);
  assert.equal(analysis.session.status, "stopped");
  assert.equal(analysis.diagnostics.health.latestTick, simulation.world.tick);
  assert.equal(analysis.diagnostics.health.finalPopulation, 1);
  assert.equal(analysis.diagnostics.health.resolvedTrades, 0);
  assert.equal(analysis.diagnostics.health.spawnedTrades, 0);
  assert.equal(analysis.diagnostics.health.hitRate, 0);
  assert.equal(analysis.diagnostics.health.averagePayoff, 0);
  assert.ok(analysis.diagnostics.resilience.populationSeries.length > 0);
  assert.equal(analysis.diagnostics.populationStructure.liveLineageCount, 1);
  assert.equal(analysis.diagnostics.tradeQuality.filters.find((filter: any) => filter.minTrades === 50)?.eligibleAgents, 0);

  const paused = updateSineSessionStatus(sessionId, "paused");
  assert.equal(paused.ok, true);
  assert.equal(listSineSessions(200).find((session: any) => session.id === sessionId)?.status, "paused");

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
  assert.equal(getSineSessionAnalysis(sessionId), null);
}

function testSineRepositoryDerivesSavedRunRiskDiagnostics() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const spawnerTwo = structuredClone(spawner) as SpawnerAgent;
  spawnerTwo.id = spawner.id + 1;
  spawnerTwo.lineageId = spawner.lineageId + 1;
  const sessionId = uniqueTestSessionId("test-sine-risk-diagnostics");
  const payoffs = [
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 1, payoff: 3, direction: "long" },
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 6, payoff: -1, direction: "long" },
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 11, payoff: 4, direction: "short" },
    { spawnerId: spawner.id, lineageId: spawner.lineageId, tick: 16, payoff: -2, direction: "short" },
    { spawnerId: spawnerTwo.id, lineageId: spawnerTwo.lineageId, tick: 21, payoff: 1, direction: "long" },
    { spawnerId: spawnerTwo.id, lineageId: spawnerTwo.lineageId, tick: 26, payoff: 2, direction: "short" },
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
    foodEvents: payoffs.map((trade, index) => ({
      kind: "resolve",
      tick: trade.tick,
      time: trade.tick,
      food: {
        id: index + 1,
        creatorSpawnerId: trade.spawnerId,
        creatorLineageId: trade.lineageId,
        spawnTick: Math.max(0, trade.tick - 1),
        resolveTick: trade.tick,
        payoff: trade.payoff,
        status: trade.payoff > 0 ? "win" : "loss",
        direction: trade.direction,
        strength: 1,
        horizonTicks: 1,
      },
    })),
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
  const first = structuredClone(founder) as SpawnerAgent;
  first.id = 1;
  first.lineageId = 1;
  first.birthTick = 0;
  const firstDead = structuredClone(first) as SpawnerAgent;
  firstDead.energy = DEFAULT_SPAWNER_CONFIG.deathEnergy - 1;
  const second = structuredClone(founder) as SpawnerAgent;
  second.id = 2;
  second.lineageId = 2;
  second.birthTick = 60;
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
  const oldFrequent = structuredClone(founder) as SpawnerAgent;
  oldFrequent.id = 1;
  oldFrequent.lineageId = 1;
  oldFrequent.birthTick = 0;
  const oldInfrequent = structuredClone(founder) as SpawnerAgent;
  oldInfrequent.id = 2;
  oldInfrequent.lineageId = 2;
  oldInfrequent.birthTick = 20;
  const youngFrequent = structuredClone(founder) as SpawnerAgent;
  youngFrequent.id = 3;
  youngFrequent.lineageId = 3;
  youngFrequent.birthTick = 90;
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

function testSineRepositoryDerivesFilteredCohortAnalysis() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const oldFrequent = structuredClone(founder) as SpawnerAgent;
  oldFrequent.id = 1;
  oldFrequent.lineageId = 1;
  oldFrequent.birthTick = 0;
  const oldInfrequent = structuredClone(founder) as SpawnerAgent;
  oldInfrequent.id = 2;
  oldInfrequent.lineageId = 2;
  oldInfrequent.birthTick = 20;
  const youngFrequent = structuredClone(founder) as SpawnerAgent;
  youngFrequent.id = 3;
  youngFrequent.lineageId = 3;
  youngFrequent.birthTick = 90;
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
  const spawner = structuredClone(founder) as SpawnerAgent;
  spawner.id = 1;
  spawner.lineageId = 1;
  spawner.birthTick = 0;
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

function testSineRepositoryStoresMarketRuntimeConfigForHistoricalRuns() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-market-config");
  const marketConfig = {
    source: "btcusd_5m",
    generated: INITIAL_SETTINGS,
    playback: { rocLengthBars: 50, startDateTime: "2021-01-01T00:00", barsPerSecond: 30 },
  };

  saveSinePersistenceBatch({ ...persistenceBatchForSpawner(sessionId, simulation, spawner, uniqueness), marketConfig });
  const saved = listSineSessions(200).find((session: any) => session.id === sessionId);
  const analysis = getSineSessionAnalysis(sessionId);

  assert.equal(saved?.settings.source, "btcusd_5m");
  assert.equal(saved?.settings.playback.rocLengthBars, 50);
  assert.equal(analysis?.session.settings.source, "btcusd_5m");
}

function testSineRepositoryStoresIndexedPlasticityAndLearnedState() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  spawner.learnedState.connectionDeltas["7"] = 0.3;
  spawner.learnedState.recentLearningSignal = -0.2;
  spawner.learnedState.learningUpdateCount = 3;
  spawner.learnedState.reproductionLearningCount = 1;
  spawner.genome.plasticityProfile = {
    ...spawner.genome.plasticityProfile,
    weightLearningRate: 0.04,
    biasLearningRate: 0.02,
    experienceDecayRate: 0.1,
    maxLearnedDelta: 6,
  };
  const uniqueness = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick).get(spawner.id);
  assert.ok(uniqueness);
  const sessionId = uniqueTestSessionId("test-sine-learning-columns");

  const batch = persistenceBatchForSpawner(sessionId, simulation, spawner, uniqueness) as any;
  batch.stateSnapshots[0].age = 17;
  batch.stateSnapshots[0].cooldown = 3;
  batch.stateSnapshots[0].learnedState = spawner.learnedState;
  batch.stateSnapshots[0].learnedDeltaNorm = 0.3;
  batch.stateSnapshots[0].recentLearningSignal = -0.2;
  batch.stateSnapshots[0].learningUpdateCount = 3;
  batch.stateSnapshots[0].reproductionLearningCount = 1;
  batch.stateSnapshots[0].plasticityProfile = spawner.genome.plasticityProfile;
  batch.stateSnapshots[0].plasticityLearningRateMean = 0.03;
  batch.stateSnapshots[0].plasticityDecayRate = 0.1;
  batch.stateSnapshots[0].plasticityMaxLearnedDelta = 6;

  saveSinePersistenceBatch(batch);
  const stateRow = sineDb
    .prepare("SELECT learned_delta_norm, recent_learning_signal, learning_update_count, reproduction_learning_count, plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta, learned_state_json, plasticity_profile_json FROM sine_spawner_state_snapshots WHERE session_id = ? AND spawner_id = ?")
    .get(sessionId, spawner.id) as any;
  const birthRow = sineDb
    .prepare("SELECT plasticity_profile_json, plasticity_learning_rate_mean, plasticity_decay_rate, plasticity_max_learned_delta FROM sine_spawner_births WHERE session_id = ? AND spawner_id = ?")
    .get(sessionId, spawner.id) as any;
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);

  assert.equal(stateRow.learned_delta_norm, 0.3);
  assert.equal(stateRow.recent_learning_signal, -0.2);
  assert.equal(stateRow.learning_update_count, 3);
  assert.equal(stateRow.reproduction_learning_count, 1);
  assert.equal(stateRow.plasticity_learning_rate_mean, 0.03);
  assert.equal(stateRow.plasticity_decay_rate, 0.1);
  assert.equal(stateRow.plasticity_max_learned_delta, 6);
  assert.equal(JSON.parse(stateRow.learned_state_json).connectionDeltas["7"], 0.3);
  assert.equal(JSON.parse(stateRow.plasticity_profile_json).weightLearningRate, 0.04);
  assert.equal(JSON.parse(birthRow.plasticity_profile_json).biasLearningRate, 0.02);
  assert.equal(birthRow.plasticity_learning_rate_mean, 0.03);
  assert.equal(birthRow.plasticity_decay_rate, 0.1);
  assert.equal(birthRow.plasticity_max_learned_delta, 6);
  assert.equal(inspection?.spawner.ageTicks, 17);
  assert.equal(inspection?.spawner.cooldownTicks, 3);
  assert.equal(inspection?.spawner.learnedState.connectionDeltas["7"], 0.3);
}

function testSineRepositoryPersistsLearningProducedByRun() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 1,
    maxSpawners: 1,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
    minimumSpawnEnergySurplus: 0,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0.25,
    plasticityMaxLearnedDelta: 10,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const events: SpawnerEvent[] = [];
  simulation.world.eventSink = (event) => events.push(structuredClone(event));
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.minHorizonTicks = 1;
  spawner.genome.maxHorizonTicks = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
  );

  advanceSimulationToTarget(simulation, 1, 10);
  advanceSimulationToTarget(simulation, 2, 10);

  assert.equal(simulation.world.totalResolved, 1);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
  const learnedKeys = Object.keys(spawner.learnedState.connectionDeltas).length + Object.keys(spawner.learnedState.outputBiasDeltas).length;
  assert(learnedKeys > 0);

  const sessionId = uniqueTestSessionId("test-sine-learning-run");
  const packet = buildSinePersistencePacket({
    sessionId: 1,
    persistentSessionId: sessionId,
    simulation,
    settings: INITIAL_SETTINGS,
    marketConfig: simulation.marketConfig,
    spawnerConfig: simulation.world.config,
    events,
    includeInitial: true,
    includeStateSnapshot: true,
    pendingUniquenessSnapshots: [],
    uniquenessScores: new Map(),
    includeFullUniquenessTick: null,
  });

  saveSinePersistenceBatch(packet);
  const stateRow = sineDb
    .prepare("SELECT learned_delta_norm, learning_update_count, learned_state_json FROM sine_spawner_state_snapshots WHERE session_id = ? AND spawner_id = ?")
    .get(sessionId, spawner.id) as any;
  const inspection = getSineSpawnerInspection(sessionId, spawner.id, simulation.world.tick);
  const analysis = getSineSessionAnalysis(sessionId);

  assert(stateRow.learned_delta_norm > 0);
  assert.equal(stateRow.learning_update_count, 1);
  assert(Object.keys(JSON.parse(stateRow.learned_state_json).connectionDeltas).length > 0);
  assert.equal(inspection?.spawner.learnedState.learningUpdateCount, 1);
  assert.equal(analysis?.diagnostics.health.finalPopulation, 1);
  assert.equal(analysis?.diagnostics.populationStructure.liveLineageCount, 1);
}

function testSineRepositoryUsesDeathSnapshotAfterDeath() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = uniqueTestSessionId("test-sine-death-snapshot");
  const liveSpawner = structuredClone(spawner);
  liveSpawner.energy = 50;
  liveSpawner.health = 60;
  liveSpawner.ageTicks = 1;
  const deadSpawner = structuredClone(spawner);
  deadSpawner.energy = -5;
  deadSpawner.health = 0;
  deadSpawner.ageTicks = 2;

  saveSinePersistenceBatch({
    persistentSessionId: sessionId,
    tick: 3,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: [{ tick: spawner.birthTick, spawner }],
    deaths: [{ tick: 2, spawner: deadSpawner }],
    genomeSnapshots: [{ tick: spawner.birthTick, reason: "initial", spawner }],
    stateSnapshots: [
      stateSnapshotFor(liveSpawner, 1),
      { ...stateSnapshotFor(liveSpawner, 3), energy: 99, health: 99, age: 3 },
    ],
    uniquenessSnapshots: [],
    foodEvents: [],
    events: [],
  });

  const beforeDeath = getSineSpawnerInspection(sessionId, spawner.id, 1);
  const afterDeath = getSineSpawnerInspection(sessionId, spawner.id, 3);
  const latest = getSineSpawnerInspection(sessionId, spawner.id, null);
  const beforeBirth = getSineSpawnerInspection(sessionId, spawner.id, -1);

  assert.equal(beforeBirth, null);
  assert.equal(beforeDeath?.status, "historical");
  assert.equal(beforeDeath?.spawner.energy, 50);
  assert.equal(beforeDeath?.requestedTick, 1);
  assert.equal(beforeDeath?.exact, true);
  assert.equal(beforeDeath?.stateSnapshotTick, 1);
  assert.equal(beforeDeath?.genomeSnapshotTick, 0);
  assert.equal(afterDeath?.status, "dead");
  assert.equal(afterDeath?.spawner.energy, -5);
  assert.equal(afterDeath?.spawner.health, 0);
  assert.equal(afterDeath?.requestedTick, 3);
  assert.equal(afterDeath?.tick, 2);
  assert.equal(afterDeath?.exact, false);
  assert.equal(afterDeath?.stateSnapshotTick ?? null, null);
  assert.equal(latest?.status, "dead");
  assert.equal(latest?.spawner.energy, -5);
}

function testSineRepositoryDerivesDeathCauseSeries() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const sessionId = uniqueTestSessionId("test-sine-death-causes");
  const spawners = [0, 1, 2].map((index) => ({
    ...structuredClone(founder),
    id: index + 1,
    lineageId: index + 1,
  }));
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
  { name: "Sine Repository Persists And Reconstructs Spawner", run: testSineRepositoryPersistsAndReconstructsSpawner },
  { name: "Sine Repository Normalizes Legacy Genome Without Perception Fields", run: testSineRepositoryNormalizesLegacyGenomeWithoutPerceptionFields },
  { name: "Sine Repository Returns Null For Unknown Spawner", run: testSineRepositoryReturnsNullForUnknownSpawner },
  { name: "Sine Repository Upserts Richer Uniqueness Detail", run: testSineRepositoryUpsertsRicherUniquenessDetail },
  { name: "Sine Repository Preserves Stopped Status And Analyzes Runs", run: testSineRepositoryPreservesStoppedStatusAndAnalyzesRuns },
  { name: "Sine Repository Derives Saved Run Risk Diagnostics", run: testSineRepositoryDerivesSavedRunRiskDiagnostics },
  { name: "Sine Repository Filters Saved Run Diagnostics By Percent Range", run: testSineRepositoryFiltersSavedRunDiagnosticsByPercentRange },
  { name: "Sine Repository Filters Trade Quality By Age Percentile", run: testSineRepositoryFiltersTradeQualityByAgePercentile },
  { name: "Sine Repository Derives Filtered Cohort Analysis", run: testSineRepositoryDerivesFilteredCohortAnalysis },
  { name: "Sine Repository Derives Cohort Regimes From Btc Candles", run: testSineRepositoryDerivesCohortRegimesFromBtcCandles },
  { name: "Sine Repository Stores Market Runtime Config For Historical Runs", run: testSineRepositoryStoresMarketRuntimeConfigForHistoricalRuns },
  { name: "Sine Repository Stores Indexed Plasticity And Learned State", run: testSineRepositoryStoresIndexedPlasticityAndLearnedState },
  { name: "Sine Repository Persists Learning Produced By Run", run: testSineRepositoryPersistsLearningProducedByRun },
  { name: "Sine Repository Uses Death Snapshot After Death", run: testSineRepositoryUsesDeathSnapshotAfterDeath },
  { name: "Sine Repository Derives Death Cause Series", run: testSineRepositoryDerivesDeathCauseSeries },
];
