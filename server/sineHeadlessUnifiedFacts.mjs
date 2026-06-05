import { parseJson } from "./sineRepositoryUtils.mjs";
import { datetimeFromUnixSeconds } from "../src/sine/sourceTime.ts";

export function createSineHeadlessRunFacts(db, runId) {
  const births = birthRows(db, runId);
  const deaths = deathRows(db, runId);
  const lifecycleEvents = lifecycleEventRows(db, runId, births, deaths);
  const trades = latestTradeRows(db, runId);
  const checkpoints = checkpointRows(db, runId);
  const snapshotCounts = reconstructionSnapshotCounts(db, runId);
  return {
    db,
    runId,
    births,
    deaths,
    deathBySpawnerId: new Map(deaths.map((death) => [death.spawner_id, death])),
    childrenByParentSpawnerId: childrenByParentSpawnerId(births),
    lifecycleEvents,
    trades,
    resolvedTrades: trades.filter((trade) => trade.payoff !== null),
    checkpoints,
    snapshotCounts,
  };
}

export function getHeadlessRunRow(db, runId) {
  const row = db.prepare(`
    SELECT *
    FROM sine_sessions
    WHERE id = ? AND run_mode = 'headless'
  `).get(runId);
  if (!row) return null;
  const settings = parseJson(row.settings_json, {});
  return {
    id: row.id,
    created_at: row.created_at,
    completed_at: row.completed_at,
    status: row.status,
    seed: row.seed,
    tick: latestHeadlessTick(db, row.id),
    target_ticks: row.target_ticks,
    checkpoint_interval_ticks: row.checkpoint_interval_ticks,
    market_source: settings.source ?? "unknown",
    minimum_resolved_trades: row.minimum_resolved_trades ?? 0,
    termination_reason: row.termination_reason,
    error: row.error,
  };
}

export function getLatestHeadlessRunId(db) {
  return db.prepare(`
    SELECT id
    FROM sine_sessions
    WHERE run_mode = 'headless'
    ORDER BY COALESCE(completed_at, updated_at, created_at) DESC, created_at DESC
    LIMIT 1
  `).get()?.id ?? null;
}

export function countSessionRows(db, tableName, runId) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE session_id = ?`).get(runId)?.count ?? 0;
}

export function reconstructionSnapshots(db, runId, spawnerId) {
  return db.prepare(`
    SELECT *
    FROM sine_headless_reconstruction_snapshots
    WHERE session_id = ? AND spawner_id = ?
    ORDER BY tick, reason
  `).all(runId, spawnerId).map((row) => ({
    runId: row.session_id,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    generation: row.generation,
    tick: row.tick,
    sourceTimestamp: row.source_timestamp,
    sourceDatetime: row.source_datetime,
    reason: row.reason,
    schemaVersion: row.schema_version,
    snapshot: {
      id: row.spawner_id,
      lineageId: row.lineage_id,
      generation: row.generation,
      parentSpawnerId: row.parent_spawner_id,
      birthTick: row.tick,
      genome: parseJson(row.genome_json, null),
      hiddenState: parseJson(row.hidden_state_json, {}),
      learnedState: parseJson(row.learned_state_json, {}),
    },
  }));
}

export function parseAgentEventRow(row) {
  return {
    id: row.id,
    runId: row.run_id,
    eventId: row.event_id,
    kind: row.event_kind,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    tick: row.tick,
    sourceTimestamp: row.source_timestamp,
    sourceDatetime: row.source_datetime,
    childSpawnerId: row.child_spawner_id,
    parentSpawnerId: row.parent_spawner_id,
    event: parseJson(row.event_json, null),
  };
}

function latestHeadlessTick(db, runId) {
  const row = db.prepare(`
    SELECT
      MAX(
        COALESCE((SELECT MAX(tick) FROM sine_spawner_state_snapshots WHERE session_id = ?), 0),
        COALESCE((SELECT MAX(birth_tick) FROM sine_spawner_births WHERE session_id = ?), 0),
        COALESCE((SELECT MAX(death_tick) FROM sine_spawner_deaths WHERE session_id = ?), 0),
        COALESCE((SELECT MAX(tick) FROM sine_food_events WHERE session_id = ?), 0),
        COALESCE((SELECT MAX(tick) FROM sine_events WHERE session_id = ?), 0),
        COALESCE((SELECT MAX(tick) FROM sine_headless_run_checkpoints WHERE session_id = ?), 0)
      ) AS tick
  `).get(runId, runId, runId, runId, runId, runId);
  return row?.tick ?? 0;
}

function birthRows(db, runId) {
  return db.prepare(`
    SELECT *
    FROM sine_spawner_births
    WHERE session_id = ?
    ORDER BY spawner_id
  `).all(runId);
}

function deathRows(db, runId) {
  return db.prepare(`
    SELECT *
    FROM sine_spawner_deaths
    WHERE session_id = ?
  `).all(runId);
}

function checkpointRows(db, runId) {
  return db.prepare(`
    SELECT *
    FROM sine_headless_run_checkpoints
    WHERE session_id = ?
    ORDER BY tick
  `).all(runId);
}

function reconstructionSnapshotCounts(db, runId) {
  return new Map(db.prepare(`
    SELECT spawner_id, COUNT(*) AS count
    FROM sine_headless_reconstruction_snapshots
    WHERE session_id = ?
    GROUP BY spawner_id
  `).all(runId).map((row) => [row.spawner_id, row.count]));
}

function childrenByParentSpawnerId(births) {
  const children = new Map();
  for (const birth of births) {
    if (birth.parent_spawner_id !== null && birth.parent_spawner_id !== undefined) {
      children.set(birth.parent_spawner_id, (children.get(birth.parent_spawner_id) ?? 0) + 1);
    }
  }
  return children;
}

function latestTradeRows(db, runId) {
  const rows = db.prepare(`
    SELECT *
    FROM sine_food_events
    WHERE session_id = ?
    ORDER BY food_id ASC, CASE event_kind WHEN 'resolve' THEN 1 ELSE 0 END ASC
  `).all(runId);
  const byFood = new Map();
  for (const row of rows) byFood.set(row.food_id, row);
  return [...byFood.values()].map(parseFoodEventRow).sort((left, right) => left.resolveTick - right.resolveTick || left.foodId - right.foodId);
}

function parseFoodEventRow(row) {
  const food = parseJson(row.food_json, null) ?? {};
  return {
    runId: row.session_id,
    spawnerId: row.spawner_id,
    lineageId: row.lineage_id,
    foodId: row.food_id,
    spawnTick: numberOr(food.spawnTick, row.tick),
    resolveTick: numberOr(food.resolveTick, row.tick),
    direction: food.direction ?? "long",
    strength: numberOr(food.strength, 0),
    horizonTicks: numberOr(food.horizonTicks, 0),
    entrySignal: numberOr(food.entrySignal, 0),
    exitSignal: nullableNumber(food.exitSignal),
    entryPayoffScale: nullableNumber(food.entryPayoffScale),
    entryPrice: nullableNumber(food.entryPrice),
    exitPrice: nullableNumber(food.exitPrice),
    sourceTimestamp: nullableNumber(food.sourceTimestamp),
    sourceDatetime: datetimeFromUnixSeconds(food.sourceTimestamp),
    exitSourceTimestamp: nullableNumber(food.exitSourceTimestamp),
    exitSourceDatetime: datetimeFromUnixSeconds(food.exitSourceTimestamp),
    status: food.status ?? (row.event_kind === "resolve" ? "loss" : "pending"),
    payoff: nullableNumber(food.payoff),
    food,
  };
}

function lifecycleEventRows(db, runId, births, deaths) {
  const birthEvents = births.map((birth) => ({
    id: birth.id,
    run_id: birth.session_id,
    event_id: null,
    event_kind: "birth",
    spawner_id: birth.spawner_id,
    lineage_id: birth.lineage_id,
    tick: birth.birth_tick,
    source_timestamp: nullableNumber(birth.source_timestamp),
    source_datetime: birth.source_datetime ?? datetimeFromUnixSeconds(birth.source_timestamp),
    child_spawner_id: null,
    parent_spawner_id: birth.parent_spawner_id,
    event_json: birth.spawner_json,
  }));
  const deathEvents = deaths.map((death) => ({
    id: death.id,
    run_id: death.session_id,
    event_id: null,
    event_kind: "death",
    spawner_id: death.spawner_id,
    lineage_id: death.lineage_id,
    tick: death.death_tick,
    source_timestamp: nullableNumber(death.source_timestamp),
    source_datetime: death.source_datetime ?? datetimeFromUnixSeconds(death.source_timestamp),
    child_spawner_id: null,
    parent_spawner_id: null,
    event_json: death.spawner_json,
  }));
  const reproductionEvents = db.prepare(`
    SELECT
      id,
      session_id AS run_id,
      event_id,
      event_kind,
      spawner_id,
      lineage_id,
      tick,
      event_json
    FROM sine_events
    WHERE session_id = ? AND event_kind = 'reproduction'
  `).all(runId).map((row) => {
    const event = parseJson(row.event_json, null) ?? {};
    return {
      ...row,
      source_timestamp: nullableNumber(event.sourceTimestamp),
      source_datetime: event.sourceDatetime ?? datetimeFromUnixSeconds(event.sourceTimestamp),
      child_spawner_id: event.childSpawnerId ?? null,
      parent_spawner_id: event.parentSpawnerId ?? null,
    };
  });
  return [...birthEvents, ...deathEvents, ...reproductionEvents].sort((left, right) => left.tick - right.tick || left.id - right.id);
}

function nullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
