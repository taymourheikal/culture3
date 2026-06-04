import { strict as assert } from "node:assert";
import { createSelectedSpawnerPanelModel } from "../../src/sine/selectedSpawnerPanelModel";
import type { RosterSpawnerSummary, SelectedSpawnerTimeline } from "../../src/sine/marketWorkerProtocol";
import type { SineTest } from "./helpers";

function testLiveSpawnerDerivesPanelValues() {
  const spawner = rosterSpawnerFixture({
    id: 12,
    birthTick: 40,
    spawnedCount: 10,
    resolvedCount: 4,
  });
  const timeline = timelineFixture(12);
  const model = createSelectedSpawnerPanelModel({
    selectedSpawner: spawner,
    selectedSpawnerId: 12,
    worldTick: 95,
    rosterTick: 80,
    timeline,
  });

  assert.equal(model.id, 12);
  assert.equal(model.status, "live");
  assert.equal(model.ageTicks, 55);
  assert.equal(model.worldTick, 95);
  assert.equal(model.rosterTick, 80);
  assert.equal(model.sampleCount, 1);
  assert.equal(model.latestSample?.tick, 94);
  assert.equal(model.latestSampleTick, 94);
  assert.equal(model.spawnedResolvedRatio, 0.4);
}

function testAgeUsesWorldTickNotRosterTick() {
  const spawner = rosterSpawnerFixture({
    id: 22,
    birthTick: 3478,
    spawnedCount: 200,
    resolvedCount: 300,
  });
  const model = createSelectedSpawnerPanelModel({
    selectedSpawner: spawner,
    selectedSpawnerId: 22,
    worldTick: 13719,
    rosterTick: 4180,
    timeline: timelineFixture(22),
  });

  assert.equal(model.ageTicks, 10241);
  assert.equal(model.spawnedResolvedRatio, 1);
}

function testOutsideRosterPacketKeepsLastKnownTimeline() {
  const timeline = timelineFixture(7, "alive");
  const model = createSelectedSpawnerPanelModel({
    selectedSpawner: null,
    selectedSpawnerId: 7,
    worldTick: 150,
    rosterTick: 140,
    timeline,
  });

  assert.equal(model.id, 7);
  assert.equal(model.status, "outside_roster_packet");
  assert.equal(model.ageTicks, null);
  assert.equal(model.sampleCount, 1);
  assert.equal(model.latestSample?.rollingHitRate, 0.5);
  assert.equal(model.latestSampleTick, 94);
  assert.equal(model.spawnedResolvedRatio, 0);
}

function testMissingSpawnerKeepsLastKnownTimeline() {
  const timeline = timelineFixture(7, "missing");
  const model = createSelectedSpawnerPanelModel({
    selectedSpawner: null,
    selectedSpawnerId: 7,
    worldTick: 150,
    rosterTick: 140,
    timeline,
  });

  assert.equal(model.id, 7);
  assert.equal(model.status, "missing");
  assert.equal(model.ageTicks, null);
  assert.equal(model.sampleCount, 1);
  assert.equal(model.latestSample?.rollingHitRate, 0.5);
  assert.equal(model.spawnedResolvedRatio, 0);
}

function testNoSelectionReturnsEmptyModel() {
  const model = createSelectedSpawnerPanelModel({
    selectedSpawner: null,
    selectedSpawnerId: null,
    worldTick: 10,
    rosterTick: null,
    timeline: null,
  });

  assert.equal(model.status, "none");
  assert.equal(model.id, 0);
  assert.equal(model.sampleCount, 0);
  assert.equal(model.latestSample, null);
}

function rosterSpawnerFixture(patch: Partial<RosterSpawnerSummary> = {}): RosterSpawnerSummary {
  return {
    id: 1,
    lineageId: 1,
    generation: 0,
    birthTick: 0,
    cooldownTicks: 0,
    energy: 10,
    health: 100,
    pendingFoodCount: 0,
    hitRate: 0,
    recentAveragePayoff: 0,
    lastAction: "wait",
    spawnedCount: 0,
    resolvedCount: 0,
    children: 0,
    averagePayoff: 0,
    activeUnits: 0,
    activeLayers: 0,
    activeConnections: 0,
    disabledUnits: 0,
    disabledConnections: 0,
    recurrentConnections: 0,
    skipConnections: 0,
    averagePerceptionLag: 0,
    longestPerceptionWindow: 1,
    pendingDensityScale: 1,
    topologyMutationRate: 0,
    weightMutationActivity: 0,
    biasMutationActivity: 0,
    perceptionMutationRate: 0,
    mutationProfileDrift: 0,
    learnedDeltaNorm: 0,
    recentLearningSignal: 0,
    learningUpdateCount: 0,
    reproductionLearningCount: 0,
    plasticityLearningRateMean: 0,
    plasticityDecayRate: 0,
    plasticityMaxLearnedDelta: 0,
    plasticityMutationStdDev: 0,
    uniqueness: null,
    uniquenessComparisonTick: null,
    ...patch,
  };
}

function timelineFixture(spawnerId: number, status: SelectedSpawnerTimeline["status"] = "alive"): SelectedSpawnerTimeline {
  return {
    spawnerId,
    status,
    samples: [
      {
        tick: 94,
        rollingHitRate: 0.5,
        rollingAveragePayoff: 1.2,
        rollingLoss: 0.1,
        energy: 11,
        health: 90,
        openTrades: 2,
        longRate: 0.3,
        shortRate: 0.2,
        waitRate: 0.5,
        learnedDeltaNorm: 0.25,
      },
    ],
  };
}

export const tests: SineTest[] = [
  { name: "Live Spawner Derives Panel Values", run: testLiveSpawnerDerivesPanelValues },
  { name: "Age Uses World Tick Not Roster Tick", run: testAgeUsesWorldTickNotRosterTick },
  { name: "Outside Roster Packet Keeps Last Known Timeline", run: testOutsideRosterPacketKeepsLastKnownTimeline },
  { name: "Missing Spawner Keeps Last Known Timeline", run: testMissingSpawnerKeepsLastKnownTimeline },
  { name: "No Selection Returns Empty Model", run: testNoSelectionReturnsEmptyModel },
];
