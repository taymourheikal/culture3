import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INITIAL_SETTINGS } from "../src/sine/marketSignal";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { buildSinePersistencePacket } from "../src/sine/persistence/buildSinePersistencePacket";
import { createSimulationState } from "../src/sine/simulationRuntime";
import { DEFAULT_SPAWNER_CONFIG } from "../src/sine/spawnerSimulation";
import { runHeadlessSineExperiment, type HeadlessCandleLoadResult } from "../src/sine/headless/runner";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { createSineHeadlessRepository } from "../server/sineHeadlessRepository.mjs";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, getSineSessionAnalysis, listSineSessions, saveSinePersistenceBatch } from "../server/sineRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../server/sineDb.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
const toyMarketDbPath = join(dataDir, "toy-market.sqlite");
const obsoleteHeadlessDbPath = join(dataDir, "sine-headless.sqlite");
const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const labRunId = `smoke-lab-${runSuffix}`;
const completedHeadlessRunId = `smoke-headless-${runSuffix}`;
const cancelledHeadlessRunId = `smoke-headless-cancel-${runSuffix}`;
const failedHeadlessRunId = `smoke-headless-failed-${runSuffix}`;

type SmokeSessionSummary = {
  id: string;
  runMode: "lab" | "headless";
  status: string;
  marketSource?: string | null;
  targetTicks?: number | null;
  reconstructableAgents?: number;
  reconstructionSnapshots?: number;
};

type SmokeAgentSummary = {
  spawnerId: number;
  snapshotCount: number;
};

type SmokeSnapshotDetail = {
  snapshot?: {
    genome?: unknown;
    hiddenState?: unknown;
    learnedState?: unknown;
  } | null;
};

try {
  assert.equal(existsSync(obsoleteHeadlessDbPath), false, "obsolete sine-headless.sqlite should not exist before smoke");
  assert.equal(existsSync(toyMarketDbPath), true, "fresh startup should create toy-market.sqlite");
  assert.deepEqual(sineDb.prepare("PRAGMA foreign_key_check").all(), []);
  assertOldHeadlessTablesAbsent();

  saveLabRun(labRunId);
  const repository = createSineHeadlessRepository();
  try {
    await runCompletedHeadless(repository);
    await runCancelledHeadless(repository);
    await runFailedHeadless(repository);
  } finally {
    repository.close();
  }

  assertRunBrowserListsBothModes();
  assertDiagnostics(labRunId, "lab");
  assertDiagnostics(completedHeadlessRunId, "headless");
  assertReconstructionAvailability(completedHeadlessRunId);
  assertFailedAndCancelledRows();
  assertNoObsoleteDbCreated();

  console.log(JSON.stringify({
    ok: true,
    labRunId,
    completedHeadlessRunId,
    cancelledHeadlessRunId,
    failedHeadlessRunId,
  }, null, 2));
} finally {
  for (const runId of [labRunId, completedHeadlessRunId, cancelledHeadlessRunId, failedHeadlessRunId]) {
    deleteSineSession(runId);
  }
}

function saveLabRun(sessionId: string) {
  const spawnerConfig = { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 4, maxSpawners: 4 };
  const simulation = createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG, spawnerConfig, { seed: 101 });
  simulation.world.tick = 20;
  const packet = buildSinePersistencePacket({
    sessionId: sessionId as never,
    persistentSessionId: sessionId,
    status: "stopped",
    simulation,
    settings: INITIAL_SETTINGS,
    marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
    spawnerConfig,
    events: [],
    includeInitial: true,
    includeStateSnapshot: true,
    pendingUniquenessSnapshots: [],
    uniquenessScores: new Map(),
    includeFullUniquenessTick: null,
  });
  saveSinePersistenceBatch(packet);
}

async function runCompletedHeadless(repository: ReturnType<typeof createSineHeadlessRepository>) {
  const result = await runHeadlessSineExperiment({
    runId: completedHeadlessRunId,
    ticks: 120,
    seed: 101,
    spawnerConfig: { initialSpawners: 8, maxSpawners: 8 },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: 60,
    sink: repository.sink,
  });
  assert.equal(result.status, "completed");
  assert.ok(result.eligibleAgentIds.length > 0, "completed headless run should produce reconstructable agents");
}

async function runCancelledHeadless(repository: ReturnType<typeof createSineHeadlessRepository>) {
  const result = await runHeadlessSineExperiment({
    runId: cancelledHeadlessRunId,
    ticks: 100,
    seed: 202,
    spawnerConfig: { initialSpawners: 4, maxSpawners: 4 },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: 10,
    sink: repository.sink,
    shouldCancel: () => true,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.terminationReason, "cancelled");
}

async function runFailedHeadless(repository: ReturnType<typeof createSineHeadlessRepository>) {
  let calls = 0;
  await assert.rejects(
    () =>
      runHeadlessSineExperiment({
        runId: failedHeadlessRunId,
        ticks: 20,
        seed: 303,
        marketConfig: { ...INITIAL_MARKET_RUNTIME_CONFIG, source: "btcusd_5m" },
        spawnerConfig: { initialSpawners: 4, maxSpawners: 4 },
        minimumResolvedTrades: 1,
        checkpointIntervalTicks: 5,
        sink: repository.sink,
        candleLoader: async (): Promise<HeadlessCandleLoadResult> => {
          calls += 1;
          if (calls > 1) throw new Error("forced smoke candle refill failure");
          return { candles: smokeCandles(16), snappedStartDatetime: "2021-01-01T00:00:00.000Z" };
        },
      }),
    /forced smoke candle refill failure/,
  );
}

function assertRunBrowserListsBothModes() {
  const sessions = listSineSessions(200) as SmokeSessionSummary[];
  const lab = sessions.find((session) => session.id === labRunId);
  const completed = sessions.find((session) => session.id === completedHeadlessRunId);
  const cancelled = sessions.find((session) => session.id === cancelledHeadlessRunId);
  const failed = sessions.find((session) => session.id === failedHeadlessRunId);
  assert.equal(lab?.runMode, "lab");
  assert.equal(completed?.runMode, "headless");
  assert.equal(cancelled?.runMode, "headless");
  assert.equal(failed?.runMode, "headless");
  assert.equal(completed?.marketSource, "generated");
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(failed?.status, "failed");
  assert.ok((completed?.targetTicks ?? 0) > 0);
  assert.ok((completed?.reconstructableAgents ?? 0) > 0);
  assert.ok((completed?.reconstructionSnapshots ?? 0) > 0);
}

function assertDiagnostics(runId: string, mode: "lab" | "headless") {
  const analysis = getSineSessionAnalysis(runId);
  assert.ok(analysis);
  assert.equal(analysis.session.runMode, mode);
  assert.ok(analysis.diagnostics.health.latestTick >= 0);
}

function assertReconstructionAvailability(runId: string) {
  const repository = createSineHeadlessRepository();
  try {
    const leaderboard = repository.listAgentLeaderboard(runId, { minResolvedTrades: 1, limit: 50 });
    const reconstructable = (leaderboard.rows as SmokeAgentSummary[]).find((row) => row.snapshotCount > 0);
    assert.ok(reconstructable, "expected at least one reconstructable agent");
    const detail = repository.getAgentDetail(runId, reconstructable.spawnerId);
    const snapshot = (detail?.snapshots as SmokeSnapshotDetail[] | undefined)?.find((candidate) => candidate.snapshot?.genome && candidate.snapshot?.hiddenState && candidate.snapshot?.learnedState);
    assert.ok(snapshot, "expected reconstruction snapshot with genome, hidden state, and learned state");
  } finally {
    repository.close();
  }
}

function assertFailedAndCancelledRows() {
  assert.equal(getSineSessionAnalysis(cancelledHeadlessRunId)?.session.status, "cancelled");
  assert.equal(getSineSessionAnalysis(failedHeadlessRunId)?.session.status, "failed");
}

function assertOldHeadlessTablesAbsent() {
  const oldTables = [
    "sine_headless_runs",
    "sine_headless_agents",
    "sine_headless_agent_events",
    "sine_headless_agent_trades",
    "sine_headless_agent_snapshots",
    "sine_headless_agent_metrics",
  ];
  for (const table of oldTables) {
    const row = sineDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    assert.equal(row, undefined, `${table} should not exist`);
  }
  const reconstructionColumns = sineDb.prepare("PRAGMA table_info(sine_headless_reconstruction_snapshots)").all().map((row: any) => row.name);
  assert.equal(reconstructionColumns.includes("snapshot_json"), false);
  assert.equal(reconstructionColumns.includes("event_json"), false);
}

function assertNoObsoleteDbCreated() {
  assert.equal(existsSync(obsoleteHeadlessDbPath), false, "obsolete sine-headless.sqlite should not be recreated");
}

function smokeCandles(count: number) {
  const start = Date.UTC(2021, 0, 1) / 1000;
  return Array.from({ length: count }, (_, index) => {
    const close = 30_000 + index * 10 + Math.sin(index / 4) * 40;
    const timestamp = start + index * 300;
    return {
      timestamp,
      datetime: new Date(timestamp * 1000).toISOString(),
      open: close - 4,
      high: close + 8,
      low: close - 8,
      close,
      volume: 100 + index,
      roc: index === 0 ? 0 : Math.sin(index / 8),
      isStart: index === 0,
    };
  });
}
