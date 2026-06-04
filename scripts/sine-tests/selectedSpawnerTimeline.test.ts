import { strict as assert } from "node:assert";
import {
  SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT,
  createSelectedSpawnerTimelineService,
} from "../../src/sine/worker/selectedSpawnerTimelineService";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import type { SineTest } from "./helpers";

function testNoSelectedSpawnerReturnsNoTimeline() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);

  assert.equal(service.sample(simulation), null);
}

function testSelectedLiveSpawnerEmitsFiniteSamples() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  spawner.recentPayoffs = [2, -1, 0];
  spawner.lastAction = "long";
  simulation.world.foods.push(
    {
      id: 1,
      creatorSpawnerId: spawner.id,
      creatorLineageId: spawner.lineageId,
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
      creatorSpawnerId: spawner.id,
      creatorLineageId: spawner.lineageId,
      spawnTick: 0,
      resolveTick: 5,
      direction: "short",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "loss",
    },
  );

  service.setSelectedSpawner(spawner.id);
  const timeline = service.sample(simulation);
  const sample = timeline?.samples[0];

  assert.equal(timeline?.spawnerId, spawner.id);
  assert.equal(timeline?.status, "alive");
  assert.ok(sample);
  assert.equal(sample.openTrades, 1);
  assert.equal(sample.rollingHitRate, 1 / 3);
  assert.equal(sample.rollingAveragePayoff, 1 / 3);
  assert.equal(sample.rollingLoss, 1 / 3);
  assert.equal(sample.longRate, 1);
  assert.equal(sample.shortRate, 0);
  assert.equal(sample.waitRate, 0);
  for (const value of Object.values(sample)) {
    assert.equal(Number.isFinite(value), true);
  }
}

function testSelectionChangeResetsHistory() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const first = simulation.world.spawners[0];
  const second = simulation.world.spawners[1];
  assert.ok(first);
  assert.ok(second);

  service.setSelectedSpawner(first.id);
  assert.equal(service.sample(simulation)?.samples.length, 1);
  simulation.world.tick += 1;
  assert.equal(service.sample(simulation)?.samples.length, 2);

  service.setSelectedSpawner(second.id);
  const timeline = service.sample(simulation);

  assert.equal(timeline?.spawnerId, second.id);
  assert.equal(timeline?.samples.length, 1);
  assert.equal(timeline?.samples[0]?.tick, simulation.world.tick);
}

function testClearSamplesPreservesSelectionAndDropsHistory() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);

  service.setSelectedSpawner(spawner.id);
  assert.equal(service.sample(simulation)?.samples.length, 1);
  simulation.world.tick += 1;
  assert.equal(service.sample(simulation)?.samples.length, 2);

  service.clearSamples();
  const timeline = service.sample(simulation);

  assert.equal(timeline?.spawnerId, spawner.id);
  assert.equal(timeline?.samples.length, 1);
  assert.equal(timeline?.samples[0]?.tick, simulation.world.tick);
}

function testSampleWindowIsBoundedAndActionMixIsNormalized() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);

  service.setSelectedSpawner(spawner.id);
  for (let tick = 1; tick <= SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT + 40; tick += 1) {
    simulation.world.tick = tick;
    spawner.lastAction = tick % 3 === 0 ? "long" : tick % 3 === 1 ? "short" : "wait";
    service.sample(simulation);
  }
  const timeline = service.sample(simulation);
  const latest = timeline?.samples.at(-1);

  assert.ok(timeline);
  assert.ok(timeline.samples.length <= SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT);
  assert.ok(latest);
  assert.ok(latest.longRate >= 0 && latest.longRate <= 1);
  assert.ok(latest.shortRate >= 0 && latest.shortRate <= 1);
  assert.ok(latest.waitRate >= 0 && latest.waitRate <= 1);
  assert.equal(latest.longRate, 60 / SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT);
  assert.equal(latest.shortRate, 60 / SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT);
  assert.equal(latest.waitRate, 61 / SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT);
  assert.ok(Math.abs(latest.longRate + latest.shortRate + latest.waitRate - 1) < 0.000001);
}

function testMissingSelectedSpawnerDoesNotCrash() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);

  service.setSelectedSpawner(999999);
  const timeline = service.sample(simulation);

  assert.equal(timeline?.spawnerId, 999999);
  assert.equal(timeline?.status, "missing");
  assert.deepEqual(timeline?.samples, []);
}

function testMissingSelectedSpawnerRetainsExistingSamples() {
  const service = createSelectedSpawnerTimelineService();
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);

  service.setSelectedSpawner(spawner.id);
  const liveTimeline = service.sample(simulation);
  assert.equal(liveTimeline?.status, "alive");
  assert.equal(liveTimeline?.samples.length, 1);

  simulation.world.spawners = simulation.world.spawners.filter((candidate) => candidate.id !== spawner.id);
  simulation.world.tick += 1;
  const missingTimeline = service.sample(simulation);

  assert.equal(missingTimeline?.spawnerId, spawner.id);
  assert.equal(missingTimeline?.status, "missing");
  assert.equal(missingTimeline?.samples.length, 1);
  assert.equal(missingTimeline?.samples[0]?.tick, liveTimeline?.samples[0]?.tick);
}

export const tests: SineTest[] = [
  { name: "No Selected Spawner Returns No Timeline", run: testNoSelectedSpawnerReturnsNoTimeline },
  { name: "Selected Live Spawner Emits Finite Samples", run: testSelectedLiveSpawnerEmitsFiniteSamples },
  { name: "Selection Change Resets History", run: testSelectionChangeResetsHistory },
  { name: "Clear Samples Preserves Selection And Drops History", run: testClearSamplesPreservesSelectionAndDropsHistory },
  { name: "Sample Window Is Bounded And Action Mix Is Normalized", run: testSampleWindowIsBoundedAndActionMixIsNormalized },
  { name: "Missing Selected Spawner Does Not Crash", run: testMissingSelectedSpawnerDoesNotCrash },
  { name: "Missing Selected Spawner Retains Existing Samples", run: testMissingSelectedSpawnerRetainsExistingSamples },
];
