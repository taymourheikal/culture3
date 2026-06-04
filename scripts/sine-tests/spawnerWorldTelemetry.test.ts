import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { recordSpawnerEvent } from "../../src/sine/spawner/events";
import { calculateFoodPayoff, resolveFoods } from "../../src/sine/spawner/reward";
import { recordTelemetry } from "../../src/sine/spawner/telemetry";
import {
  activeConnections,
  activeUnits,
  architectureMetrics,
  advanceSpawnerWorldToTimeline,
  applySpawnerUpkeep,
  connectionDeltaKey,
  createSpawnerWorld,
  energyRatioInput,
  ensureCompiledBrainPlan,
  gateBiasDeltaKey,
  learnedStateNorm,
  outputBiasDeltaKey,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
} from "../../src/sine/spawnerSimulation";
import { round, runTo, summarize, type SineTest } from "./helpers";

function testLongSparseRunAvoidsInvalidNumbers() {
  const { world } = runTo(240, 606);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
    const metrics = architectureMetrics(spawner.genome);
    assert(metrics.activeUnits >= 0);
    assert(metrics.activeConnections >= 0);
  }
  for (const sample of world.telemetry) {
    assert(Number.isFinite(sample.rollingHitRate));
    assert(Number.isFinite(sample.rollingAveragePayoff));
    assert(Number.isFinite(sample.resolvedVolume));
    assert(Number.isFinite(sample.totalResolved));
    assert(Number.isFinite(sample.cumulativeNetPayoff));
    assert(Number.isFinite(sample.averageActiveUnits));
    assert(Number.isFinite(sample.averageActiveConnections));
    assert(Number.isFinite(sample.averageActiveLayers));
  }
}

function testLargeMutablePerceptionRunAvoidsInvalidNumbers() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(909, {
    initialSpawners: 250,
    maxSpawners: 250,
    defaultDeltaLag5FromTicks: 27,
    defaultDeltaLag5ToTicks: 1000,
    defaultRollingWindowTicks: 1000,
    defaultLocalScaleWindowTicks: 1000,
    defaultTrendWindowTicks: 1000,
    defaultCycleWindowTicks: 1000,
    founderPerceptionRandomizationTicks: 20,
    reproductionEnergy: 10_000,
  });

  advanceMarketTimeline(timeline, 160, 500);
  advanceSpawnerWorldToTimeline(world, timeline, 500);

  assert.equal(world.tick, 160);
  assert(world.spawners.length > 0);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
    assert.equal(spawner.genome.perception.deltaLagPairs.length, 5);
    assert(spawner.genome.perception.deltaLagPairs.every((pair) => pair.fromTicks >= 0 && pair.toTicks <= 1000));
  }
}

function testThousandSpawnerLargeWindowRunAvoidsInvalidNumbers() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(1001, {
    initialSpawners: 1000,
    maxSpawners: 1000,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    initialInputConnectionsPerUnit: 2,
    initialRecurrentConnectionsPerUnit: 0,
    initialOutputConnectionsPerOutput: 1,
    defaultRollingWindowTicks: 1000,
    defaultLocalScaleWindowTicks: 1000,
    defaultLocalScaleSampleStepTicks: 1,
    defaultTrendWindowTicks: 1000,
    defaultCycleWindowTicks: 1000,
    founderPerceptionRandomizationTicks: 0,
    reproductionEnergy: 10_000,
    defaultSpawnThreshold: 1.5,
  });

  advanceMarketTimeline(timeline, 20, 1200);
  advanceSpawnerWorldToTimeline(world, timeline, 1200);

  assert.equal(world.tick, 20);
  assert.equal(world.spawners.length, 1000);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
  }
}

function testTelemetryTrimKeepsValidRange() {
  const { world } = runTo(3650);
  assert.equal(world.telemetry.length, 3000);
  assert((world.telemetry[0]?.tick ?? 0) > 1);
  assert.equal(world.telemetry.at(-1)?.tick, world.tick);
  for (let index = 1; index < world.telemetry.length; index += 1) {
    assert.equal(world.telemetry[index]?.tick, (world.telemetry[index - 1]?.tick ?? 0) + 1);
  }
}

function testTradingPerformanceTelemetryTracksResolvedVolume() {
  const world = createSpawnerWorld(101, { initialSpawners: 4 });

  recordTelemetry(world);
  assert.equal(world.telemetry.at(-1)?.resolvedVolume, 0);
  assert.equal(world.telemetry.at(-1)?.totalResolved, 0);

  world.tick += 1;
  world.totalResolved = 2;
  world.cumulativeNetPayoff = 0.5;
  world.recentResolvedPayoffs.push(0.75, -0.25);
  recordTelemetry(world);

  const second = world.telemetry.at(-1);
  assert(second);
  assert.equal(second.resolvedVolume, 2);
  assert.equal(second.totalResolved, 2);
  assert.equal(second.rollingHitRate, 0.5);
  assert.equal(second.rollingAveragePayoff, 0.125);
  assert.equal(second.cumulativeNetPayoff, 0.5);

  world.tick += 1;
  recordTelemetry(world);

  const third = world.telemetry.at(-1);
  assert(third);
  assert.equal(third.resolvedVolume, 0);
  assert.equal(third.totalResolved, 2);
}

function testEventSinkReceivesEventsBeyondVisualRetentionCap() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const captured: number[] = [];
  world.eventSink = (event) => captured.push(event.id);

  for (let index = 0; index < 350; index += 1) {
    world.tick = index;
    world.tick = index;
    recordSpawnerEvent(world, {
      kind: "spawn",
      spawnerId: 1,
      lineageId: 1,
    });
  }

  assert.equal(captured.length, 350);
  assert.ok(world.recentEvents.length < captured.length);
  assert.ok(world.recentEvents.length <= 300);
  assert.equal(captured[0], 1);
  assert.equal(captured.at(-1), 350);
}

export const tests: SineTest[] = [
  { name: "Long Sparse Run Avoids Invalid Numbers", run: testLongSparseRunAvoidsInvalidNumbers },
  { name: "Large Mutable Perception Run Avoids Invalid Numbers", run: testLargeMutablePerceptionRunAvoidsInvalidNumbers },
  { name: "Thousand Spawner Large Window Run Avoids Invalid Numbers", run: testThousandSpawnerLargeWindowRunAvoidsInvalidNumbers },
  { name: "Telemetry Trim Keeps Valid Range", run: testTelemetryTrimKeepsValidRange },
  { name: "Trading Performance Telemetry Tracks Resolved Volume", run: testTradingPerformanceTelemetryTracksResolvedVolume },
  { name: "Event Sink Receives Events Beyond Visual Retention Cap", run: testEventSinkReceivesEventsBeyondVisualRetentionCap },
];
