import { activeSineDbPath, sineDb } from "./sineDb.mjs";
import { summarizeHeadlessCheckpoints } from "./sineHeadlessCheckpointSummaries.mjs";
import { deriveAgentStatsRows, deriveLineageStatsRows, toAgentStatsResponse } from "./sineHeadlessDerivedStats.mjs";
import {
  countSessionRows,
  createSineHeadlessRunFacts,
  getHeadlessRunRow,
  getLatestHeadlessRunId,
  parseAgentEventRow,
  reconstructionSnapshots,
} from "./sineHeadlessUnifiedFacts.mjs";
import { buildHeadlessTradeBreakdown } from "./sineHeadlessTradeBreakdown.mjs";
import { boundedInteger } from "./sineRepositoryUtils.mjs";

const AGENT_SORT_KEYS = new Set([
  "spawnerId",
  "lineageId",
  "generation",
  "birthTick",
  "deathTick",
  "lifespanTicks",
  "children",
  "resolvedTrades",
  "hitRate",
  "cumulativePayoff",
  "averagePayoff",
  "payoffStdDev",
  "averageHorizonTicks",
  "averageStrength",
]);

const LINEAGE_SORT_KEYS = new Set([
  "lineageId",
  "totalAgents",
  "eligibleAgents",
  "aliveAgents",
  "maxGeneration",
  "children",
  "resolvedTrades",
  "hitRate",
  "cumulativePayoff",
  "averagePayoff",
  "bestAveragePayoff",
]);

export const defaultSineHeadlessDbPath = activeSineDbPath;

export function createSineHeadlessUnifiedReadRepository(db = sineDb) {
  return {
    createRunAnalysisContext(runId) {
      return createSineHeadlessRunAnalysisContext(db, runId);
    },
    counts(runId) {
      return createSineHeadlessRunAnalysisContext(db, runId).counts();
    },
    listAgentLeaderboard(runId, options = {}) {
      return createSineHeadlessRunAnalysisContext(db, runId).listAgentLeaderboard(options);
    },
    getAgentDetail(runId, spawnerId, options = {}) {
      return createSineHeadlessRunAnalysisContext(db, runId).getAgentDetail(spawnerId, options);
    },
    listLineageLeaderboard(runId, options = {}) {
      return createSineHeadlessRunAnalysisContext(db, runId).listLineageLeaderboard(options);
    },
    listEventTimeline(runId, options = {}) {
      return createSineHeadlessRunAnalysisContext(db, runId).listEventTimeline(options);
    },
    getTradeBreakdown(runId) {
      return createSineHeadlessRunAnalysisContext(db, runId).getTradeBreakdown();
    },
    listRunCheckpoints(runId) {
      return createSineHeadlessRunAnalysisContext(db, runId).listRunCheckpoints();
    },
    listAgentTrades(runId, spawnerId) {
      return createSineHeadlessRunAnalysisContext(db, runId).listAgentTrades(spawnerId);
    },
    listAgentEvents(runId, spawnerId) {
      return createSineHeadlessRunAnalysisContext(db, runId).listAgentEvents(spawnerId);
    },
    listAgentSnapshots(runId, spawnerId) {
      return reconstructionSnapshots(db, runId, spawnerId).map((snapshot) => ({
        run_id: snapshot.runId,
        spawner_id: snapshot.spawnerId,
        lineage_id: snapshot.lineageId,
        generation: snapshot.generation,
        tick: snapshot.tick,
        source_timestamp: snapshot.sourceTimestamp,
        source_datetime: snapshot.sourceDatetime,
        reason: snapshot.reason,
        schema_version: snapshot.schemaVersion,
        snapshot: snapshot.snapshot,
      }));
    },
    getAgentMetrics(runId, spawnerId) {
      // Public compatibility method. The returned row is derived from core rows, not materialized metrics storage.
      return createSineHeadlessRunAnalysisContext(db, runId).getAgentMetrics(spawnerId);
    },
    getRun(runId) {
      return getHeadlessRunRow(db, runId);
    },
    getLatestRun() {
      const runId = getLatestHeadlessRunId(db);
      return runId ? getHeadlessRunRow(db, runId) : null;
    },
    deleteRun(runId) {
      return db.prepare("DELETE FROM sine_sessions WHERE id = ? AND run_mode = 'headless'").run(runId).changes;
    },
  };
}

export function createSineHeadlessRunAnalysisContext(db, runId) {
  const facts = createSineHeadlessRunFacts(db, runId);
  return {
    facts,
    counts() {
      return {
        runs: getHeadlessRunRow(db, runId) ? 1 : 0,
        agents: facts.births.length,
        events: facts.lifecycleEvents.length,
        trades: facts.trades.length,
        snapshots: countSessionRows(db, "sine_headless_reconstruction_snapshots", runId),
        // Public compatibility field. It now counts eligibility rows, not stored derived metrics.
        metrics: countSessionRows(db, "sine_headless_agent_eligibility", runId),
        checkpoints: facts.checkpoints.length,
      };
    },
    listAgentLeaderboard(options = {}) {
      return listAgentLeaderboard(facts, options);
    },
    getAgentDetail(spawnerId, options = {}) {
      return getAgentDetail(facts, spawnerId, options);
    },
    listLineageLeaderboard(options = {}) {
      return listLineageLeaderboard(facts, options);
    },
    listEventTimeline(options = {}) {
      return listEventTimeline(facts, options);
    },
    getTradeBreakdown() {
      return buildHeadlessTradeBreakdown(facts);
    },
    listRunCheckpoints() {
      return summarizeHeadlessCheckpoints(facts);
    },
    listAgentTrades(spawnerId) {
      return facts.trades.filter((trade) => trade.spawnerId === spawnerId);
    },
    listAgentEvents(spawnerId) {
      return facts.lifecycleEvents
        .filter((event) => event.spawner_id === spawnerId)
        .map((event) => ({ ...event, event: parseAgentEventRow(event).event }));
    },
    getAgentMetrics(spawnerId) {
      return deriveAgentStatsRows(facts).find((row) => row.spawner_id === spawnerId) ?? null;
    },
  };
}

export function markInterruptedUnifiedHeadlessRunsFailed(db = sineDb) {
  return db.prepare(`
    UPDATE sine_sessions
    SET
      completed_at = ?,
      updated_at = ?,
      status = 'failed',
      termination_reason = 'interrupted',
      error = 'Interrupted by server restart'
    WHERE run_mode = 'headless'
      AND status = 'running'
  `).run(new Date().toISOString(), new Date().toISOString()).changes;
}

function listAgentLeaderboard(facts, options) {
  const sortKey = AGENT_SORT_KEYS.has(options.sortKey) ? options.sortKey : "averagePayoff";
  const sortDirection = options.sortDirection === "asc" ? "asc" : "desc";
  const limit = boundedInteger(options.limit, 50, 1, 250);
  const offset = boundedInteger(options.offset, 0, 0, 1000000);
  const minResolvedTrades = boundedInteger(options.minResolvedTrades, 0, 0, 1000000000);
  const lineageId = Number(options.lineageId);
  let rows = deriveAgentStatsRows(facts).map(toAgentStatsResponse);
  if (minResolvedTrades > 0) rows = rows.filter((row) => row.resolvedTrades >= minResolvedTrades);
  if (options.alive === "alive") rows = rows.filter((row) => row.deathTick === null);
  if (options.alive === "dead") rows = rows.filter((row) => row.deathTick !== null);
  if (Number.isFinite(lineageId) && lineageId > 0) rows = rows.filter((row) => row.lineageId === Math.floor(lineageId));
  rows.sort((left, right) => compareValues(left[sortKey], right[sortKey], sortDirection) || compareValues(left.spawnerId, right.spawnerId, "asc"));
  return { rows: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
}

function getAgentDetail(facts, spawnerId, options) {
  const derivedStats = deriveAgentStatsRows(facts).find((row) => row.spawner_id === spawnerId);
  if (!derivedStats) return null;
  const tradeLimit = boundedInteger(options.tradeLimit, 100, 1, 500);
  const tradeOffset = boundedInteger(options.tradeOffset, 0, 0, 1000000);
  const allTrades = facts.trades.filter((trade) => trade.spawnerId === spawnerId);
  return {
    metrics: toAgentStatsResponse(derivedStats),
    events: facts.lifecycleEvents
      .filter((event) => event.spawner_id === spawnerId)
      .map(parseAgentEventRow),
    snapshots: reconstructionSnapshots(facts.db, facts.runId, spawnerId),
    trades: {
      rows: allTrades.slice(tradeOffset, tradeOffset + tradeLimit),
      total: allTrades.length,
      limit: tradeLimit,
      offset: tradeOffset,
    },
  };
}

function listLineageLeaderboard(facts, options) {
  const sortKey = LINEAGE_SORT_KEYS.has(options.sortKey) ? options.sortKey : "cumulativePayoff";
  const sortDirection = options.sortDirection === "asc" ? "asc" : "desc";
  const limit = boundedInteger(options.limit, 50, 1, 250);
  const offset = boundedInteger(options.offset, 0, 0, 1000000);
  const rows = deriveLineageStatsRows(deriveAgentStatsRows(facts));
  rows.sort((left, right) => compareValues(left[sortKey], right[sortKey], sortDirection) || compareValues(left.lineageId, right.lineageId, "asc"));
  return { rows: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
}

function listEventTimeline(facts, options) {
  const interval = boundedInteger(options.interval, 10000, 1, 10000000);
  const buckets = new Map();
  for (const event of facts.lifecycleEvents) {
    const bucketStartTick = Math.floor(event.tick / interval) * interval;
    const bucket = buckets.get(bucketStartTick) ?? {
      bucketStartTick,
      bucketEndTick: bucketStartTick + interval,
      events: 0,
      births: 0,
      deaths: 0,
      reproductions: 0,
      netPopulationChange: 0,
      includesFounderBirths: bucketStartTick === 0,
    };
    bucket.events += 1;
    if (event.event_kind === "birth") bucket.births += 1;
    if (event.event_kind === "death") bucket.deaths += 1;
    if (event.event_kind === "reproduction") bucket.reproductions += 1;
    bucket.netPopulationChange = bucket.births - bucket.deaths;
    buckets.set(bucketStartTick, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.bucketStartTick - right.bucketStartTick);
}

function compareValues(left, right, direction) {
  const leftValue = left === null || left === undefined ? Number.NEGATIVE_INFINITY : left;
  const rightValue = right === null || right === undefined ? Number.NEGATIVE_INFINITY : right;
  const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  return direction === "asc" ? result : -result;
}
