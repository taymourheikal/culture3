import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createHeadlessRecorder } from "../../src/sine/headless/recorder";
import {
  HEADLESS_INTERACTIVE_CHUNK_TICKS,
  HEADLESS_INTERACTIVE_MAX_CHUNK_TICKS,
  HEADLESS_THROUGHPUT_CHUNK_TICKS,
  sanitizeHeadlessChunkTicks,
} from "../../src/sine/headless/chunkPolicy";
import { SINE_HEADLESS_AGENT_SORT_KEYS, SINE_HEADLESS_LINEAGE_SORT_KEYS } from "../../src/sine/headless/headlessApi";
import { runHeadlessSineExperiment, type HeadlessCandleLoadResult } from "../../src/sine/headless/runner";
import { seedBankReseedPolicy } from "../../src/sine/headless/seedBankPolicy";
import {
  DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL,
  type HeadlessRunProgressRecord,
  type HeadlessSinkMethod,
  type HeadlessTimingSnapshot,
} from "../../src/sine/headless/types";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../../src/sine/marketRuntimeConfig";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import { createSpawnerSnapshot } from "../../src/sine/spawner/snapshots";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerEvent } from "../../src/sine/spawnerSimulation";
import { strictWorldDigest } from "../../src/sine/testing/strictWorldDigest";
import { worldDigest } from "../../src/sine/testing/worldDigest";
import {
  candle,
  createFailingBatchMemorySink,
  createMemorySink,
  emptyBatch,
  pendingSpawnerFood,
  runStartFixture,
  type MemorySink,
} from "./headlessFixtures";
import type { SineTest } from "./helpers";
import { dateFromUnixSeconds, datetimeFromUnixSeconds, nullableUnixSeconds } from "../../src/sine/sourceTime";

function testHeadlessRecorderPreservesRuntimeDigest() {
  const plain = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 12, maxSpawners: 12 }, { seed: 101 });
  advanceSimulationToTarget(plain, 90, 1000);

  const sink = createMemorySink();
  return runHeadlessSineExperiment({
    runId: "headless-parity",
    ticks: 90,
    seed: 101,
    spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
    minimumResolvedTrades: 1,
    sink: sink.sink,
  }).then((result) => {
    assert.deepEqual(worldDigest(result.simulation.world), worldDigest(plain.world));
    assert.equal(result.simulation.timeline.tick, plain.timeline.tick);
    assert.equal(sink.runs.length, 1);
    assert.equal(sink.completions[0]?.status, "completed");
    assert.equal(sink.completions[0]?.terminationReason, "target");
  });
}

async function testGeneratedRunEligibilityAndMetrics() {
  const sink = createMemorySink();
  const result = await runHeadlessSineExperiment({
    runId: "headless-metrics",
    ticks: 140,
    seed: 101,
    spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
    minimumResolvedTrades: 2,
    sink: sink.sink,
  });
  assert.equal(result.tick, 140);
  assert.equal(result.status, "completed");
  assert.equal(sink.events.filter((event) => event.kind === "birth").length, 12);
  assert.equal(sink.events.find((event) => event.kind === "birth")?.sourceTimestamp, null);
  assert.ok(sink.metrics.length > 0);

  const metric = sink.metrics.find((candidate) => candidate.resolvedTrades >= 2);
  assert.ok(metric);
  const trades = sink.trades.filter((trade) => trade.spawnerId === metric.spawnerId && trade.status !== "pending");
  assert.equal(trades.length, metric.resolvedTrades);
  const payoff = trades.reduce((sum, trade) => sum + (trade.payoff ?? 0), 0);
  assert.equal(round(payoff), round(metric.cumulativePayoff));
  assert.equal(round(metric.hitRate), round(metric.wins / Math.max(1, metric.resolvedTrades)));
  assert.ok(sink.snapshots.some((snapshot) => snapshot.spawnerId === metric.spawnerId && snapshot.reason === "birth"));
}

async function testHeadlessTradeIntervalSnapshotsCapturePostLearningState() {
  const plain = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 8, maxSpawners: 8 }, { seed: 101 });
  advanceSimulationToTarget(plain, 140, 1000);
  const sink = createMemorySink();
  const result = await runHeadlessSineExperiment({
    runId: "headless-trade-interval",
    ticks: 140,
    seed: 101,
    spawnerConfig: { initialSpawners: 8, maxSpawners: 8 },
    minimumResolvedTrades: 1,
    resolvedTradeSnapshotInterval: 1,
    sink: sink.sink,
  });
  const snapshot = sink.snapshots.find((candidate) => candidate.reason === "trade_interval");
  assert.ok(snapshot);
  const trade = sink.trades.find(
    (candidate) => candidate.spawnerId === snapshot.spawnerId && candidate.resolveTick === snapshot.tick && candidate.status !== "pending",
  );
  assert.ok(trade);
  assert.equal(snapshot.tick, trade.resolveTick);
  assert.ok((snapshot.snapshot.learnedState?.learningUpdateCount ?? 0) > 0);
  assert.deepEqual(worldDigest(result.simulation.world), worldDigest(plain.world));
}

function testHeadlessTradeIntervalSnapshotsCanBeDisabled() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const sink = createMemorySink();
  const recorder = createTestRecorder(simulation, sink, 0, 0);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  recorder.recordFounders();
  const food = recorderFood(spawner.id, spawner.lineageId, 1, 1, 2, "long", 1, "win");
  recorder.recordEvent({ id: 1, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: food.id, foodEvent: { ...food, status: "pending", payoff: undefined, exitSignal: undefined } });
  recorder.recordEvent({ id: 2, kind: "resolve", tick: 2, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: food.id, status: "win", payoff: 1, foodEvent: food });
  recorder.capturePendingSnapshotsAfterTick();

  assert.equal(sink.snapshots.filter((snapshot) => snapshot.reason === "trade_interval").length, 0);
}

function testHeadlessTradeIntervalSnapshotsDeduplicateSameTickResolves() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const sink = createMemorySink();
  const recorder = createTestRecorder(simulation, sink, 0, 1);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  recorder.recordFounders();
  const firstFood = recorderFood(spawner.id, spawner.lineageId, 1, 1, 3, "long", 1, "win");
  const secondFood = recorderFood(spawner.id, spawner.lineageId, 2, 1, 3, "short", -0.5, "loss");
  for (const food of [firstFood, secondFood]) {
    recorder.recordEvent({ id: food.id, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: food.id, foodEvent: { ...food, status: "pending", payoff: undefined, exitSignal: undefined } });
    recorder.recordEvent({ id: food.id + 10, kind: "resolve", tick: 3, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: food.id, status: food.status, payoff: food.payoff, foodEvent: food });
  }
  recorder.capturePendingSnapshotsAfterTick();

  const intervalSnapshots = sink.snapshots.filter((snapshot) => snapshot.spawnerId === spawner.id && snapshot.reason === "trade_interval");
  assert.equal(intervalSnapshots.length, 1);
  assert.equal(intervalSnapshots[0]?.tick, 3);
}

function testHeadlessTradeIntervalSnapshotsFlushAfterEligibility() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const sink = createMemorySink();
  const recorder = createTestRecorder(simulation, sink, 2, 1);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  recorder.recordFounders();
  const firstFood = recorderFood(spawner.id, spawner.lineageId, 1, 1, 2, "long", 1, "win");
  recorder.recordEvent({ id: 1, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: firstFood.id, foodEvent: { ...firstFood, status: "pending", payoff: undefined, exitSignal: undefined } });
  recorder.recordEvent({ id: 2, kind: "resolve", tick: 2, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: firstFood.id, status: "win", payoff: 1, foodEvent: firstFood });
  recorder.capturePendingSnapshotsAfterTick();
  assert.equal(sink.snapshots.length, 0);

  const secondFood = recorderFood(spawner.id, spawner.lineageId, 2, 3, 4, "long", 1, "win");
  recorder.recordEvent({ id: 3, kind: "spawn", tick: 3, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: secondFood.id, foodEvent: { ...secondFood, status: "pending", payoff: undefined, exitSignal: undefined } });
  recorder.recordEvent({ id: 4, kind: "resolve", tick: 4, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: secondFood.id, status: "win", payoff: 1, foodEvent: secondFood });
  recorder.capturePendingSnapshotsAfterTick();

  assert.deepEqual(sink.agentEligibilities, [{ runId: "manual", spawnerId: spawner.id, eligible: true, eligibleTick: 4, resolvedTrades: 2 }]);
  assert.deepEqual(sink.snapshots.filter((snapshot) => snapshot.spawnerId === spawner.id).map((snapshot) => snapshot.reason), [
    "birth",
    "trade_interval",
    "trade_interval",
  ]);
  assert.deepEqual(sink.snapshots.filter((snapshot) => snapshot.reason === "trade_interval").map((snapshot) => snapshot.tick), [2, 4]);
}

function testHeadlessFinalSnapshotsCoverEligibleLiveAgentsOnly() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const sink = createMemorySink();
  const recorder = createTestRecorder(simulation, sink, 0, 0);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  recorder.recordFounders();
  recorder.finalize();

  assert.deepEqual(sink.snapshots.filter((snapshot) => snapshot.spawnerId === spawner.id).map((snapshot) => snapshot.reason), ["birth", "final"]);
  assert.equal(sink.snapshots.find((snapshot) => snapshot.reason === "final")?.snapshot.id, spawner.id);
}

async function testHeadlessCheckpointsAndCancellation() {
  const sink = createMemorySink();
  const result = await runHeadlessSineExperiment({
    runId: "headless-cancel",
    ticks: 100,
    seed: 101,
    spawnerConfig: { initialSpawners: 4, maxSpawners: 4 },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: 10,
    sink: sink.sink,
    shouldCancel: () => true,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.tick, 0);
  assert.equal(sink.completions[0]?.status, "cancelled");
  assert.equal(sink.completions[0]?.terminationReason, "cancelled");
  assert.equal(sink.checkpoints.length, 1);
  assert.equal(sink.checkpoints[0]?.tick, 0);
}

async function testHeadlessProgressEmitsBetweenCheckpoints() {
  const sink = createMemorySink();
  const progress: HeadlessRunProgressRecord[] = [];
  const result = await runHeadlessSineExperiment({
    runId: "headless-progress",
    ticks: 35,
    seed: 101,
    spawnerConfig: { initialSpawners: 4, maxSpawners: 4 },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: 10000,
    chunkTicks: 5,
    sink: sink.sink,
    onProgress: (record) => progress.push(record),
  });
  assert.equal(result.tick, 35);
  assert.ok(progress.some((record) => record.tick > 0 && record.tick < 35));
  assert.equal(progress.at(-1)?.tick, 35);
  assert.ok(progress.some((record) => record.timing?.latestChunk));
}

async function testHeadlessTimingTracksSinkAndRuntimePhases() {
  const sink = createMemorySink();
  const progress: HeadlessRunProgressRecord[] = [];
  const result = await runHeadlessSineExperiment({
    runId: "headless-timing",
    ticks: 140,
    seed: 101,
    spawnerConfig: { initialSpawners: 8, maxSpawners: 8 },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: 50,
    chunkTicks: 10,
    sink: sink.sink,
    onProgress: (record) => progress.push(record),
  });
  const timing = result.timing;
  assert.equal(result.tick, 140);
  assert.equal(timing.simulatedTicks, 140);
  assert.ok(timing.runMs > 0);
  assert.ok(timing.chunks > 0);
  assert.ok(timing.advanceTotalMs > 0);
  assert.ok(timing.recorderEventCount > 0);
  assert.ok(timing.recorderEventMs >= 0);
  assert.ok(timing.recorderFounderMs >= 0);
  assert.ok(timing.recorderFinalizeMs >= 0);
  assert.ok(timing.checkpointMs >= 0);
  assert.ok(timing.sinkWriteMs >= 0);
  assert.ok(timing.sinkWrites > 0);
  assert.ok(timing.sinkEnqueueMs >= 0);
  assert.equal(timing.sinkEnqueues, timing.sinkWrites);
  assert.ok(timing.sinkFlushMs >= 0);
  assert.ok(timing.sinkFlushes > 0);
  assert.ok(timing.sinkBufferedRows >= timing.sinkWrites);
  assert.ok(timing.latestChunk);
  assert.ok(timing.latestChunk.ticksPerSecond > 0);
  assert.ok(timing.latestChunk.simulationCoreEstimateMs >= 0);
  assert.ok(timing.latestChunk.sinkEnqueueMs >= 0);
  assert.ok(timing.latestChunk.sinkFlushMs >= 0);
  assert.ok(timing.latestChunk.sinkBufferedRows > 0);
  assert.ok(timing.topSinkMethod);
  assert.equal(typeof timing.topSinkMethod.method, "string");
  assert.ok(timing.topSinkMethod.calls > 0);
  assert.ok(timing.topSinkMethod.ms >= 0);
  assert.equal(timing.sinkMethods[timing.topSinkMethod.method]?.calls, timing.topSinkMethod.calls);
  assert.deepEqual(sink.checkpoints.map((checkpoint) => checkpoint.tick), [0, 50, 100, 140]);
  assert.equal(sink.checkpoints[0]?.population, 8);
  assert.equal(sink.checkpoints.at(-1)?.tick, result.tick);
  assert.ok(progress.some((record) => record.timing?.latestChunk?.processedTicks));
  assertTimingMatchesSinkCalls(timing, sink);
}

async function testHeadlessBufferedFlushFailureWritesFailedStatus() {
  const sink = createFailingBatchMemorySink((batch, flushIndex) => flushIndex === 2 && batch.runCompletions.length === 0);
  await assert.rejects(() =>
    runHeadlessSineExperiment({
      runId: "headless-buffer-failure",
      ticks: 20,
      seed: 101,
      spawnerConfig: { initialSpawners: 4, maxSpawners: 4 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 10,
      chunkTicks: 10,
      sink: sink.sink,
    }),
  );
  assert.equal(sink.runs.length, 1);
  assert.equal(sink.completions.at(-1)?.status, "failed");
  assert.equal(sink.completions.at(-1)?.terminationReason, "error");
}

async function testHeadlessBufferedFinalizationFailureWritesFailedStatus() {
  const sink = createFailingBatchMemorySink((batch) => batch.runCompletions.some((record) => record.status === "completed"));
  await assert.rejects(() =>
    runHeadlessSineExperiment({
      runId: "headless-finalize-failure",
      ticks: 5,
      seed: 101,
      spawnerConfig: { initialSpawners: 4, maxSpawners: 4 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 5,
      chunkTicks: 5,
      sink: sink.sink,
    }),
  );
  assert.equal(sink.completions.some((record) => record.status === "completed"), false);
  assert.equal(sink.completions.at(-1)?.status, "failed");
  assert.equal(sink.completions.at(-1)?.terminationReason, "error");
}

async function testHeadlessStopsWhenPopulationExtinct() {
  const sink = createMemorySink();
  const result = await runHeadlessSineExperiment({
    runId: "headless-extinct",
    ticks: 100,
    seed: 101,
    spawnerConfig: {
      initialSpawners: 3,
      maxSpawners: 3,
      initialEnergyMin: 0,
      initialEnergyMax: 0,
      deathEnergy: 1,
    },
    minimumResolvedTrades: 0,
    checkpointIntervalTicks: 5,
    sink: sink.sink,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.terminationReason, "population_extinct");
  assert.equal(sink.completions[0]?.terminationReason, "population_extinct");
  assert.equal(result.tick, 1);
  assert.equal(result.simulation.world.spawners.length, 0);
  assert.equal(sink.checkpoints.at(-1)?.population, 0);
}

function testDeadAgentCanQualifyFromPostDeathResolution() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const sink = createMemorySink();
  const recorder = createTestRecorder(simulation, sink, 1);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  recorder.recordFounders();

  const food = pendingSpawnerFood(spawner.id, spawner.lineageId);
  recorder.recordEvent({ id: 1, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: food.id, foodEvent: food });
  recorder.recordEvent({
    id: 2,
    kind: "death",
    tick: 2,
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    spawnerSnapshot: createSpawnerSnapshot({ ...spawner, health: 0 }),
  });
  recorder.recordEvent({
    id: 3,
    kind: "resolve",
    tick: food.resolveTick,
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    foodId: food.id,
    status: "win",
    payoff: 1.25,
    foodEvent: { ...food, status: "win", exitSignal: 2, payoff: 1.25 },
  });
  recorder.finalize();

  assert.equal(sink.agents.get(spawner.id)?.eligible, true);
  assert.equal(sink.trades.length, 1);
  assert.equal(sink.metrics[0]?.resolvedTrades, 1);
  assert.equal(sink.metrics[0]?.deathTick, 2);
  assert.ok(sink.snapshots.some((snapshot) => snapshot.spawnerId === spawner.id && snapshot.reason === "death"));
}

function testHeadlessRecorderManualLifecycleCharacterization() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 2 }, { seed: 101 });
  const sink = createMemorySink();
  const recorder = createTestRecorder(simulation, sink, 2);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const child = createSpawnerSnapshot({
    ...spawner,
    id: spawner.id + 100,
    parentSpawnerId: spawner.id,
    birthTick: 3,
    generation: spawner.generation + 1,
    children: 0,
    spawnedCount: 0,
    resolvedCount: 0,
    wins: 0,
    losses: 0,
    totalPayoff: 0,
    recentPayoffs: [],
  });

  recorder.recordFounders();
  assert.deepEqual(sink.events.map((event) => event.kind), ["birth"]);
  assert.equal(sink.snapshots.length, 0);
  assert.equal(sink.trades.length, 0);

  const firstFood = recorderFood(spawner.id, spawner.lineageId, 1, 4, 5, "long", 1, "win");
  recorder.recordEvent({ id: 1, kind: "spawn", tick: 4, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: firstFood.id, foodEvent: { ...firstFood, status: "pending", payoff: undefined, exitSignal: undefined } });
  recorder.recordEvent({ id: 2, kind: "resolve", tick: 5, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: firstFood.id, status: "win", payoff: 1, foodEvent: firstFood });
  assert.equal(sink.trades.length, 0);
  assert.equal(sink.snapshots.length, 0);
  assert.equal(sink.agentEligibilities.length, 0);

  recorder.recordEvent({
    id: 3,
    kind: "reproduction",
    tick: 6,
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    childSpawnerId: child.id,
    spawnerSnapshot: createSpawnerSnapshot(spawner),
    childSpawnerSnapshot: child,
  });
  assert.deepEqual(sink.events.map((event) => event.kind), ["birth", "reproduction", "birth"]);
  assert.equal(sink.agents.get(child.id)?.parentSpawnerId, spawner.id);
  assert.equal(sink.snapshots.length, 0);

  const secondFood = recorderFood(spawner.id, spawner.lineageId, 2, 7, 8, "short", -0.5, "loss");
  recorder.recordEvent({ id: 4, kind: "spawn", tick: 7, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: secondFood.id, foodEvent: { ...secondFood, status: "pending", payoff: undefined, exitSignal: undefined } });
  recorder.recordEvent({ id: 5, kind: "resolve", tick: 8, spawnerId: spawner.id, lineageId: spawner.lineageId, foodId: secondFood.id, status: "loss", payoff: -0.5, foodEvent: secondFood });

  assert.deepEqual(sink.agentEligibilities, [{ runId: "manual", spawnerId: spawner.id, eligible: true, eligibleTick: 8, resolvedTrades: 2 }]);
  assert.equal(sink.agents.get(spawner.id)?.eligible, true);
  assert.deepEqual(sink.trades.map((trade) => [trade.foodId, trade.status, trade.payoff]), [
    [1, "win", 1],
    [2, "loss", -0.5],
  ]);
  assert.deepEqual(sink.snapshots.filter((snapshot) => snapshot.spawnerId === spawner.id).map((snapshot) => snapshot.reason), ["birth", "reproduction"]);
  assert.equal(sink.methodCalls.writeCoreTrade, 4);

  recorder.recordEvent({
    id: 6,
    kind: "death",
    tick: 10,
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    deathCause: "low_energy",
    spawnerSnapshot: createSpawnerSnapshot({ ...spawner, energy: 0 }),
  });
  recorder.finalize();

  assert.deepEqual(sink.events.map((event) => event.kind), ["birth", "reproduction", "birth", "death"]);
  assert.deepEqual(sink.agentDeaths, [{ runId: "manual", spawnerId: spawner.id, deathTick: 10, deathSourceTimestamp: null, deathSourceDatetime: null }]);
  assert.deepEqual(sink.snapshots.filter((snapshot) => snapshot.spawnerId === spawner.id).map((snapshot) => snapshot.reason), ["birth", "reproduction", "death"]);
  assert.deepEqual(sink.snapshots.filter((snapshot) => snapshot.spawnerId === child.id).map((snapshot) => snapshot.reason), []);
  assert.equal(sink.methodCalls.writeMetrics, 4);
  assert.deepEqual(recorder.summary(), {
    eligibleAgents: 1,
    resolvedTrades: 2,
    wins: 1,
    losses: 1,
    hitRate: 0.5,
    cumulativePayoff: 0.5,
    averagePayoff: 0.25,
  });
  assert.equal(sink.metrics[0]?.deathTick, 10);
  assert.equal(sink.metrics[0]?.children, 1);
  assert.equal(sink.metrics[0]?.resolvedTrades, 2);
}

function testSnapshotAndReseedPolicyPreserveBrainOnly() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  spawner.hiddenState[spawner.genome.units[0]?.unitId ?? 0] = 0.5;
  spawner.learnedState.recentLearningSignal = 0.25;
  const snapshot = createSpawnerSnapshot(spawner);
  const roundTripped = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(roundTripped.genome, snapshot.genome);
  assert.deepEqual(roundTripped.hiddenState, snapshot.hiddenState);
  assert.deepEqual(roundTripped.learnedState, snapshot.learnedState);

  const policy = seedBankReseedPolicy(snapshot);
  assert.deepEqual(policy.preserved.genome, snapshot.genome);
  assert.deepEqual(policy.preserved.hiddenState, snapshot.hiddenState);
  assert.deepEqual(policy.preserved.learnedState, snapshot.learnedState);
  assert.equal(policy.resetRuntimeState.energy, true);
  assert.equal(policy.resetRuntimeState.openTrades, true);
  assert.equal(policy.resetRuntimeState.traceStore, true);
}

async function testCandleRunStoresLifecycleTimestamps() {
  const sink = createMemorySink();
  const candles: HeadlessCandleLoadResult = {
    snappedStartTimestamp: 1_700_000_300,
    snappedStartDatetime: "2023-11-14T22:18:20.000Z",
    candles: [
      candle(1_700_000_000, 100, false),
      candle(1_700_000_300, 101, true),
      candle(1_700_000_600, 102, false),
      candle(1_700_000_900, 103, false),
      candle(1_700_001_200, 104, false),
      candle(1_700_001_500, 105, false),
    ],
  };
  await runHeadlessSineExperiment({
    runId: "headless-candle",
    ticks: 3,
    seed: 101,
    marketConfig: { ...INITIAL_MARKET_RUNTIME_CONFIG, source: "btcusd_5m" },
    spawnerConfig: { initialSpawners: 2, maxSpawners: 2 },
    minimumResolvedTrades: 0,
    sink: sink.sink,
    candleLoader: async () => candles,
  });
  const birth = sink.events.find((event) => event.kind === "birth");
  assert.ok(birth);
  assert.equal(birth.sourceTimestamp, 1_700_000_300);
  assert.equal(birth.sourceDatetime, "2023-11-14T22:18:20.000Z");
}

async function testHeadlessMarketEndFlushesCompletion() {
  const sink = createMemorySink();
  const candles: HeadlessCandleLoadResult = {
    snappedStartTimestamp: 1_700_000_300,
    snappedStartDatetime: "2023-11-14T22:18:20.000Z",
    candles: [
      candle(1_700_000_000, 100, false),
      candle(1_700_000_300, 101, true),
    ],
  };
  const result = await runHeadlessSineExperiment({
    runId: "headless-market-end",
    ticks: 20,
    seed: 101,
    marketConfig: { ...INITIAL_MARKET_RUNTIME_CONFIG, source: "btcusd_5m" },
    spawnerConfig: { initialSpawners: 2, maxSpawners: 2 },
    minimumResolvedTrades: 0,
    checkpointIntervalTicks: 5,
    chunkTicks: 5,
    sink: sink.sink,
    candleLoader: async () => candles,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.terminationReason, "market_end");
  assert.equal(sink.completions.at(-1)?.terminationReason, "market_end");
  assert.ok(sink.checkpoints.length > 0);
  assert.ok(result.timing.sinkFlushes > 0);
}

async function testHeadlessUnifiedDbFacadeAndCascade() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const sineRepositoryModule = await import(new URL("../../server/sineRepository.mjs", import.meta.url).href);
  const sineDbModule = await import(new URL("../../server/sineDb.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  const runId = `headless-db-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  try {
    sineRepositoryModule.deleteSineSession(runId);
    const result = await runHeadlessSineExperiment({
      runId,
      ticks: 120,
      seed: 101,
      spawnerConfig: { initialSpawners: 8, maxSpawners: 8 },
      minimumResolvedTrades: 1,
      sink: repository.sink,
    });
    const counts = repository.counts(result.runId);
    assert.deepEqual(counts, { runs: 1, agents: 8, events: 8, trades: 30, snapshots: 10, metrics: 5, checkpoints: 2 });
    const checkpointTicks = (repository.listRunCheckpoints(result.runId) as Array<{ tick: number }>).map((checkpoint) => checkpoint.tick);
    assert.deepEqual(checkpointTicks, [0, 120]);
    const finalCheckpoint = repository.listRunCheckpoints(result.runId).at(-1);
    assert.equal(finalCheckpoint?.population, 8);
    assert.equal(finalCheckpoint?.eligibleAgents, 5);
    assert.equal(finalCheckpoint?.resolvedTrades, 26);
    assert.equal(finalCheckpoint?.wins, 16);
    assert.equal(finalCheckpoint?.losses, 10);
    const agentId = result.eligibleAgentIds[0];
    assert.ok(agentId);
    assert.equal(agentId, 3);
    const trades = repository.listAgentTrades(result.runId, agentId);
    const events = repository.listAgentEvents(result.runId, agentId);
    const snapshots = repository.listAgentSnapshots(result.runId, agentId);
    const metrics = repository.getAgentMetrics(result.runId, agentId);
    assert.equal(trades.length, 1);
    assert.equal(events.length, 1);
    assert.equal(snapshots.length, 2);
    assert.ok(metrics);
    assert.equal(metrics.resolved_trades, 1);
    assert.equal(metrics.wins, 0);
    assert.equal(metrics.losses, 1);
    assert.equal(round(metrics.cumulative_payoff), -1.262909);
    assert.equal(trades[0]?.foodId, 2);
    assert.equal(trades[0]?.spawnTick, 8);
    assert.equal(trades[0]?.resolveTick, 25);
    assert.equal(trades[0]?.status, "loss");
    assert.equal(round(trades[0]?.payoff ?? 0), -1.262909);
    assert.equal(events[0]?.event_kind, "birth");
    assert.equal(events[0]?.tick, 0);
    assert.equal(snapshots[0]?.reason, "birth");
    assert.equal(snapshots[0]?.tick, 0);
    assert.equal(snapshots[1]?.reason, "final");
    assert.equal(snapshots[1]?.tick, result.tick);
    assert.ok(snapshots[0]?.snapshot?.genome);
    assert.ok(snapshots[0]?.snapshot?.hiddenState);
    assert.ok(snapshots[0]?.snapshot?.learnedState);
    const run = repository.getRun(result.runId);
    const sineDb = sineDbModule.sineDb;
    const unifiedSession = sineRepositoryModule.listSineSessions(200).find((session: any) => session.id === runId);
    const unifiedBirths = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_spawner_births WHERE session_id = ?").get(runId) as any).count;
    const unifiedEligibility = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_eligibility WHERE session_id = ?").get(runId) as any).count;
    const unifiedReconstruction = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_reconstruction_snapshots WHERE session_id = ?").get(runId) as any).count;
    assert.equal(run?.tick, result.tick);
    assert.equal(run?.target_ticks, 120);
    assert.equal(run?.checkpoint_interval_ticks, 0);
    assert.equal(run?.termination_reason, "target");
    assert.equal(existsSync(dbPath), false);
    assert.equal(unifiedSession?.runMode, "headless");
    assert.equal(unifiedSession?.status, "completed");
    assert.equal(unifiedBirths, 8);
    assert.equal(unifiedEligibility, 5);
    assert.equal(unifiedReconstruction, 10);
    assert.equal(repository.getLatestRun()?.id, result.runId);
    assert.equal(repository.deleteRun(result.runId), 1);
    assert.equal(repository.getRun(result.runId), null);
    assert.deepEqual(repository.counts(result.runId), { runs: 0, agents: 0, events: 0, trades: 0, snapshots: 0, metrics: 0, checkpoints: 0 });
  } finally {
    repository.close();
    sineRepositoryModule.deleteSineSession(runId);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessUnifiedSourceTimestampsUseUnixSeconds() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-source-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const runId = `test-headless-source-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const sineRepositoryModule = await import(new URL("../../server/sineRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 1 }, { seed: 101 });
  const founder = simulation.world.spawners[0];
  assert.ok(founder);
  const child = structuredClone(founder);
  child.id = 2;
  child.parentSpawnerId = founder.id;
  child.birthTick = 10;
  const founderBirthTimestamp = 1_700_000_300;
  const childBirthTimestamp = 1_700_000_600;
  const reproductionTimestamp = 1_700_000_900;
  const deathTimestamp = 1_700_001_200;
  const tradeEntryTimestamp = 1_700_001_500;
  const tradeExitTimestamp = 1_700_001_800;
  try {
    sineRepositoryModule.deleteSineSession(runId);
    repository.sink.writeRunStart({
      id: runId,
      createdAt: "2023-11-14T22:00:00.000Z",
      status: "running",
      marketConfig: INITIAL_SETTINGS,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      seed: 101,
      targetTicks: 100,
      checkpointIntervalTicks: 10,
      minimumResolvedTrades: 0,
    });
    repository.sink.writeAgent({
      runId,
      spawnerId: founder.id,
      lineageId: founder.lineageId,
      generation: founder.generation,
      parentSpawnerId: null,
      birthTick: 0,
      birthSourceTimestamp: founderBirthTimestamp,
      birthSourceDatetime: datetimeFromUnixSeconds(founderBirthTimestamp),
      eligible: false,
      spawner: founder,
    });
    repository.sink.writeAgent({
      runId,
      spawnerId: child.id,
      lineageId: child.lineageId,
      generation: child.generation,
      parentSpawnerId: founder.id,
      birthTick: child.birthTick,
      birthSourceTimestamp: childBirthTimestamp,
      birthSourceDatetime: datetimeFromUnixSeconds(childBirthTimestamp),
      eligible: false,
      spawner: child,
    });
    repository.sink.writeAgentEvent({
      runId,
      eventId: 1,
      kind: "reproduction",
      spawnerId: founder.id,
      lineageId: founder.lineageId,
      tick: 10,
      sourceTimestamp: reproductionTimestamp,
      sourceDatetime: datetimeFromUnixSeconds(reproductionTimestamp),
      childSpawnerId: child.id,
      parentSpawnerId: founder.id,
      event: { kind: "reproduction", childSpawnerId: child.id, parentSpawnerId: founder.id },
    });
    repository.sink.writeAgentEvent({
      runId,
      eventId: 2,
      kind: "death",
      spawnerId: founder.id,
      lineageId: founder.lineageId,
      tick: 20,
      sourceTimestamp: deathTimestamp,
      sourceDatetime: datetimeFromUnixSeconds(deathTimestamp),
      event: { kind: "death", spawnerSnapshot: founder, deathCause: "low_energy" },
    });
    repository.sink.writeCoreTrade({
      runId,
      spawnerId: founder.id,
      lineageId: founder.lineageId,
      foodId: 1,
      spawnTick: 12,
      resolveTick: 14,
      direction: "long",
      strength: 1,
      horizonTicks: 2,
      entrySignal: 1,
      exitSignal: 2,
      entryPayoffScale: 1,
      entryPrice: 100,
      exitPrice: 101,
      sourceTimestamp: tradeEntryTimestamp,
      sourceDatetime: datetimeFromUnixSeconds(tradeEntryTimestamp),
      exitSourceTimestamp: tradeExitTimestamp,
      exitSourceDatetime: datetimeFromUnixSeconds(tradeExitTimestamp),
      status: "win",
      payoff: 1,
      food: {
        id: 1,
        creatorSpawnerId: founder.id,
        creatorLineageId: founder.lineageId,
        spawnTick: 12,
        resolveTick: 14,
        direction: "long",
        strength: 1,
        horizonTicks: 2,
        entrySignal: 1,
        exitSignal: 2,
        entryPayoffScale: 1,
        sourceTimestamp: tradeEntryTimestamp,
        exitSourceTimestamp: tradeExitTimestamp,
        payoff: 1,
        status: "win",
      },
    });

    const founderMetrics = repository.getAgentMetrics(runId, founder.id);
    const childMetrics = repository.getAgentMetrics(runId, child.id);
    const events = repository.listAgentEvents(runId, founder.id);
    const trades = repository.listAgentTrades(runId, founder.id);

    assert.equal(datetimeFromUnixSeconds(founderBirthTimestamp), "2023-11-14T22:18:20.000Z");
    assert.equal(dateFromUnixSeconds(founderBirthTimestamp)?.toISOString(), "2023-11-14T22:18:20.000Z");
    assert.equal(founderMetrics?.birth_source_timestamp, founderBirthTimestamp);
    assert.equal(founderMetrics?.birth_source_datetime, "2023-11-14T22:18:20.000Z");
    assert.equal(childMetrics?.birth_source_timestamp, childBirthTimestamp);
    assert.equal(childMetrics?.birth_source_datetime, "2023-11-14T22:23:20.000Z");
    assert.equal(founderMetrics?.death_source_timestamp, deathTimestamp);
    assert.equal(founderMetrics?.death_source_datetime, "2023-11-14T22:33:20.000Z");
    assert.equal(events.find((event: any) => event.event_kind === "reproduction")?.source_datetime, "2023-11-14T22:28:20.000Z");
    assert.equal(events.find((event: any) => event.event_kind === "death")?.source_datetime, "2023-11-14T22:33:20.000Z");
    assert.equal(trades[0]?.sourceDatetime, "2023-11-14T22:38:20.000Z");
    assert.equal(trades[0]?.exitSourceDatetime, "2023-11-14T22:43:20.000Z");
    assert.equal(datetimeFromUnixSeconds(null), null);
    assert.equal(datetimeFromUnixSeconds(undefined), null);
    assert.equal(datetimeFromUnixSeconds(Number.NaN), null);
    assert.equal(dateFromUnixSeconds(Number.NaN), null);
    assert.equal(nullableUnixSeconds(null), null);
    assert.equal(nullableUnixSeconds(undefined), null);
    assert.equal(nullableUnixSeconds(Number.POSITIVE_INFINITY), null);
  } finally {
    repository.close();
    sineRepositoryModule.deleteSineSession(runId);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessWritesUnifiedCoreHistoryWithGatedReconstruction() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-unified-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const runId = `test-headless-unified-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const deathRunId = `${runId}-death`;
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const sineRepositoryModule = await import(new URL("../../server/sineRepository.mjs", import.meta.url).href);
  const sineDbModule = await import(new URL("../../server/sineDb.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  const sineDb = sineDbModule.sineDb;
  try {
    sineRepositoryModule.deleteSineSession(runId);
    sineRepositoryModule.deleteSineSession(deathRunId);
    const result = await runHeadlessSineExperiment({
      runId,
      ticks: 120,
      seed: 101,
      spawnerConfig: { initialSpawners: 8, maxSpawners: 8 },
      minimumResolvedTrades: 999,
      sink: repository.sink,
    });
    const session = sineRepositoryModule.listSineSessions(200).find((candidate: any) => candidate.id === runId);
    const unifiedCounts = repository.counts(result.runId);
    const coreBirths = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_spawner_births WHERE session_id = ?").get(runId) as any).count;
    const coreSpawnedFoods = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_food_events WHERE session_id = ? AND event_kind = 'spawn'").get(runId) as any).count;
    const coreResolvedFoods = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_food_events WHERE session_id = ? AND event_kind = 'resolve'").get(runId) as any).count;
    const eligibilityRows = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_eligibility WHERE session_id = ?").get(runId) as any).count;
    const reconstructionRows = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_reconstruction_snapshots WHERE session_id = ?").get(runId) as any).count;
    const checkpointRows = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_run_checkpoints WHERE session_id = ?").get(runId) as any).count;
    const analysis = sineRepositoryModule.getSineSessionAnalysis(runId);

    assert.equal(result.status, "completed");
    assert.equal(session?.runMode, "headless");
    assert.equal(session?.status, "completed");
    assert.equal(session?.targetTicks, 120);
    assert.equal(session?.minimumResolvedTrades, 999);
    assert.equal(session?.latestTick, 120);
    assert.equal(unifiedCounts.agents, 8);
    assert.equal(unifiedCounts.trades, coreSpawnedFoods);
    assert.equal(unifiedCounts.snapshots, 0);
    assert.equal(unifiedCounts.metrics, 0);
    assert.equal(coreBirths, 8);
    assert.ok(coreSpawnedFoods > 0);
    assert.ok(coreResolvedFoods > 0);
    assert.equal(eligibilityRows, 0);
    assert.equal(reconstructionRows, 0);
    assert.ok(checkpointRows >= 2);
    assert.equal(analysis?.session.runMode, "headless");
    assert.equal(analysis?.session.status, "completed");
    assert.equal(analysis?.diagnostics.health.spawnedTrades, coreSpawnedFoods);
    assert.equal(analysis?.diagnostics.health.resolvedTrades, coreResolvedFoods);

    const deathResult = await runHeadlessSineExperiment({
      runId: deathRunId,
      ticks: 10,
      seed: 101,
      spawnerConfig: {
        initialSpawners: 3,
        maxSpawners: 3,
        initialEnergyMin: 1,
        initialEnergyMax: 1,
        initialCooldownMaxTicks: 0,
        energyDrainPerTick: 5,
        brainEnergyCostPerActiveUnit: 0,
        brainEnergyCostPerActiveConnection: 0,
        brainEnergyCostPerActiveLayer: 0,
      },
      minimumResolvedTrades: 999,
      sink: repository.sink,
    });
    const deathSession = sineRepositoryModule.getSineSessionAnalysis(deathRunId);
    const coreDeaths = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_spawner_deaths WHERE session_id = ?").get(deathRunId) as any).count;
    const coreDeathEvents = (sineDb.prepare("SELECT COUNT(*) AS count FROM sine_events WHERE session_id = ? AND event_kind = 'death'").get(deathRunId) as any).count;
    assert.equal(deathResult.terminationReason, "population_extinct");
    assert.equal(deathSession?.session.runMode, "headless");
    assert.equal(deathSession?.session.terminationReason, "population_extinct");
    assert.equal(coreDeaths, 3);
    assert.equal(coreDeathEvents, 3);
  } finally {
    repository.close();
    sineRepositoryModule.deleteSineSession(runId);
    sineRepositoryModule.deleteSineSession(deathRunId);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessRepositoryAcceptsAllClientSortKeys() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-sort-contract-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  const runId = "sort-contract";
  try {
    await deleteUnifiedSineSession(runId);
    repository.sink.writeRunStart({
      id: runId,
      createdAt: new Date().toISOString(),
      status: "completed",
      seed: 101,
      tick: 10,
      targetTicks: 10,
      checkpointIntervalTicks: 10,
      marketSource: "generated",
      minimumResolvedTrades: 1,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    });

    for (const sortKey of SINE_HEADLESS_AGENT_SORT_KEYS) {
      const result = repository.listAgentLeaderboard(runId, { sortKey, limit: 1 });
      assert.equal(Array.isArray(result.rows), true, sortKey);
    }
    for (const sortKey of SINE_HEADLESS_LINEAGE_SORT_KEYS) {
      const result = repository.listLineageLeaderboard(runId, { sortKey, limit: 1 });
      assert.equal(Array.isArray(result.rows), true, sortKey);
    }

    assert.equal(Array.isArray(repository.listAgentLeaderboard(runId, { sortKey: "unknown" as never, limit: 1 }).rows), true);
    assert.equal(Array.isArray(repository.listLineageLeaderboard(runId, { sortKey: "unknown" as never, limit: 1 }).rows), true);

    const context = repository.createRunAnalysisContext(runId);
    assert.deepEqual(context.counts(), repository.counts(runId));
    assert.deepEqual(context.listAgentLeaderboard({ limit: 1 }), repository.listAgentLeaderboard(runId, { limit: 1 }));
    assert.deepEqual(context.listLineageLeaderboard({ limit: 1 }), repository.listLineageLeaderboard(runId, { limit: 1 }));
    assert.deepEqual(context.listRunCheckpoints(), repository.listRunCheckpoints(runId));
  } finally {
    await deleteUnifiedSineSession(runId);
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessRepositoryBatchRollbackOnFailure() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-batch-failure-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  const runId = "rollback-run";
  try {
    await deleteUnifiedSineSession(runId);
    assert.equal(typeof repository.sink.writeBatch, "function");
    assert.throws(() =>
      repository.sink.writeBatch({
        ...emptyBatch(),
        runStarts: [runStartFixture(runId)],
        snapshots: [
          {
            runId,
            spawnerId: 1,
            lineageId: 1,
            generation: 1,
            tick: 0,
            sourceTimestamp: null,
            sourceDatetime: null,
            reason: "birth",
            schemaVersion: 1,
            snapshot: undefined as never,
          },
        ],
      }),
    );
    assert.deepEqual(repository.counts(runId), { runs: 0, agents: 0, events: 0, trades: 0, snapshots: 0, metrics: 0, checkpoints: 0 });
  } finally {
    await deleteUnifiedSineSession(runId);
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessInterruptedRunsAreMarkedFailed() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-interrupted-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  const runId = "interrupted";
  try {
    await deleteUnifiedSineSession(runId);
    repository.sink.writeRunStart({
      id: runId,
      createdAt: new Date().toISOString(),
      status: "running",
      seed: 101,
      tick: 0,
      marketSource: "generated",
      minimumResolvedTrades: 1,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    });
    repository.sink.writeRunCheckpoint({
      runId,
      tick: 42,
      sourceTimestamp: null,
      sourceDatetime: null,
      population: 3,
      eligibleAgents: 0,
      resolvedTrades: 0,
      wins: 0,
      losses: 0,
      hitRate: 0,
      cumulativePayoff: 0,
      averagePayoff: 0,
      tradesWritten: 0,
      snapshotsWritten: 0,
      createdAt: new Date().toISOString(),
    });
    repository.close();
    assert.equal(repositoryModule.markInterruptedSineHeadlessRunsFailed(dbPath), 1);
    const reopened = repositoryModule.createSineHeadlessRepository(dbPath);
    try {
      const run = reopened.getRun(runId);
      assert.equal(run?.status, "failed");
      assert.equal(run?.tick, 42);
      assert.equal(run?.termination_reason, "interrupted");
      assert.equal(run?.error, "Interrupted by server restart");
    } finally {
      reopened.close();
    }
  } finally {
    await deleteUnifiedSineSession(runId);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessJobManagerActiveConflictAndCancel() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-job-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const jobsModule = await import(new URL("../../server/sineHeadlessJobs.mjs", import.meta.url).href);
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const restoreConcurrency = setEnv("SINE_HEADLESS_MAX_CONCURRENT_RUNS", "1");
  const runIds = ["headless-job-cancel", "headless-job-conflict"];
  try {
    for (const runId of runIds) await deleteUnifiedSineSession(runId);
    assert.equal(jobsModule.listActiveSineHeadlessJobs().length, 0);
    const first = jobsModule.startSineHeadlessJob({
      runId: "headless-job-cancel",
      ticks: 50000,
      seed: 101,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 10, maxSpawners: 10 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 1000,
      chunkTicks: 1000,
      dbPath,
    });
    assert.equal(first.ok, true);
    assert.equal(first.job.chunkTicks, HEADLESS_INTERACTIVE_MAX_CHUNK_TICKS);
    assert.equal(jobsModule.listActiveSineHeadlessJobs().length, 1);
    assert.equal(jobsModule.getSineHeadlessJobCapacity().maxConcurrentRuns, 1);
    assert.equal(jobsModule.getSineHeadlessJob("headless-job-cancel")?.job?.status, "running");
    const second = jobsModule.startSineHeadlessJob({
      runId: "headless-job-conflict",
      ticks: 10,
      seed: 101,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 10,
      dbPath,
    });
    assert.equal(second.ok, false);
    assert.equal(second.status, 409);
    assert.equal(jobsModule.sanitizeSineHeadlessJobOptions({}).chunkTicks, HEADLESS_INTERACTIVE_CHUNK_TICKS);
    assert.equal(jobsModule.sanitizeSineHeadlessJobOptions({ chunkTicks: 1000 }).chunkTicks, HEADLESS_INTERACTIVE_MAX_CHUNK_TICKS);
    const cancel = jobsModule.cancelSineHeadlessJob("headless-job-cancel");
    assert.ok(cancel);
    assert.equal(cancel.status, "cancel_requested");
    await waitFor(() => jobsModule.getActiveSineHeadlessJob() === null);

    const repository = repositoryModule.createSineHeadlessRepository(dbPath);
    try {
      const run = repository.getRun("headless-job-cancel");
      assert.equal(run?.status, "cancelled");
      assert.equal(run?.termination_reason, "cancelled");
      assert.ok(repository.counts("headless-job-cancel").checkpoints > 0);
    } finally {
      repository.close();
    }
  } finally {
    restoreConcurrency();
    const repository = repositoryModule.createSineHeadlessRepository(dbPath);
    try {
      for (const runId of runIds) repository.deleteRun(runId);
    } finally {
      repository.close();
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessJobManagerRunsTwoActiveJobsConcurrently() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-job-concurrency-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const jobsModule = await import(new URL("../../server/sineHeadlessJobs.mjs", import.meta.url).href);
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const restoreConcurrency = setEnv("SINE_HEADLESS_MAX_CONCURRENT_RUNS", "2");
  const runIds = ["headless-concurrent-a", "headless-concurrent-b", "headless-concurrent-rejected"];
  try {
    for (const runId of runIds) await deleteUnifiedSineSession(runId);
    assert.equal(jobsModule.listActiveSineHeadlessJobs().length, 0);
    const first = jobsModule.startSineHeadlessJob({
      runId: "headless-concurrent-a",
      ticks: 50000,
      seed: 101,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 12, maxSpawners: 12 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 1000,
      chunkTicks: 1000,
      dbPath,
    });
    const second = jobsModule.startSineHeadlessJob({
      runId: "headless-concurrent-b",
      ticks: 50000,
      seed: 202,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 12, maxSpawners: 12 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 1000,
      chunkTicks: 1000,
      dbPath,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(jobsModule.listActiveSineHeadlessJobs().length, 2);
    assert.equal(jobsModule.getSineHeadlessJobCapacity().capacityFull, true);
    assert.ok(jobsModule.getActiveSineHeadlessJob());

    const third = jobsModule.startSineHeadlessJob({
      runId: "headless-concurrent-rejected",
      ticks: 10,
      seed: 303,
      marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      spawnerConfig: DEFAULT_SPAWNER_CONFIG,
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 10,
      dbPath,
    });
    assert.equal(third.ok, false);
    assert.equal(third.status, 409);

    const cancelFirst = jobsModule.cancelSineHeadlessJob("headless-concurrent-a");
    assert.equal(cancelFirst?.status, "cancel_requested");
    assert.ok(jobsModule.listActiveSineHeadlessJobs().some((job: { runId: string; status: string }) => job.runId === "headless-concurrent-b" && job.status === "running"));
    await waitFor(() => !jobsModule.listActiveSineHeadlessJobs().some((job: { runId: string }) => job.runId === "headless-concurrent-a"));

    const remainingSecond = jobsModule.getSineHeadlessJob("headless-concurrent-b")?.job;
    if (remainingSecond) {
      const cancelSecond = jobsModule.cancelSineHeadlessJob("headless-concurrent-b");
      assert.equal(cancelSecond?.status, "cancel_requested");
    }
    await waitFor(() => jobsModule.listActiveSineHeadlessJobs().length === 0);

    const repository = repositoryModule.createSineHeadlessRepository(dbPath);
    try {
      const firstRun = repository.getRun("headless-concurrent-a");
      const secondRun = repository.getRun("headless-concurrent-b");
      assert.equal(firstRun?.status, "cancelled");
      assert.ok(secondRun?.status === "cancelled" || secondRun?.status === "completed");
      assert.ok(repository.counts("headless-concurrent-a").checkpoints > 0);
      assert.ok(repository.counts("headless-concurrent-b").checkpoints > 0);
      assert.equal(repository.getRun("headless-concurrent-rejected"), null);
    } finally {
      repository.close();
    }
  } finally {
    restoreConcurrency();
    const repository = repositoryModule.createSineHeadlessRepository(dbPath);
    try {
      for (const runId of runIds) repository.deleteRun(runId);
    } finally {
      repository.close();
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testIsolatedHeadlessWorkerMatchesDirectStrictDigest() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-isolated-parity-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const runId = "headless-isolated-digest";
  try {
    const directSink = createMemorySink();
    const direct = await runHeadlessSineExperiment({
      runId: "headless-direct-digest",
      ticks: 90,
      seed: 101,
      spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 30,
      chunkTicks: 25,
      sink: directSink.sink,
    });
    const isolated = await runIsolatedHeadlessWorker({
      runId,
      ticks: 90,
      seed: 101,
      spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 30,
      chunkTicks: 25,
      dbPath,
    });
    assert.equal(isolated.status, "completed");
    assert.equal(isolated.tick, 90);
    assert.deepEqual(isolated.strictDigest, strictWorldDigest(direct.simulation.world));
    assert.equal(existsSync(dbPath), false);
  } finally {
    await deleteUnifiedSineSession(runId);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testConcurrentIsolatedWorkersPreserveStrictDigest() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-isolated-concurrency-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const runIds = ["headless-isolated-concurrent-same-seed", "headless-isolated-concurrent-neighbor"];
  try {
    for (const runId of runIds) await deleteUnifiedSineSession(runId);
    const directSink = createMemorySink();
    const direct = await runHeadlessSineExperiment({
      runId: "headless-direct-concurrent-digest",
      ticks: 90,
      seed: 101,
      spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
      minimumResolvedTrades: 1,
      checkpointIntervalTicks: 30,
      chunkTicks: 25,
      sink: directSink.sink,
    });
    const repository = repositoryModule.createSineHeadlessRepository(dbPath);
    repository.close();
    const [sameSeed, neighbor] = await Promise.all([
      runIsolatedHeadlessWorker({
        runId: runIds[0],
        ticks: 90,
        seed: 101,
        spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
        minimumResolvedTrades: 1,
        checkpointIntervalTicks: 30,
        chunkTicks: 25,
        dbPath,
        assumeInitializedDb: true,
      }),
      runIsolatedHeadlessWorker({
        runId: runIds[1],
        ticks: 90,
        seed: 202,
        spawnerConfig: { initialSpawners: 12, maxSpawners: 12 },
        minimumResolvedTrades: 1,
        checkpointIntervalTicks: 30,
        chunkTicks: 25,
        dbPath,
        assumeInitializedDb: true,
      }),
    ]);
    assert.equal(sameSeed.status, "completed");
    assert.equal(neighbor.status, "completed");
    assert.deepEqual(sameSeed.strictDigest, strictWorldDigest(direct.simulation.world));
    assert.equal(existsSync(dbPath), false);
  } finally {
    for (const runId of runIds) await deleteUnifiedSineSession(runId);
    rmSync(dir, { recursive: true, force: true });
  }
}

function testHeadlessChunkPolicyDefaultsAndCaps() {
  assert.equal(sanitizeHeadlessChunkTicks(undefined, "interactive"), HEADLESS_INTERACTIVE_CHUNK_TICKS);
  assert.equal(sanitizeHeadlessChunkTicks(1000, "interactive"), HEADLESS_INTERACTIVE_MAX_CHUNK_TICKS);
  assert.equal(sanitizeHeadlessChunkTicks(0, "interactive"), 1);
  assert.equal(sanitizeHeadlessChunkTicks(undefined, "throughput"), HEADLESS_THROUGHPUT_CHUNK_TICKS);
  assert.equal(sanitizeHeadlessChunkTicks(2500, "throughput"), 2500);
  assert.equal(sanitizeHeadlessChunkTicks(37, "benchmark"), 37);
}

async function testHeadlessConcurrencyPolicyDefaultsAndOverrides() {
  const concurrencyModule = await import(new URL("../../server/sineHeadlessConcurrency.mjs", import.meta.url).href);
  const jobsModule = await import(new URL("../../server/sineHeadlessJobs.mjs", import.meta.url).href);
  assert.equal(concurrencyModule.maxConcurrentSineHeadlessJobs({}), 4);
  assert.equal(concurrencyModule.maxConcurrentSineHeadlessJobs({ SINE_HEADLESS_MAX_CONCURRENT_RUNS: "3" }), 3);
  assert.equal(concurrencyModule.maxConcurrentSineHeadlessJobs({ SINE_HEADLESS_MAX_CONCURRENT_RUNS: "0" }), 1);
  assert.equal(concurrencyModule.maxConcurrentSineHeadlessJobs({ SINE_HEADLESS_MAX_CONCURRENT_RUNS: "not-a-number" }), 4);
  assert.equal(jobsModule.sanitizeSineHeadlessJobOptions({}).resolvedTradeSnapshotInterval, DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL);
  assert.equal(jobsModule.sanitizeSineHeadlessJobOptions({ resolvedTradeSnapshotInterval: 7 }).resolvedTradeSnapshotInterval, 7);
  assert.equal(jobsModule.sanitizeSineHeadlessJobOptions({ resolvedTradeSnapshotInterval: -1 }).resolvedTradeSnapshotInterval, 0);
}

export const tests: SineTest[] = [
  { name: "Headless Recorder Preserves Runtime Digest", run: testHeadlessRecorderPreservesRuntimeDigest },
  { name: "Generated Run Eligibility And Metrics", run: testGeneratedRunEligibilityAndMetrics },
  { name: "Headless Trade Interval Snapshots Capture Post Learning State", run: testHeadlessTradeIntervalSnapshotsCapturePostLearningState },
  { name: "Headless Trade Interval Snapshots Can Be Disabled", run: testHeadlessTradeIntervalSnapshotsCanBeDisabled },
  { name: "Headless Trade Interval Snapshots Deduplicate Same Tick Resolves", run: testHeadlessTradeIntervalSnapshotsDeduplicateSameTickResolves },
  { name: "Headless Trade Interval Snapshots Flush After Eligibility", run: testHeadlessTradeIntervalSnapshotsFlushAfterEligibility },
  { name: "Headless Final Snapshots Cover Eligible Live Agents Only", run: testHeadlessFinalSnapshotsCoverEligibleLiveAgentsOnly },
  { name: "Headless Checkpoints And Cancellation", run: testHeadlessCheckpointsAndCancellation },
  { name: "Headless Progress Emits Between Checkpoints", run: testHeadlessProgressEmitsBetweenCheckpoints },
  { name: "Headless Timing Tracks Sink And Runtime Phases", run: testHeadlessTimingTracksSinkAndRuntimePhases },
  { name: "Headless Buffered Flush Failure Writes Failed Status", run: testHeadlessBufferedFlushFailureWritesFailedStatus },
  { name: "Headless Buffered Finalization Failure Writes Failed Status", run: testHeadlessBufferedFinalizationFailureWritesFailedStatus },
  { name: "Headless Stops When Population Extinct", run: testHeadlessStopsWhenPopulationExtinct },
  { name: "Dead Agent Can Qualify From Post Death Resolution", run: testDeadAgentCanQualifyFromPostDeathResolution },
  { name: "Headless Recorder Manual Lifecycle Characterization", run: testHeadlessRecorderManualLifecycleCharacterization },
  { name: "Snapshot And Reseed Policy Preserve Brain Only", run: testSnapshotAndReseedPolicyPreserveBrainOnly },
  { name: "Candle Run Stores Lifecycle Timestamps", run: testCandleRunStoresLifecycleTimestamps },
  { name: "Headless Market End Flushes Completion", run: testHeadlessMarketEndFlushesCompletion },
  { name: "Headless Unified Db Facade And Cascade", run: testHeadlessUnifiedDbFacadeAndCascade },
  { name: "Headless Unified Source Timestamps Use Unix Seconds", run: testHeadlessUnifiedSourceTimestampsUseUnixSeconds },
  { name: "Headless Writes Unified Core History With Gated Reconstruction", run: testHeadlessWritesUnifiedCoreHistoryWithGatedReconstruction },
  { name: "Headless Repository Accepts All Client Sort Keys", run: testHeadlessRepositoryAcceptsAllClientSortKeys },
  { name: "Headless Repository Batch Rollback On Failure", run: testHeadlessRepositoryBatchRollbackOnFailure },
  { name: "Headless Interrupted Runs Are Marked Failed", run: testHeadlessInterruptedRunsAreMarkedFailed },
  { name: "Headless Job Manager Active Conflict And Cancel", run: testHeadlessJobManagerActiveConflictAndCancel },
  { name: "Headless Job Manager Runs Two Active Jobs Concurrently", run: testHeadlessJobManagerRunsTwoActiveJobsConcurrently },
  { name: "Isolated Headless Worker Matches Direct Strict Digest", run: testIsolatedHeadlessWorkerMatchesDirectStrictDigest },
  { name: "Concurrent Isolated Workers Preserve Strict Digest", run: testConcurrentIsolatedWorkersPreserveStrictDigest },
  { name: "Headless Chunk Policy Defaults And Caps", run: testHeadlessChunkPolicyDefaultsAndCaps },
  { name: "Headless Concurrency Policy Defaults And Overrides", run: testHeadlessConcurrencyPolicyDefaultsAndOverrides },
];

function createTestRecorder(
  simulation: ReturnType<typeof createSimulationState>,
  sink: MemorySink,
  minimumResolvedTrades: number,
  resolvedTradeSnapshotInterval?: number,
) {
  return createHeadlessRecorder({ runId: "manual", simulation, minimumResolvedTrades, resolvedTradeSnapshotInterval, sink: sink.sink });
}

function recorderFood(
  spawnerId: number,
  lineageId: number,
  id: number,
  spawnTick: number,
  resolveTick: number,
  direction: "long" | "short",
  payoff: number,
  status: "win" | "loss",
) {
  return {
    id,
    creatorSpawnerId: spawnerId,
    creatorLineageId: lineageId,
    spawnTick,
    resolveTick,
    direction,
    strength: 1,
    horizonTicks: resolveTick - spawnTick,
    entrySignal: 1,
    exitSignal: 1 + payoff,
    entryPayoffScale: 1,
    status,
    payoff,
  };
}

async function deleteUnifiedSineSession(runId: string) {
  const sineRepositoryModule = await import(new URL("../../server/sineRepository.mjs", import.meta.url).href);
  sineRepositoryModule.deleteSineSession(runId);
}

function runIsolatedHeadlessWorker(options: Record<string, unknown>): Promise<any> {
  const worker = new Worker(new URL("../../server/sineHeadlessJobWorker.mjs", import.meta.url), {
    workerData: {
      options,
      diagnostics: { strictDigest: true },
    },
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    worker.on("message", (message) => {
      if (message?.type === "result") {
        settled = true;
        resolve(message);
      } else if (message?.type === "error") {
        settled = true;
        reject(new Error(message.error ?? "Isolated headless worker failed"));
      }
    });
    worker.on("error", (error) => {
      settled = true;
      reject(error);
    });
    worker.on("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`Isolated headless worker exited with code ${code}`));
    });
  });
}

function assertTimingMatchesSinkCalls(timing: HeadlessTimingSnapshot, sink: MemorySink) {
  for (const [method, calls] of Object.entries(sink.methodCalls) as Array<[HeadlessSinkMethod, number]>) {
    assert.equal(timing.sinkMethods[method]?.calls, calls, method);
  }
  const totalCalls = Object.values(sink.methodCalls).reduce((sum, calls) => sum + (calls ?? 0), 0);
  assert.equal(timing.sinkWrites, totalCalls);
  assert.equal(timing.sinkEnqueues, totalCalls);
}

function round(value: number) {
  return Number(value.toFixed(6));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function setEnv(key: string, value: string) {
  const previous = process.env[key];
  process.env[key] = value;
  return () => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  };
}
