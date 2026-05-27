import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { MARKET_TIME_MODEL } from "../../src/sine/marketRuntimeConfig";
import {
  CHART_SAMPLE_INTERVAL_TICKS,
  CHART_TICKS_VISIBLE,
  createMarketChartPacket,
  createMarketRosterPacket,
  createMarketStatsPacket,
  createTelemetryWindow,
  createUniquenessTelemetryWindow,
  TELEMETRY_SAMPLE_LIMIT,
  createSpawnerArchitecturePacket,
  createSpawnerInspectionPacket,
  createSpawnerUniquenessDetailPacket,
  estimatePacketKb,
  ROSTER_AGENT_LIMIT,
  selectRosterSpawners,
} from "../../src/sine/marketWorkerSnapshot";
import { DEFAULT_SPAWNER_CONFIG, computeSpawnerUniqueness } from "../../src/sine/spawnerSimulation";
import { downsampleByTick } from "../../src/sine/packets/seriesWindow";
import { advanceSimulationToTarget, createCandleSimulationState, createSimulationState } from "../../src/sine/simulationRuntime";
import type { SineTest } from "./helpers";

function testLeanPacketsContainRenderStateWithoutFullSimulation() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(simulation, 60, 100000);
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const chart = createMarketChartPacket({ sessionId: 7, simulation, version: 3 });
  const roster = createMarketRosterPacket({ sessionId: 7, simulation, version: 3, uniquenessScores });
  const stats = createMarketStatsPacket({
    sessionId: 7,
    simulation,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    playing: true,
    version: 3,
    backlogTicks: 2,
    packetSizesKb: {},
  });

  assert.equal(chart.sessionId, 7);
  assert.ok(chart.signalSamples.length > 0);
  assert.ok(chart.signalSamples.length < 360);
  assert.ok(chart.visibleFoods.length > 0);
  assert.ok(chart.telemetrySamples.length > 0);
  assert.ok(Array.isArray(chart.uniquenessSamples));
  assert.ok(Array.isArray(chart.selectedSpawnerUniquenessSamples));
  assert.equal("simulation" in chart, false);
  assert.equal("timeline" in chart, false);
  assert.equal("world" in chart, false);

  assert.equal(roster.spawners.length, stats.spawnerCount);
  const firstSpawner = roster.spawners[0];
  assert.ok(firstSpawner);
  assert.equal("genome" in firstSpawner, false);
  assert.equal("hiddenState" in firstSpawner, false);
  assert.equal("perception" in firstSpawner, false);
  assert.equal("mutationProfile" in firstSpawner, false);
  assert.notEqual(firstSpawner.uniquenessComparisonTick, null);
  assert.equal(Number.isFinite(firstSpawner.averagePerceptionLag), true);
  assert.equal(Number.isFinite(firstSpawner.longestPerceptionWindow), true);
  assert.equal(Number.isFinite(firstSpawner.pendingDensityScale), true);
  assert.equal(Number.isFinite(firstSpawner.perceptionMutationRate), true);
  assert.equal(stats.settings.frequency, INITIAL_SETTINGS.frequency);
  assert.equal(stats.spawnerConfig.maxSpawners, DEFAULT_SPAWNER_CONFIG.maxSpawners);
  assert.equal(stats.activeSpawnerConfig.maxSpawners, DEFAULT_SPAWNER_CONFIG.maxSpawners);
  assert.equal(stats.pendingSpawnerConfig.maxSpawners, DEFAULT_SPAWNER_CONFIG.maxSpawners);
  assert.equal(Number.isFinite(stats.populationRoomRatio), true);
  assert.equal(Number.isFinite(stats.reproductionCostMultiplier), true);
  assert.equal(Number.isFinite(stats.currentReproductionCost), true);
  assert.equal(Number.isFinite(stats.currentReproductionEnergyRequirement), true);
}

function testStatsPacketSeparatesActiveAndPendingSpawnerConfig() {
  const activeSpawnerConfig = { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 20, maxSpawners: 80 };
  const pendingSpawnerConfig = { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 300, maxSpawners: 300 };
  const simulation = createSimulationState(INITIAL_SETTINGS, activeSpawnerConfig);
  const stats = createMarketStatsPacket({
    sessionId: 9,
    simulation,
    settings: INITIAL_SETTINGS,
    spawnerConfig: activeSpawnerConfig,
    pendingSpawnerConfig,
    playing: false,
    version: 1,
    backlogTicks: 0,
    packetSizesKb: {},
  });

  assert.equal(stats.spawnerConfig.initialSpawners, 300);
  assert.equal(stats.activeSpawnerConfig.initialSpawners, 20);
  assert.equal(stats.pendingSpawnerConfig.initialSpawners, 300);
  assert.equal(stats.spawnerCount, 20);
  assert.equal(stats.populationRoomRatio, 0.75);
}

function testLeanPacketsAreStructuredCloneSafe() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const packets = [
    createMarketChartPacket({ sessionId: 1, simulation, version: 0 }),
    createMarketRosterPacket({ sessionId: 1, simulation, version: 0, uniquenessScores }),
    createMarketStatsPacket({
      sessionId: 1,
      simulation,
      settings: INITIAL_SETTINGS,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      playing: false,
      version: 0,
      backlogTicks: 0,
      packetSizesKb: {},
    }),
    createSpawnerArchitecturePacket({ sessionId: 1, spawnerId: 1, spawner: simulation.world.spawners[0] ?? null }),
    createSpawnerUniquenessDetailPacket({ sessionId: 1, spawnerId: 1, score: uniquenessScores.get(1) ?? null }),
  ];

  for (const packet of packets) {
    const cloned = structuredClone(packet);
    assert.equal(cloned.sessionId, packet.sessionId);
  }
}

function testSessionIdsAllowStalePacketRejection() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const oldPacket = createMarketChartPacket({ sessionId: 1, simulation, version: 0 });
  const newPacket = createMarketChartPacket({ sessionId: 2, simulation, version: 0 });

  const expectedSessionId = 2;
  assert.equal(oldPacket.sessionId === expectedSessionId, false);
  assert.equal(newPacket.sessionId === expectedSessionId, true);
}

function testChartPacketSizeDoesNotGrowWithTotalRuntime() {
  const early = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(early, 10, 100000);
  const late = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(late, 600, 1000000);

  const earlyPacket = createMarketChartPacket({ sessionId: 1, simulation: early, version: 1 });
  const latePacket = createMarketChartPacket({ sessionId: 1, simulation: late, version: 2 });
  const earlySize = estimatePacketKb(earlyPacket);
  const lateSize = estimatePacketKb(latePacket);

  assert.ok(latePacket.signalSamples.length < 360);
  assert.ok(latePacket.telemetrySamples.length <= 181);
  assert.ok(latePacket.uniquenessSamples.length <= 181);
  assert.ok(lateSize < earlySize * 2.5, `late chart packet grew too much: early ${earlySize} KB, late ${lateSize} KB`);
}

function testChartPacketCarriesBoundedUniquenessWindow() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const aggregateSamples = Array.from({ length: 500 }, (_, index) => ({
    tick: index + 1,
    p25RawDistance: index,
    medianRawDistance: index + 0.5,
    p75RawDistance: index + 1,
  }));
  const selectedSamples = Array.from({ length: 500 }, (_, index) => ({ tick: index + 1, rawDistance: index + 2 }));
  const uniquenessWindow = createUniquenessTelemetryWindow({ aggregateSamples, selectedSamples, renderTick: 500 });
  const packet = createMarketChartPacket({ sessionId: 1, simulation, version: 1, uniquenessWindow });
  const cloned = structuredClone(packet);

  assert.ok(packet.uniquenessSamples.length <= 181);
  assert.ok(packet.selectedSpawnerUniquenessSamples.length <= 181);
  assert.equal(packet.uniquenessSamples[0]?.tick, 1);
  assert.equal(packet.uniquenessSamples.at(-1)?.tick, 500);
  assert.equal(cloned.selectedSpawnerUniquenessSamples.at(-1)?.rawDistance, packet.selectedSpawnerUniquenessSamples.at(-1)?.rawDistance);
}

function testSignalSamplesUseStableChartAnchors() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(simulation, 60, 100000);

  const firstPacket = createMarketChartPacket({ sessionId: 1, simulation, version: 1, centerTick: 60 });
  const secondPacket = createMarketChartPacket({ sessionId: 1, simulation, version: 2, centerTick: 60.03 });
  const secondTimes = new Set(secondPacket.signalSamples.map((sample) => sample.tick.toFixed(6)));
  const sharedTimes = firstPacket.signalSamples.filter((sample) => secondTimes.has(sample.tick.toFixed(6)));

  for (const sample of firstPacket.signalSamples) {
    const sampleIndex = Math.round(sample.tick / CHART_SAMPLE_INTERVAL_TICKS);
    assert.ok(
      Math.abs(sample.tick - sampleIndex * CHART_SAMPLE_INTERVAL_TICKS) < 0.000001,
      "signal samples should be aligned to a stable chart grid",
    );
    assert.ok(Math.abs(sample.tick - firstPacket.renderTick) <= CHART_TICKS_VISIBLE / 2 + CHART_SAMPLE_INTERVAL_TICKS + 0.000001);
  }

  assert.ok(sharedTimes.length > firstPacket.signalSamples.length * 0.95, "tiny pan shifts should keep the same historical samples");
}

function testChartPacketDoesNotRenderAheadOfSimulatedTime() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(simulation, 10, 100000);
  const packet = createMarketChartPacket({ sessionId: 1, simulation, version: 1, centerTick: simulation.timeline.tick + 20 });

  assert.ok(packet.renderTick <= simulation.timeline.tick);
  assert.ok(packet.renderTick <= simulation.world.tick);
}

function testGeneratedChartPacketKeepsProspectiveSamples() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(simulation, 60, 100000);
  const packet = createMarketChartPacket({ sessionId: 1, simulation, version: 1 });

  assert.equal(packet.marketSource, "generated");
  assert.equal(packet.signalSamples.some((sample) => sample.tick > packet.renderTick), true);
}

function testTelemetryDownsamplingUsesStableTickAnchors() {
  const first = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(first, 600, 1000000);
  const second = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(second, 600 + 1, 1000000);

  const firstPacket = createMarketChartPacket({ sessionId: 1, simulation: first, version: 1 });
  const secondPacket = createMarketChartPacket({ sessionId: 1, simulation: second, version: 2 });
  const secondTicks = new Set(secondPacket.telemetrySamples.map((sample) => sample.tick));
  const sharedTicks = firstPacket.telemetrySamples.filter((sample) => secondTicks.has(sample.tick));

  assert.ok(firstPacket.telemetrySamples.length <= 181);
  assert.ok(secondPacket.telemetrySamples.length <= 181);
  assert.ok(sharedTicks.length > firstPacket.telemetrySamples.length * 0.75, "telemetry downsampling should not replace most historical points after one tick");
}

function testTelemetryBoundsUseIntegerTicks() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  advanceSimulationToTarget(simulation, 60, 100000);
  const packet = createMarketChartPacket({ sessionId: 1, simulation, version: 1, centerTick: simulation.timeline.tick + 0.08 });

  assert.equal(Number.isInteger(packet.telemetryStartTick), true);
  assert.equal(Number.isInteger(packet.telemetryEndTick), true);
}

function testTelemetryWindowDownsamplingInvariants() {
  const dense = Array.from({ length: TELEMETRY_SAMPLE_LIMIT + 40 }, (_, index) => ({
    tick: index + 1,
    population: 10 + index,
    rollingLoss: index / 100,
  }));
  const sparse = dense.filter((sample) => sample.tick === 1 || sample.tick === dense.at(-1)?.tick || sample.tick % 3 !== 0);

  for (const samples of [dense, sparse]) {
    const window = createTelemetryWindow(samples, 260);
    const ticks = window.telemetrySamples.map((sample) => sample.tick);

    assert.equal(ticks[0], samples[0]?.tick);
    assert.equal(ticks.at(-1), samples.at(-1)?.tick);
    assert.equal(new Set(ticks).size, ticks.length);
    assert.ok(window.telemetrySamples.length <= TELEMETRY_SAMPLE_LIMIT + 1);
    assert.equal(window.telemetryStartTick, samples[0]?.tick);
    assert.equal(window.telemetryEndTick, 260);
  }
}

function testDownsampleByTickHandlesInvalidBounds() {
  const samples = [
    { tick: 5, value: "first" },
    { tick: 9, value: "middle" },
    { tick: 12, value: "last" },
  ];

  assert.deepEqual(downsampleByTick({ samples: [], firstTick: 1, lastTick: 10, limit: 2 }), []);
  assert.deepEqual(downsampleByTick({ samples, firstTick: 1, lastTick: 10, limit: 0 }), []);
  assert.deepEqual(downsampleByTick({ samples, firstTick: 5, lastTick: 5, limit: 2 }), [samples[0], samples[2]]);
  assert.deepEqual(downsampleByTick({ samples, firstTick: 12, lastTick: 5, limit: 2 }), [samples[0], samples[2]]);
  assert.deepEqual(downsampleByTick({ samples, firstTick: Number.NaN, lastTick: 12, limit: 2 }), [samples[0], samples[2]]);
  assert.deepEqual(downsampleByTick({ samples: [{ tick: 5, value: "only" }], firstTick: 5, lastTick: 5, limit: 2 }), [
    { tick: 5, value: "only" },
  ]);
}

function testRosterIncludesGenerationOneUniquenessWhenAvailable() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const parent = simulation.world.spawners[0];
  assert.ok(parent);
  const child = structuredClone(parent);
  child.id = 999;
  child.generation = 1;
  child.birthTick = simulation.world.tick + 1;
  simulation.world.spawners.push(child);
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const roster = createMarketRosterPacket({ sessionId: 1, simulation, version: 1, uniquenessScores });
  const childSummary = roster.spawners.find((spawner) => spawner.id === child.id);

  assert.ok(childSummary);
  assert.equal(childSummary.generation, 1);
  assert.notEqual(childSummary.uniqueness, null);
}

function testRosterUniquenessMatchesProvidedFullPopulationScores() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 20, maxSpawners: 20 });
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const roster = createMarketRosterPacket({ sessionId: 1, simulation, version: 1, uniquenessScores });
  const firstSummary = roster.spawners[0];
  assert.ok(firstSummary);
  assert.equal(firstSummary.uniqueness, uniquenessScores.get(firstSummary.id)?.score);
  assert.equal(firstSummary.uniquenessComparisonTick, uniquenessScores.get(firstSummary.id)?.comparisonTick);
}

function testRosterPacketIsCappedForLargePopulations() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 250, maxSpawners: 250 });
  const roster = createMarketRosterPacket({
    sessionId: 1,
    simulation,
    version: 1,
    uniquenessScores: new Map(),
  });

  assert.equal(simulation.world.spawners.length, 250);
  assert.equal(roster.spawners.length, 160);
  assert.equal(roster.spawners.every((spawner) => spawner.uniqueness === null), true);
  assert.equal(roster.spawners.every((spawner) => spawner.uniquenessComparisonTick === null), true);
}

function testRosterSelectionShowsLaterGenerationsAndSelectedSpawner() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 250, maxSpawners: 400 });
  for (let index = 0; index < 150; index += 1) {
    const parent = simulation.world.spawners[index];
    assert.ok(parent);
    const child = structuredClone(parent);
    child.id = 251 + index;
    child.parentSpawnerId = parent.id;
    child.generation = parent.generation + 1;
    child.birthTick = simulation.world.tick + 1;
    child.lastAction = index % 3 === 0 ? "long" : "wait";
    simulation.world.spawners.push(child);
  }
  simulation.world.foods.push(
    {
      id: 1,
      creatorSpawnerId: 400,
      creatorLineageId: 1,
      spawnTick: 0,
      resolveTick: 5,
      direction: "long",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "pending",
    },
    {
      id: 2,
      creatorSpawnerId: 400,
      creatorLineageId: 1,
      spawnTick: 0,
      resolveTick: 5,
      direction: "short",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "pending",
    },
    {
      id: 3,
      creatorSpawnerId: 400,
      creatorLineageId: 1,
      spawnTick: 0,
      resolveTick: 5,
      direction: "long",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "win",
    },
  );

  const selectedSpawnerId = 400;
  const roster = createMarketRosterPacket({
    sessionId: 1,
    simulation,
    version: 1,
    uniquenessScores: new Map(),
    selectedSpawnerId,
  });
  const helperIds = selectRosterSpawners({
    spawners: simulation.world.spawners,
    foods: simulation.world.foods,
    selectedSpawnerId,
  }).map((spawner) => spawner.id);
  const rosterIds = roster.spawners.map((spawner) => spawner.id);

  assert.equal(simulation.world.spawners.length, 400);
  assert.equal(roster.spawners.length, ROSTER_AGENT_LIMIT);
  assert.deepEqual(rosterIds, helperIds);
  assert.equal(new Set(rosterIds).size, rosterIds.length);
  assert(roster.spawners.some((spawner) => spawner.generation === 0));
  assert(roster.spawners.some((spawner) => spawner.generation === 1));
  assert.ok(roster.spawners.find((spawner) => spawner.id === selectedSpawnerId));
  assert.equal(roster.spawners.find((spawner) => spawner.id === selectedSpawnerId)?.pendingFoodCount, 2);
}

function testBtcChartPacketCarriesPriceSamplesOnlyForBtcMode() {
  const simulation = createCandleSimulationState({
    marketConfig: {
      source: "btcusd_5m",
      timeModel: MARKET_TIME_MODEL,
      generated: INITIAL_SETTINGS,
      playback: { rocLengthBars: 50, startDateTime: "2021-01-01T00:00", barsPerSecond: 30, generatedTicksPerSecond: 5 },
    },
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 0, isStart: true },
      { timestamp: 1300, datetime: "1970-01-01T00:21:40.000Z", open: 101, high: 101, low: 101, close: 101, roc: 1 },
      { timestamp: 1600, datetime: "1970-01-01T00:26:40.000Z", open: 102, high: 102, low: 102, close: 102, roc: 2 },
    ],
  });
  advanceSimulationToTarget(simulation, 1, 10);
  const packet = createMarketChartPacket({ sessionId: 1, simulation, version: 1 });

  assert.equal(packet.marketSource, "btcusd_5m");
  assert.ok(packet.priceSamples?.length);
  assert.equal(packet.currentPrice, 101);
  assert.equal(packet.signalSamples.some((sample) => sample.price !== undefined), true);
  assert.equal(packet.signalSamples.some((sample) => sample.tick > packet.renderTick), true);
  assert.equal(packet.priceSamples?.some((sample) => sample.tick > packet.renderTick), true);
}

function testBtcChartPacketUsesPriceSamplesAcrossVisibleWindow() {
  const candles = Array.from({ length: 140 }, (_, index) => ({
    timestamp: 1000 + index * 300,
    datetime: new Date((1000 + index * 300) * 1000).toISOString(),
    open: 100 + index,
    high: 100 + index,
    low: 100 + index,
    close: 100 + index,
    roc: index / 10,
    isStart: index === 50,
  }));
  const simulation = createCandleSimulationState({
    marketConfig: {
      source: "btcusd_5m",
      timeModel: MARKET_TIME_MODEL,
      generated: INITIAL_SETTINGS,
      playback: { rocLengthBars: 50, startDateTime: "2021-01-01T00:00", barsPerSecond: 30, generatedTicksPerSecond: 5 },
    },
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    candles,
  });
  advanceSimulationToTarget(simulation, 1 * 40, 100);
  const packet = createMarketChartPacket({ sessionId: 1, simulation, version: 1 });

  assert.ok((packet.priceSamples?.length ?? 0) > 70);
  assert.equal(packet.priceSamples?.every((sample) => Number.isFinite(sample.price)), true);
  assert.equal(packet.signalSamples.every((sample) => sample.price !== undefined), true);
  assert.equal(packet.signalSamples.some((sample) => sample.tick > packet.renderTick), true);
  assert.equal(packet.priceSamples?.some((sample) => sample.tick > packet.renderTick), true);
}

function testSpawnerInspectionPacketReturnsLivePayload() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const packet = createSpawnerInspectionPacket({
    sessionId: 1,
    requestId: 42,
    simulation,
    spawnerId: spawner.id,
    uniquenessScore: uniquenessScores.get(spawner.id) ?? null,
  });

  assert.equal(packet.ok, true);
  assert.equal(packet.requestId, 42);
  assert.equal(packet.payload?.spawnerId, spawner.id);
  assert.equal(packet.payload?.status, "alive");
  assert.ok(packet.payload?.genome.units.length);
  assert.equal(packet.payload?.genome.perception.deltaLagPairs.length, 5);
  assert.equal(Number.isFinite(packet.payload?.genome.mutationProfile.perceptionMutationRate), true);
  assert.ok(packet.payload?.metrics.activeUnits);
}

function testSpawnerInspectionPacketHandlesMissingSpawner() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const packet = createSpawnerInspectionPacket({
    sessionId: 1,
    requestId: 43,
    simulation,
    spawnerId: 999999,
    uniquenessScore: null,
  });

  assert.equal(packet.ok, false);
  assert.equal(packet.error, "not_found");
  assert.equal(packet.payload, null);
}

export const tests: SineTest[] = [
  { name: "Lean Packets Contain Render State Without Full Simulation", run: testLeanPacketsContainRenderStateWithoutFullSimulation },
  { name: "Stats Packet Separates Active And Pending Spawner Config", run: testStatsPacketSeparatesActiveAndPendingSpawnerConfig },
  { name: "Lean Packets Are Structured Clone Safe", run: testLeanPacketsAreStructuredCloneSafe },
  { name: "Session Ids Allow Stale Packet Rejection", run: testSessionIdsAllowStalePacketRejection },
  { name: "Chart Packet Size Does Not Grow With Total Runtime", run: testChartPacketSizeDoesNotGrowWithTotalRuntime },
  { name: "Chart Packet Carries Bounded Uniqueness Window", run: testChartPacketCarriesBoundedUniquenessWindow },
  { name: "Signal Samples Use Stable Chart Anchors", run: testSignalSamplesUseStableChartAnchors },
  { name: "Chart Packet Does Not Render Ahead Of Simulated Time", run: testChartPacketDoesNotRenderAheadOfSimulatedTime },
  { name: "Generated Chart Packet Keeps Prospective Samples", run: testGeneratedChartPacketKeepsProspectiveSamples },
  { name: "Telemetry Downsampling Uses Stable Tick Anchors", run: testTelemetryDownsamplingUsesStableTickAnchors },
  { name: "Telemetry Bounds Use Integer Ticks", run: testTelemetryBoundsUseIntegerTicks },
  { name: "Telemetry Window Downsampling Invariants", run: testTelemetryWindowDownsamplingInvariants },
  { name: "Downsample By Tick Handles Invalid Bounds", run: testDownsampleByTickHandlesInvalidBounds },
  { name: "Roster Includes Generation One Uniqueness When Available", run: testRosterIncludesGenerationOneUniquenessWhenAvailable },
  { name: "Roster Uniqueness Matches Provided Full Population Scores", run: testRosterUniquenessMatchesProvidedFullPopulationScores },
  { name: "Roster Packet Is Capped For Large Populations", run: testRosterPacketIsCappedForLargePopulations },
  { name: "Roster Selection Shows Later Generations And Selected Spawner", run: testRosterSelectionShowsLaterGenerationsAndSelectedSpawner },
  { name: "BTC Chart Packet Carries Price Samples Only For BTC Mode", run: testBtcChartPacketCarriesPriceSamplesOnlyForBtcMode },
  { name: "BTC Chart Packet Uses Price Samples Across Visible Window", run: testBtcChartPacketUsesPriceSamplesAcrossVisibleWindow },
  { name: "Spawner Inspection Packet Returns Live Payload", run: testSpawnerInspectionPacketReturnsLivePayload },
  { name: "Spawner Inspection Packet Handles Missing Spawner", run: testSpawnerInspectionPacketHandlesMissingSpawner },
];
