import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHeadlessRecorder } from "../../src/sine/headless/recorder";
import { SINE_HEADLESS_AGENT_SORT_KEYS, SINE_HEADLESS_LINEAGE_SORT_KEYS } from "../../src/sine/headless/headlessApi";
import { runHeadlessSineExperiment, type HeadlessCandleLoadResult } from "../../src/sine/headless/runner";
import { seedBankReseedPolicy } from "../../src/sine/headless/seedBankPolicy";
import type { HeadlessRunProgressRecord, HeadlessSinkMethod, HeadlessTimingSnapshot } from "../../src/sine/headless/types";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../../src/sine/marketRuntimeConfig";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import { createSpawnerSnapshot } from "../../src/sine/spawner/snapshots";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerEvent } from "../../src/sine/spawnerSimulation";
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

async function testHeadlessDbIsolationAndCascade() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  try {
    const result = await runHeadlessSineExperiment({
      runId: "headless-db",
      ticks: 120,
      seed: 101,
      spawnerConfig: { initialSpawners: 8, maxSpawners: 8 },
      minimumResolvedTrades: 1,
      sink: repository.sink,
    });
    const counts = repository.counts(result.runId);
    assert.deepEqual(counts, { runs: 1, agents: 8, events: 8, trades: 30, snapshots: 5, metrics: 5, checkpoints: 2 });
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
    assert.equal(snapshots.length, 1);
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
    assert.ok(snapshots[0]?.snapshot?.genome);
    assert.ok(snapshots[0]?.snapshot?.hiddenState);
    assert.ok(snapshots[0]?.snapshot?.learnedState);
    const run = repository.getRun(result.runId);
    assert.equal(run?.tick, result.tick);
    assert.equal(run?.target_ticks, 120);
    assert.equal(run?.checkpoint_interval_ticks, 0);
    assert.equal(run?.termination_reason, "target");
    assert.equal(repository.getLatestRun()?.id, result.runId);
    assert.equal(repository.deleteRun(result.runId), 1);
    assert.equal(repository.getLatestRun(), null);
    assert.deepEqual(repository.counts(result.runId), { runs: 0, agents: 0, events: 0, trades: 0, snapshots: 0, metrics: 0, checkpoints: 0 });
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessRepositoryAcceptsAllClientSortKeys() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-sort-contract-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  try {
    repository.sink.writeRunStart({
      id: "sort-contract",
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
      const result = repository.listAgentLeaderboard("sort-contract", { sortKey, limit: 1 });
      assert.equal(Array.isArray(result.rows), true, sortKey);
    }
    for (const sortKey of SINE_HEADLESS_LINEAGE_SORT_KEYS) {
      const result = repository.listLineageLeaderboard("sort-contract", { sortKey, limit: 1 });
      assert.equal(Array.isArray(result.rows), true, sortKey);
    }

    assert.equal(Array.isArray(repository.listAgentLeaderboard("sort-contract", { sortKey: "unknown" as never, limit: 1 }).rows), true);
    assert.equal(Array.isArray(repository.listLineageLeaderboard("sort-contract", { sortKey: "unknown" as never, limit: 1 }).rows), true);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessRepositoryBatchRollbackOnFailure() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-batch-failure-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  try {
    assert.equal(typeof repository.sink.writeBatch, "function");
    assert.throws(() =>
      repository.sink.writeBatch({
        ...emptyBatch(),
        runStarts: [runStartFixture("rollback-run")],
        snapshots: [
          {
            runId: "rollback-run",
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
    assert.deepEqual(repository.counts("rollback-run"), { runs: 0, agents: 0, events: 0, trades: 0, snapshots: 0, metrics: 0, checkpoints: 0 });
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessInterruptedRunsAreMarkedFailed() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-interrupted-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  const repository = repositoryModule.createSineHeadlessRepository(dbPath);
  try {
    repository.sink.writeRunStart({
      id: "interrupted",
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
      runId: "interrupted",
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
      const run = reopened.getRun("interrupted");
      assert.equal(run?.status, "failed");
      assert.equal(run?.tick, 42);
      assert.equal(run?.termination_reason, "interrupted");
      assert.equal(run?.error, "Interrupted by server restart");
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHeadlessJobManagerActiveConflictAndCancel() {
  const dir = mkdtempSync(join(tmpdir(), "sine-headless-job-test-"));
  const dbPath = join(dir, "headless.sqlite");
  const jobsModule = await import(new URL("../../server/sineHeadlessJobs.mjs", import.meta.url).href);
  const repositoryModule = await import(new URL("../../server/sineHeadlessRepository.mjs", import.meta.url).href);
  try {
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
    assert.equal(jobsModule.sanitizeSineHeadlessJobOptions({ chunkTicks: 1000 }).chunkTicks, 100);
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
    rmSync(dir, { recursive: true, force: true });
  }
}

export const tests: SineTest[] = [
  { name: "Headless Recorder Preserves Runtime Digest", run: testHeadlessRecorderPreservesRuntimeDigest },
  { name: "Generated Run Eligibility And Metrics", run: testGeneratedRunEligibilityAndMetrics },
  { name: "Headless Checkpoints And Cancellation", run: testHeadlessCheckpointsAndCancellation },
  { name: "Headless Progress Emits Between Checkpoints", run: testHeadlessProgressEmitsBetweenCheckpoints },
  { name: "Headless Timing Tracks Sink And Runtime Phases", run: testHeadlessTimingTracksSinkAndRuntimePhases },
  { name: "Headless Buffered Flush Failure Writes Failed Status", run: testHeadlessBufferedFlushFailureWritesFailedStatus },
  { name: "Headless Buffered Finalization Failure Writes Failed Status", run: testHeadlessBufferedFinalizationFailureWritesFailedStatus },
  { name: "Headless Stops When Population Extinct", run: testHeadlessStopsWhenPopulationExtinct },
  { name: "Dead Agent Can Qualify From Post Death Resolution", run: testDeadAgentCanQualifyFromPostDeathResolution },
  { name: "Snapshot And Reseed Policy Preserve Brain Only", run: testSnapshotAndReseedPolicyPreserveBrainOnly },
  { name: "Candle Run Stores Lifecycle Timestamps", run: testCandleRunStoresLifecycleTimestamps },
  { name: "Headless Market End Flushes Completion", run: testHeadlessMarketEndFlushesCompletion },
  { name: "Headless Db Isolation And Cascade", run: testHeadlessDbIsolationAndCascade },
  { name: "Headless Repository Accepts All Client Sort Keys", run: testHeadlessRepositoryAcceptsAllClientSortKeys },
  { name: "Headless Repository Batch Rollback On Failure", run: testHeadlessRepositoryBatchRollbackOnFailure },
  { name: "Headless Interrupted Runs Are Marked Failed", run: testHeadlessInterruptedRunsAreMarkedFailed },
  { name: "Headless Job Manager Active Conflict And Cancel", run: testHeadlessJobManagerActiveConflictAndCancel },
];

function createTestRecorder(simulation: ReturnType<typeof createSimulationState>, sink: MemorySink, minimumResolvedTrades: number) {
  return createHeadlessRecorder({ runId: "manual", simulation, minimumResolvedTrades, sink: sink.sink });
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
