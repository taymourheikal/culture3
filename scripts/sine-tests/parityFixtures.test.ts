import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import {
  createMarketChartPacket,
  createMarketRosterPacket,
  createMarketStatsPacket,
  createSpawnerInspectionPacket,
  createSpawnerUniquenessDetailPacket,
} from "../../src/sine/marketWorkerSnapshot";
import { buildSinePersistencePacket } from "../../src/sine/persistence/buildSinePersistencePacket";
import { DEFAULT_SPAWNER_CONFIG, computeSpawnerUniqueness, type SpawnerEvent } from "../../src/sine/spawnerSimulation";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import type { SineTest } from "./helpers";

type EventSummary = {
  kind: SpawnerEvent["kind"];
  tick: number;
  spawnerId: number;
  lineageId: number;
  foodId?: number;
  childSpawnerId?: number;
  status?: SpawnerEvent["status"];
  payoff?: number;
};

const EXPECTED_DIGEST = {
  tick: 180,
  timelineTick: 180,
  population: 20,
  births: 20,
  deaths: 0,
  spawnedFoods: 165,
  resolvedFoods: 155,
  wins: 77,
  losses: 78,
  cumulativePayoff: -4.907596,
  firstEvents: [
    { kind: "spawn", tick: 2, spawnerId: 9, lineageId: 9, foodId: 1 },
    { kind: "spawn", tick: 2, spawnerId: 18, lineageId: 18, foodId: 2 },
    { kind: "spawn", tick: 3, spawnerId: 7, lineageId: 7, foodId: 3 },
    { kind: "spawn", tick: 3, spawnerId: 17, lineageId: 17, foodId: 4 },
    { kind: "spawn", tick: 5, spawnerId: 13, lineageId: 13, foodId: 5 },
  ],
  lastEvents: [
    { kind: "spawn", tick: 176, spawnerId: 2, lineageId: 2, foodId: 163 },
    { kind: "resolve", tick: 177, spawnerId: 9, lineageId: 9, foodId: 154, status: "loss", payoff: -0.400689 },
    { kind: "resolve", tick: 179, spawnerId: 11, lineageId: 11, foodId: 157, status: "loss", payoff: -0.099711 },
    { kind: "spawn", tick: 179, spawnerId: 17, lineageId: 17, foodId: 164 },
    { kind: "spawn", tick: 180, spawnerId: 19, lineageId: 19, foodId: 165 },
  ],
};

const ZERO_LEARNING_CONFIG = {
  ...DEFAULT_SPAWNER_CONFIG,
  plasticityWeightLearningRate: 0,
  plasticityBiasLearningRate: 0,
  plasticityReproductionRewardStrength: 0,
  plasticityExperienceDecayRate: 0,
};

function createBaselineSimulation() {
  const events: SpawnerEvent[] = [];
  const simulation = createSimulationState(INITIAL_SETTINGS, ZERO_LEARNING_CONFIG);
  simulation.world.eventSink = (event) => events.push(structuredClone(event));
  advanceSimulationToTarget(simulation, EXPECTED_DIGEST.tick, 100_000);
  return { simulation, events };
}

function summarizeEvent(event: SpawnerEvent): EventSummary {
  const summary: EventSummary = {
    kind: event.kind,
    tick: event.tick,
    spawnerId: event.spawnerId,
    lineageId: event.lineageId,
  };
  if (event.foodId !== undefined) summary.foodId = event.foodId;
  if (event.childSpawnerId !== undefined) summary.childSpawnerId = event.childSpawnerId;
  if (event.status !== undefined) summary.status = event.status;
  if (event.payoff !== undefined) summary.payoff = round(event.payoff);
  return summary;
}

function summarizeDigest() {
  const { simulation, events } = createBaselineSimulation();
  const world = simulation.world;
  return {
    tick: world.tick,
    timelineTick: simulation.timeline.tick,
    population: world.spawners.length,
    births: Object.values(world.lineages).reduce((total, lineage) => total + lineage.totalBorn, 0),
    deaths: Object.values(world.lineages).reduce((total, lineage) => total + lineage.totalDeaths, 0),
    spawnedFoods: world.foods.filter((food) => food.status === "pending").length + world.totalResolved,
    resolvedFoods: world.totalResolved,
    wins: world.totalResolved - world.totalLosses,
    losses: world.totalLosses,
    cumulativePayoff: round(world.cumulativeNetPayoff),
    firstEvents: events.slice(0, 5).map(summarizeEvent),
    lastEvents: events.slice(-5).map(summarizeEvent),
  };
}

function testDeterministicBaselineDigest() {
  assert.deepEqual(summarizeDigest(), EXPECTED_DIGEST);
}

function testPacketFixtureShapes() {
  const { simulation, events } = createBaselineSimulation();
  const uniquenessScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const firstSpawner = simulation.world.spawners[0];
  assert.ok(firstSpawner);

  const chart = createMarketChartPacket({ sessionId: 11, simulation, version: 4 });
  const roster = createMarketRosterPacket({ sessionId: 11, simulation, version: 4, uniquenessScores });
  const stats = createMarketStatsPacket({
    sessionId: 11,
    simulation,
    settings: INITIAL_SETTINGS,
    spawnerConfig: ZERO_LEARNING_CONFIG,
    playing: true,
    version: 4,
    backlogTicks: 0,
    packetSizesKb: { chart: 1.2 },
  });
  const inspection = createSpawnerInspectionPacket({
    sessionId: 11,
    requestId: 5,
    simulation,
    spawnerId: firstSpawner.id,
    uniquenessScore: uniquenessScores.get(firstSpawner.id) ?? null,
  });
  const uniqueness = createSpawnerUniquenessDetailPacket({
    sessionId: 11,
    spawnerId: firstSpawner.id,
    score: uniquenessScores.get(firstSpawner.id) ?? null,
  });
  const persistence = buildSinePersistencePacket({
    sessionId: 11,
    persistentSessionId: "baseline",
    simulation,
    settings: INITIAL_SETTINGS,
    spawnerConfig: ZERO_LEARNING_CONFIG,
    events,
    includeInitial: true,
    includeStateSnapshot: true,
    pendingUniquenessSnapshots: [],
    uniquenessScores,
    includeFullUniquenessTick: simulation.world.tick,
  });

  assert.deepEqual(Object.keys(chart).sort(), [
    "currentNoise",
    "currentPrice",
    "currentSignal",
    "marketSource",
    "priceSamples",
    "renderTick",
    "selectedSpawnerUniquenessSamples",
    "sessionId",
    "signalSamples",
    "sourceDatetime",
    "sourceTimestamp",
    "telemetryEndTick",
    "telemetryLossMax",
    "telemetryPopulationMax",
    "telemetrySamples",
    "telemetryStartTick",
    "ticksVisible",
    "uniquenessEndTick",
    "uniquenessRawDistanceMax",
    "uniquenessSamples",
    "uniquenessSkippedReason",
    "uniquenessStartTick",
    "version",
    "visibleFoods",
  ]);
  assert.equal(chart.signalSamples.length, 179);
  assert.equal(chart.visibleFoods.length, 39);
  assert.deepEqual(Object.keys(chart.signalSamples[0] ?? {}).sort(), [
    "noise",
    "parameters",
    "price",
    "signal",
    "sourceDatetime",
    "sourceTimestamp",
    "tick",
  ]);

  assert.deepEqual(Object.keys(roster).sort(), ["recentDeathEvents", "sessionId", "spawners", "tick", "version"]);
  assert.equal(roster.spawners.length, 20);
  assert.deepEqual(Object.keys(roster.spawners[0] ?? {}).sort(), [
    "activeConnections",
    "activeLayers",
    "activeUnits",
    "averagePayoff",
    "averagePerceptionLag",
    "biasMutationActivity",
    "birthTick",
    "children",
    "cooldownTicks",
    "disabledConnections",
    "disabledUnits",
    "energy",
    "generation",
    "health",
    "hitRate",
    "id",
    "lastAction",
    "learnedDeltaNorm",
    "learningUpdateCount",
    "lineageId",
    "longestPerceptionWindow",
    "mutationProfileDrift",
    "pendingDensityScale",
    "pendingFoodCount",
    "perceptionMutationRate",
    "plasticityDecayRate",
    "plasticityLearningRateMean",
    "plasticityMaxLearnedDelta",
    "plasticityMutationStdDev",
    "recentAveragePayoff",
    "recentLearningSignal",
    "recurrentConnections",
    "reproductionLearningCount",
    "resolvedCount",
    "skipConnections",
    "spawnedCount",
    "topologyMutationRate",
    "uniqueness",
    "uniquenessComparisonTick",
    "weightMutationActivity",
  ]);

  assert.equal(stats.sessionId, 11);
  assert.equal(stats.spawnerCount, 20);
  assert.deepEqual(Object.keys(stats).sort(), [
    "activeMarketConfig",
    "activeSpawnerConfig",
    "backlogTicks",
    "brainEvalMode",
    "currentNoise",
    "currentReproductionCost",
    "currentReproductionEnergyRequirement",
    "currentSignal",
    "marketConfig",
    "packetSizesKb",
    "pendingFoods",
    "pendingMarketConfig",
    "pendingSpawnerConfig",
    "persistentSessionId",
    "playing",
    "populationRoomRatio",
    "renderTick",
    "reproductionCostMultiplier",
    "resolvedFoods",
    "runState",
    "sessionId",
    "settings",
    "spawnerConfig",
    "spawnerCount",
    "tick",
    "totalLosses",
    "totalWins",
    "version",
  ]);

  assert.equal(inspection.ok, true);
  assert.deepEqual(Object.keys(inspection).sort(), ["error", "ok", "payload", "requestId", "sessionId", "spawnerId"]);
  assert.equal(uniqueness.score?.comparisonPopulationSize, 20);
  assert.deepEqual(Object.keys(uniqueness).sort(), ["score", "sessionId", "skippedReason", "spawnerId"]);

  assert.equal(persistence.births.length, 20);
  assert.equal(persistence.foodEvents.length, 320);
  assert.equal(persistence.events.length, 320);
  assert.equal(persistence.genomeSnapshots.length, 20);
  assert.equal(persistence.stateSnapshots.length, 20);
  assert.equal(persistence.uniquenessSnapshots.length, 20);
  assert.deepEqual(Object.keys(persistence).sort(), [
    "births",
    "deaths",
    "events",
    "foodEvents",
    "genomeSnapshots",
    "marketConfig",
    "persistentSessionId",
    "sessionId",
    "settings",
    "spawnerConfig",
    "stateSnapshots",
    "status",
    "tick",
    "uniquenessSnapshots",
  ]);

  for (const packet of [chart, roster, stats, inspection, uniqueness, persistence]) {
    assert.deepEqual(structuredClone(packet), packet);
  }
}

function round(value: number) {
  return Number(value.toFixed(6));
}

export const tests: SineTest[] = [
  { name: "Deterministic Baseline Digest", run: testDeterministicBaselineDigest },
  { name: "Packet Fixture Shapes", run: testPacketFixtureShapes },
];
