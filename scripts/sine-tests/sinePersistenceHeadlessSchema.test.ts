import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { datetimeFromUnixSeconds } from "../../src/sine/sourceTime";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
// @ts-expect-error The server repository is runtime ESM loaded by tsx for integration coverage.
import { deleteSineSession, listSineSessions } from "../../server/sineRepository.mjs";
// @ts-expect-error The server DB is runtime ESM loaded by tsx for integration coverage.
import { sineDb } from "../../server/sineDb.mjs";
import { uniqueTestSessionId, type SineTest } from "./helpers";

function testSineRepositorySupportsUnifiedHeadlessSchema() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const sessionId = uniqueTestSessionId("test-sine-unified-headless");
  const now = new Date().toISOString();
  const sourceTimestamp = 1_700_000_000;
  const sourceDatetime = datetimeFromUnixSeconds(sourceTimestamp);

  const metricTable = sineDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sine_headless_agent_metrics'")
    .get() as any;
  assert.equal(metricTable, undefined);

  sineDb
    .prepare(`
      INSERT INTO sine_sessions (
        id,
        created_at,
        updated_at,
        status,
        settings_json,
        spawner_config_json,
        run_mode,
        seed,
        target_ticks,
        checkpoint_interval_ticks,
        minimum_resolved_trades,
        completed_at,
        termination_reason,
        error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      sessionId,
      now,
      now,
      "completed",
      JSON.stringify({ source: "btcusd_5m" }),
      JSON.stringify(DEFAULT_SPAWNER_CONFIG),
      "headless",
      12345,
      20000,
      10000,
      50,
      now,
      "target_ticks",
      null,
    );
  sineDb
    .prepare(`
      INSERT INTO sine_headless_run_checkpoints (
        session_id,
        tick,
        source_timestamp,
        source_datetime,
        population,
        eligible_agents,
        trades_written,
        reconstruction_snapshots_written,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(sessionId, 10000, sourceTimestamp, sourceDatetime, 42, 3, 12, 2, now);
  sineDb
    .prepare(`
      INSERT INTO sine_headless_agent_eligibility (
        session_id,
        spawner_id,
        eligible_tick,
        resolved_trades,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(sessionId, spawner.id, 10000, 50, now);
  sineDb
    .prepare(`
      INSERT INTO sine_headless_reconstruction_snapshots (
        session_id,
        spawner_id,
        lineage_id,
        generation,
        parent_spawner_id,
        tick,
        source_timestamp,
        source_datetime,
        reason,
        schema_version,
        genome_json,
        hidden_state_json,
        learned_state_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      sessionId,
      spawner.id,
      spawner.lineageId,
      spawner.generation,
      spawner.parentSpawnerId ?? null,
      10000,
      sourceTimestamp,
      sourceDatetime,
      "death",
      1,
      JSON.stringify(spawner.genome),
      JSON.stringify(spawner.hiddenState),
      JSON.stringify(spawner.learnedState),
      now,
    );

  const saved = listSineSessions(200).find((session: any) => session.id === sessionId);
  assert.equal(saved?.runMode, "headless");
  assert.equal(saved?.marketSource, "btcusd_5m");
  assert.equal(saved?.seed, 12345);
  assert.equal(saved?.targetTicks, 20000);
  assert.equal(saved?.checkpointIntervalTicks, 10000);
  assert.equal(saved?.minimumResolvedTrades, 50);
  assert.equal(saved?.completedAt, now);
  assert.equal(saved?.terminationReason, "target_ticks");
  assert.equal(saved?.error, null);
  assert.equal(saved?.latestTick, 10000);
  assert.equal(saved?.headlessCheckpoints, 1);
  assert.equal(saved?.eligibleAgents, 1);
  assert.equal(saved?.reconstructionSnapshots, 1);
  assert.equal(saved?.reconstructableAgents, 1);

  const reconstructionColumns = sineDb
    .prepare("PRAGMA table_info(sine_headless_reconstruction_snapshots)")
    .all()
    .map((row: any) => row.name);
  assert.equal(reconstructionColumns.includes("snapshot_json"), false);
  assert.equal(reconstructionColumns.includes("event_json"), false);
  assert.equal(reconstructionColumns.includes("genome_json"), true);
  assert.equal(reconstructionColumns.includes("hidden_state_json"), true);
  assert.equal(reconstructionColumns.includes("learned_state_json"), true);
  assert.deepEqual(sineDb.prepare("PRAGMA foreign_key_check").all(), []);

  const deleted = deleteSineSession(sessionId);
  assert.equal(deleted.ok, true);
  assert.equal((sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_run_checkpoints WHERE session_id = ?").get(sessionId) as any).count, 0);
  assert.equal((sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_agent_eligibility WHERE session_id = ?").get(sessionId) as any).count, 0);
  assert.equal((sineDb.prepare("SELECT COUNT(*) AS count FROM sine_headless_reconstruction_snapshots WHERE session_id = ?").get(sessionId) as any).count, 0);
}

export const tests: SineTest[] = [
  { name: "Sine Repository Supports Unified Headless Schema", run: testSineRepositorySupportsUnifiedHeadlessSchema },
];

