import {
  parseAgentEventRow,
  parseAgentMetricsRow,
  parseCheckpointRow,
  parseLineageRow,
  parseSnapshotRow,
  parseTradeAggregateRow,
  parseTradeRow,
} from "./sineHeadlessRowParsers.mjs";
import { boundedInteger, count, parseJson } from "./sineHeadlessRepositoryUtils.mjs";

const AGENT_SORT_COLUMNS = {
  spawnerId: "spawner_id",
  lineageId: "lineage_id",
  generation: "generation",
  birthTick: "birth_tick",
  deathTick: "death_tick",
  lifespanTicks: "lifespan_ticks",
  children: "children",
  resolvedTrades: "resolved_trades",
  hitRate: "hit_rate",
  cumulativePayoff: "cumulative_payoff",
  averagePayoff: "average_payoff",
  payoffStdDev: "payoff_std_dev",
  averageHorizonTicks: "average_horizon_ticks",
  averageStrength: "average_strength",
};

const LINEAGE_SORT_COLUMNS = {
  lineageId: "lineage_id",
  totalAgents: "total_agents",
  eligibleAgents: "eligible_agents",
  aliveAgents: "alive_agents",
  maxGeneration: "max_generation",
  children: "children",
  resolvedTrades: "resolved_trades",
  hitRate: "hit_rate",
  cumulativePayoff: "cumulative_payoff",
  averagePayoff: "average_payoff",
  bestAveragePayoff: "best_average_payoff",
};

const TRADE_BIN_CTE = `
  WITH resolved AS (
    SELECT *
    FROM sine_headless_agent_trades
    WHERE run_id = ? AND payoff IS NOT NULL
  )
`;

export function createSineHeadlessReadRepository(db, statements) {
  return {
    counts(runId) {
      return {
        runs: count(statements.countRuns, runId),
        agents: count(statements.countAgents, runId),
        events: count(statements.countEvents, runId),
        trades: count(statements.countTrades, runId),
        snapshots: count(statements.countSnapshots, runId),
        metrics: count(statements.countMetrics, runId),
        checkpoints: count(statements.countCheckpoints, runId),
      };
    },
    listAgentLeaderboard(runId, options = {}) {
      return listAgentLeaderboard(db, runId, options);
    },
    getAgentDetail(runId, spawnerId, options = {}) {
      return getAgentDetail(db, statements, runId, spawnerId, options);
    },
    listLineageLeaderboard(runId, options = {}) {
      return listLineageLeaderboard(db, runId, options);
    },
    listEventTimeline(runId, options = {}) {
      return listEventTimeline(db, runId, options);
    },
    getTradeBreakdown(runId) {
      return getTradeBreakdown(db, runId);
    },
    listRunCheckpoints(runId) {
      return statements.listRunCheckpoints.all(runId).map(parseCheckpointRow);
    },
    listAgentTrades(runId, spawnerId) {
      return statements.listAgentTrades.all(runId, spawnerId).map(parseTradeRow);
    },
    listAgentEvents(runId, spawnerId) {
      return statements.listAgentEvents.all(runId, spawnerId);
    },
    listAgentSnapshots(runId, spawnerId) {
      return statements.listAgentSnapshots.all(runId, spawnerId).map((row) => ({
        ...row,
        snapshot: parseJson(row.snapshot_json, null),
      }));
    },
    getAgentMetrics(runId, spawnerId) {
      return statements.getAgentMetrics.get(runId, spawnerId) ?? null;
    },
    getRun(runId) {
      return statements.getRun.get(runId) ?? null;
    },
    getLatestRun() {
      return statements.getLatestRun.get() ?? null;
    },
    deleteRun(runId) {
      return statements.deleteRun.run(runId).changes;
    },
  };
}

function listAgentLeaderboard(db, runId, options) {
  const filters = agentMetricFilters(options);
  const sortColumn = AGENT_SORT_COLUMNS[options.sortKey] ?? AGENT_SORT_COLUMNS.averagePayoff;
  const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
  const limit = boundedInteger(options.limit, 50, 1, 250);
  const offset = boundedInteger(options.offset, 0, 0, 1000000);
  const where = filters.where.length ? `AND ${filters.where.join(" AND ")}` : "";
  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sine_headless_agent_metrics m
    WHERE m.run_id = ? ${where}
  `).get(runId, ...filters.params)?.count ?? 0;
  const rows = db.prepare(`
    SELECT
      m.*,
      (SELECT COUNT(*) FROM sine_headless_agent_snapshots s WHERE s.run_id = m.run_id AND s.spawner_id = m.spawner_id) AS snapshot_count
    FROM sine_headless_agent_metrics m
    WHERE m.run_id = ? ${where}
    ORDER BY ${sortColumn} ${sortDirection}, spawner_id ASC
    LIMIT ? OFFSET ?
  `).all(runId, ...filters.params, limit, offset).map(parseAgentMetricsRow);
  return { rows, total, limit, offset };
}

function getAgentDetail(db, statements, runId, spawnerId, options) {
  const metrics = statements.getAgentMetrics.get(runId, spawnerId);
  if (!metrics) return null;
  const tradeLimit = boundedInteger(options.tradeLimit, 100, 1, 500);
  const tradeOffset = boundedInteger(options.tradeOffset, 0, 0, 1000000);
  const tradeCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM sine_headless_agent_trades
    WHERE run_id = ? AND spawner_id = ?
  `).get(runId, spawnerId)?.count ?? 0;
  const trades = db.prepare(`
    SELECT *
    FROM sine_headless_agent_trades
    WHERE run_id = ? AND spawner_id = ?
    ORDER BY resolve_tick, food_id
    LIMIT ? OFFSET ?
  `).all(runId, spawnerId, tradeLimit, tradeOffset).map(parseTradeRow);
  const events = statements.listAgentEvents.all(runId, spawnerId).map(parseAgentEventRow);
  const snapshots = statements.listAgentSnapshots.all(runId, spawnerId).map(parseSnapshotRow);
  return {
    metrics: parseAgentMetricsRow(metrics),
    events,
    snapshots,
    trades: {
      rows: trades,
      total: tradeCount,
      limit: tradeLimit,
      offset: tradeOffset,
    },
  };
}

function listLineageLeaderboard(db, runId, options) {
  const sortColumn = LINEAGE_SORT_COLUMNS[options.sortKey] ?? LINEAGE_SORT_COLUMNS.cumulativePayoff;
  const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
  const limit = boundedInteger(options.limit, 50, 1, 250);
  const offset = boundedInteger(options.offset, 0, 0, 1000000);
  const rows = db.prepare(`
    WITH metric_summary AS (
      SELECT
        lineage_id,
        COUNT(*) AS eligible_agents,
        SUM(CASE WHEN death_tick IS NULL THEN 1 ELSE 0 END) AS alive_eligible_agents,
        MAX(generation) AS max_generation,
        SUM(children) AS children,
        SUM(resolved_trades) AS resolved_trades,
        SUM(wins) AS wins,
        SUM(losses) AS losses,
        SUM(cumulative_payoff) AS cumulative_payoff,
        CASE WHEN SUM(resolved_trades) > 0 THEN SUM(cumulative_payoff) / SUM(resolved_trades) ELSE 0 END AS average_payoff
      FROM sine_headless_agent_metrics
      WHERE run_id = ?
      GROUP BY lineage_id
    ),
    best_agents AS (
      SELECT *
      FROM (
        SELECT
          lineage_id,
          spawner_id AS best_spawner_id,
          average_payoff AS best_average_payoff,
          cumulative_payoff AS best_cumulative_payoff,
          hit_rate AS best_hit_rate,
          resolved_trades AS best_resolved_trades,
          ROW_NUMBER() OVER (
            PARTITION BY lineage_id
            ORDER BY average_payoff DESC, resolved_trades DESC, spawner_id ASC
          ) AS rank
        FROM sine_headless_agent_metrics
        WHERE run_id = ?
      )
      WHERE rank = 1
    ),
    lineage_rows AS (
      SELECT
        a.lineage_id,
        COUNT(*) AS total_agents,
        SUM(CASE WHEN a.death_tick IS NULL THEN 1 ELSE 0 END) AS alive_agents,
        COALESCE(m.eligible_agents, 0) AS eligible_agents,
        COALESCE(m.alive_eligible_agents, 0) AS alive_eligible_agents,
        COALESCE(m.max_generation, MAX(a.generation), 0) AS max_generation,
        COALESCE(m.children, 0) AS children,
        COALESCE(m.resolved_trades, 0) AS resolved_trades,
        COALESCE(m.wins, 0) AS wins,
        COALESCE(m.losses, 0) AS losses,
        CASE WHEN COALESCE(m.resolved_trades, 0) > 0 THEN CAST(m.wins AS REAL) / m.resolved_trades ELSE 0 END AS hit_rate,
        COALESCE(m.cumulative_payoff, 0) AS cumulative_payoff,
        COALESCE(m.average_payoff, 0) AS average_payoff,
        b.best_spawner_id,
        COALESCE(b.best_average_payoff, 0) AS best_average_payoff,
        COALESCE(b.best_cumulative_payoff, 0) AS best_cumulative_payoff,
        COALESCE(b.best_hit_rate, 0) AS best_hit_rate,
        COALESCE(b.best_resolved_trades, 0) AS best_resolved_trades
      FROM sine_headless_agents a
      LEFT JOIN metric_summary m ON m.lineage_id = a.lineage_id
      LEFT JOIN best_agents b ON b.lineage_id = a.lineage_id
      WHERE a.run_id = ?
      GROUP BY a.lineage_id
    )
    SELECT *
    FROM lineage_rows
    ORDER BY ${sortColumn} ${sortDirection}, lineage_id ASC
    LIMIT ? OFFSET ?
  `).all(runId, runId, runId, limit, offset).map(parseLineageRow);
  const total = db.prepare(`
    SELECT COUNT(DISTINCT lineage_id) AS count
    FROM sine_headless_agents
    WHERE run_id = ?
  `).get(runId)?.count ?? 0;
  return { rows, total, limit, offset };
}

function listEventTimeline(db, runId, options) {
  const interval = boundedInteger(options.interval, 10000, 1, 10000000);
  return db.prepare(`
    SELECT
      CAST(tick / ? AS INTEGER) * ? AS bucket_start_tick,
      COUNT(*) AS events,
      SUM(CASE WHEN event_kind = 'birth' THEN 1 ELSE 0 END) AS births,
      SUM(CASE WHEN event_kind = 'death' THEN 1 ELSE 0 END) AS deaths,
      SUM(CASE WHEN event_kind = 'reproduction' THEN 1 ELSE 0 END) AS reproductions
    FROM sine_headless_agent_events
    WHERE run_id = ?
    GROUP BY bucket_start_tick
    ORDER BY bucket_start_tick
  `).all(interval, interval, runId).map((row) => ({
    bucketStartTick: row.bucket_start_tick,
    bucketEndTick: row.bucket_start_tick + interval,
    events: row.events,
    births: row.births,
    deaths: row.deaths,
    reproductions: row.reproductions,
    netPopulationChange: row.births - row.deaths,
    includesFounderBirths: row.bucket_start_tick === 0,
  }));
}

function getTradeBreakdown(db, runId) {
  return {
    byDirection: db.prepare(`
      ${TRADE_BIN_CTE}
      SELECT
        direction,
        COUNT(*) AS trades,
        SUM(CASE WHEN payoff > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN payoff <= 0 THEN 1 ELSE 0 END) AS losses,
        AVG(payoff) AS average_payoff,
        SUM(payoff) AS cumulative_payoff
      FROM resolved
      GROUP BY direction
      ORDER BY direction
    `).all(runId).map(parseTradeAggregateRow),
    byHorizon: db.prepare(`
      ${TRADE_BIN_CTE}
      SELECT
        CASE
          WHEN horizon_ticks <= 5 THEN '0-5'
          WHEN horizon_ticks <= 10 THEN '6-10'
          WHEN horizon_ticks <= 20 THEN '11-20'
          WHEN horizon_ticks <= 35 THEN '21-35'
          ELSE '36+'
        END AS bucket,
        COUNT(*) AS trades,
        SUM(CASE WHEN payoff > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN payoff <= 0 THEN 1 ELSE 0 END) AS losses,
        AVG(payoff) AS average_payoff,
        SUM(payoff) AS cumulative_payoff
      FROM resolved
      GROUP BY bucket
      ORDER BY MIN(horizon_ticks)
    `).all(runId).map(parseTradeAggregateRow),
    byStrength: db.prepare(`
      ${TRADE_BIN_CTE}
      SELECT
        CASE
          WHEN strength < 0.25 THEN '0.00-0.24'
          WHEN strength < 0.50 THEN '0.25-0.49'
          WHEN strength < 0.75 THEN '0.50-0.74'
          WHEN strength < 1.00 THEN '0.75-0.99'
          ELSE '1.00+'
        END AS bucket,
        COUNT(*) AS trades,
        SUM(CASE WHEN payoff > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN payoff <= 0 THEN 1 ELSE 0 END) AS losses,
        AVG(payoff) AS average_payoff,
        SUM(payoff) AS cumulative_payoff
      FROM resolved
      GROUP BY bucket
      ORDER BY MIN(strength)
    `).all(runId).map(parseTradeAggregateRow),
    payoffBins: db.prepare(`
      ${TRADE_BIN_CTE}
      SELECT
        CASE
          WHEN payoff < -2 THEN '< -2'
          WHEN payoff < -1 THEN '-2 to -1'
          WHEN payoff < -0.5 THEN '-1 to -0.5'
          WHEN payoff < 0 THEN '-0.5 to 0'
          WHEN payoff = 0 THEN '0'
          WHEN payoff <= 0.5 THEN '0 to 0.5'
          WHEN payoff <= 1 THEN '0.5 to 1'
          WHEN payoff <= 2 THEN '1 to 2'
          ELSE '> 2'
        END AS bucket,
        COUNT(*) AS trades,
        AVG(payoff) AS average_payoff,
        SUM(payoff) AS cumulative_payoff
      FROM resolved
      GROUP BY bucket
      ORDER BY MIN(payoff)
    `).all(runId).map((row) => ({
      bucket: row.bucket,
      trades: row.trades,
      averagePayoff: row.average_payoff ?? 0,
      cumulativePayoff: row.cumulative_payoff ?? 0,
    })),
  };
}

function agentMetricFilters(options) {
  const where = [];
  const params = [];
  const minResolvedTrades = boundedInteger(options.minResolvedTrades, 0, 0, 1000000000);
  if (minResolvedTrades > 0) {
    where.push("m.resolved_trades >= ?");
    params.push(minResolvedTrades);
  }
  if (options.alive === "alive") {
    where.push("m.death_tick IS NULL");
  } else if (options.alive === "dead") {
    where.push("m.death_tick IS NOT NULL");
  }
  const lineageId = Number(options.lineageId);
  if (Number.isFinite(lineageId) && lineageId > 0) {
    where.push("m.lineage_id = ?");
    params.push(Math.floor(lineageId));
  }
  return { where, params };
}
