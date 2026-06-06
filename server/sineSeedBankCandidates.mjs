import { sineDb } from "./sineDb.mjs";
import { createSineHeadlessRunFacts, getHeadlessRunRow, reconstructionSnapshots, reconstructionSnapshotSummaries } from "./sineHeadlessUnifiedFacts.mjs";
import { deriveAgentStatsRows, toAgentStatsResponse } from "./sineHeadlessDerivedStats.mjs";
import { createAgentTradeSummaries } from "./sineTradeQuality.mjs";
import { finiteSortedValues } from "./sineDiagnosticsMath.mjs";
import { boundedInteger, finiteNumber } from "./sineRepositoryUtils.mjs";
import { createSineSeedBankRepository } from "./sineSeedBankRepository.mjs";

const DEFAULT_CANDIDATE_LIMIT = 100;
const MAX_CANDIDATE_LIMIT = 500;

export function createSineSeedBankCandidateService({ runDb = sineDb, seedBankRepository } = {}) {
  let cachedSeedBankRepository = seedBankRepository;
  const getSeedBankRepository = () => {
    cachedSeedBankRepository ??= createSineSeedBankRepository();
    return cachedSeedBankRepository;
  };
  return {
    listCandidateSourceRuns(options = {}) {
      return listCandidateSourceRuns(runDb, options);
    },
    listCandidates(input = {}) {
      return listCandidates(runDb, getSeedBankRepository(), input);
    },
    admitCandidate(input = {}) {
      return admitCandidate(runDb, getSeedBankRepository(), input);
    },
    admitCandidates(input = {}) {
      return admitCandidates(runDb, getSeedBankRepository(), input);
    },
  };
}

export function listCandidateSourceRuns(db = sineDb, options = {}) {
  const limit = boundedInteger(options.limit, 50, 1, 250);
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const search = typeof options.search === "string" && options.search.trim() ? options.search.trim() : "";
  const searchWhere = search
    ? `
      AND (
        sessions.id LIKE @searchLike
        OR sessions.status LIKE @searchLike
        OR CAST(sessions.seed AS TEXT) LIKE @searchLike
        OR CAST(sessions.target_ticks AS TEXT) LIKE @searchLike
        OR sessions.created_at LIKE @searchLike
        OR sessions.completed_at LIKE @searchLike
      )
    `
    : "";
  const rowParams = search ? { limit, offset, searchLike: `%${search}%` } : { limit, offset };
  const countParams = search ? { searchLike: `%${search}%` } : {};
  const rows = db.prepare(`
    SELECT
      sessions.id,
      sessions.created_at,
      sessions.completed_at,
      sessions.status,
      sessions.seed,
      sessions.target_ticks,
      sessions.minimum_resolved_trades,
      COUNT(DISTINCT snapshots.spawner_id) AS reconstructable_agents,
      COUNT(snapshots.spawner_id) AS reconstruction_snapshots
    FROM sine_sessions AS sessions
    INNER JOIN sine_headless_reconstruction_snapshots AS snapshots
      ON snapshots.session_id = sessions.id
    WHERE sessions.run_mode = 'headless'
    ${searchWhere}
    GROUP BY sessions.id
    HAVING COUNT(snapshots.spawner_id) > 0
    ORDER BY COALESCE(sessions.completed_at, sessions.updated_at, sessions.created_at) DESC, sessions.id ASC
    LIMIT @limit OFFSET @offset
  `).all(rowParams);
  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT sessions.id
      FROM sine_sessions AS sessions
      INNER JOIN sine_headless_reconstruction_snapshots AS snapshots
        ON snapshots.session_id = sessions.id
      WHERE sessions.run_mode = 'headless'
      ${searchWhere}
      GROUP BY sessions.id
      HAVING COUNT(snapshots.spawner_id) > 0
    )
  `).get(countParams)?.total ?? 0;
  return {
    runs: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? null,
      status: row.status,
      seed: row.seed ?? null,
      targetTicks: row.target_ticks ?? null,
      minimumResolvedTrades: row.minimum_resolved_trades ?? null,
      reconstructableAgents: row.reconstructable_agents ?? 0,
      reconstructionSnapshots: row.reconstruction_snapshots ?? 0,
    })),
    total,
    limit,
    offset,
    search,
  };
}

export function listCandidates(db = sineDb, seedBankRepository = createSineSeedBankRepository(), input = {}) {
  const { rows: allRows, filter } = candidateRowsForRuns(db, seedBankRepository, input);
  return {
    rows: allRows.slice(filter.offset, filter.offset + filter.limit),
    total: allRows.length,
    admittableTotal: allRows.filter((row) => !row.alreadyAdmitted).length,
    limit: filter.limit,
    offset: filter.offset,
    filter: publicFilter(filter),
  };
}

export function admitCandidate(db = sineDb, seedBankRepository = createSineSeedBankRepository(), input = {}) {
  const bankId = readRequiredText(input.bankId, "Missing seed bank id");
  const sourceRunId = readRequiredText(input.sourceRunId, "Missing source run id");
  const sourceSpawnerId = boundedInteger(input.sourceSpawnerId, Number.NaN, 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(sourceSpawnerId)) throw new Error("Missing source spawner id");

  const run = getHeadlessRunRow(db, sourceRunId);
  if (!run) throw new Error(`Headless source run not found: ${sourceRunId}`);
  const { rows, filter } = candidateRowsForRuns(db, seedBankRepository, { ...(input.filters ?? {}), runIds: [sourceRunId], bankId });
  const candidate = rows.find((row) => row.spawnerId === sourceSpawnerId);
  if (!candidate) throw new Error(`Reconstructable seed-bank candidate not found: ${sourceRunId}/${sourceSpawnerId}`);
  return freezeCandidateEntry(db, seedBankRepository, bankId, candidate, filter);
}

export function admitCandidates(db = sineDb, seedBankRepository = createSineSeedBankRepository(), input = {}) {
  const bankId = readRequiredText(input.bankId, "Missing seed bank id");
  const { rows, filter } = candidateRowsForRuns(db, seedBankRepository, { ...(input.filters ?? {}), runIds: input.runIds, bankId });
  const errors = [];
  let alreadyAdmitted = 0;
  let inserted = 0;
  let attempted = 0;
  let failed = 0;

  for (const candidate of rows) {
    if (candidate.alreadyAdmitted) {
      alreadyAdmitted += 1;
      continue;
    }
    attempted += 1;
    try {
      const result = freezeCandidateEntry(db, seedBankRepository, bankId, candidate, filter);
      if (result.inserted) inserted += 1;
      else alreadyAdmitted += 1;
    } catch (error) {
      failed += 1;
      if (errors.length < 10) {
        errors.push({
          runId: candidate.runId,
          spawnerId: candidate.spawnerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    matched: rows.length,
    alreadyAdmitted,
    attempted,
    inserted,
    failed,
    errors,
  };
}

function candidateRowsForRuns(db, seedBankRepository, input = {}) {
  const runIds = normalizeRunIds(input.runIds);
  const filter = normalizeCandidateFilter(input);
  const admittedSourceKeys = filter.bankId ? seedBankRepository.admittedSourceKeys(filter.bankId, runIds) : new Set();
  const rows = runIds.flatMap((runId) => candidateRowsForRun(db, runId, filter, admittedSourceKeys));
  rows.sort(compareCandidates);
  return { rows, filter, runIds };
}

function freezeCandidateEntry(db, seedBankRepository, bankId, candidate, filter) {
  const snapshots = reconstructionSnapshots(db, candidate.runId, candidate.spawnerId);
  if (snapshots.length === 0) throw new Error(`Source reconstruction snapshots not found: ${candidate.runId}/${candidate.spawnerId}`);

  return seedBankRepository.addFrozenEntry({
    bankId,
    source: {
      runId: candidate.runId,
      spawnerId: candidate.spawnerId,
      lineageId: candidate.lineageId,
      generation: candidate.generation,
      parentSpawnerId: candidate.parentSpawnerId,
      birthTick: candidate.birthTick,
      deathTick: candidate.deathTick,
      lifespanTicks: candidate.lifespanTicks,
    },
    admission: {
      metrics: admissionMetrics(candidate),
      filters: publicFilter(filter),
    },
    snapshots: snapshots.map(frozenSnapshotFromSource),
  });
}

function candidateRowsForRun(db, runId, filter, admittedSourceKeys = new Set()) {
  const run = getHeadlessRunRow(db, runId);
  if (!run) return [];
  const facts = createSineHeadlessRunFacts(db, runId);
  if (facts.snapshotCounts.size === 0) return [];
  const snapshotSummaries = reconstructionSnapshotSummaries(db, runId);
  const ageContext = wholeRunAgeContext(facts, candidateRunEndTick(db, runId, run.tick));
  const tradeSummariesBySpawnerId = new Map(createAgentTradeSummaries(facts.resolvedTrades, ageContext.ageBySpawnerId).map((row) => [row.spawnerId, row]));
  const rows = deriveAgentStatsRows(facts)
    .map(toAgentStatsResponse)
    .filter((row) => (facts.snapshotCounts.get(row.spawnerId) ?? 0) > 0)
    .map((stats) => {
      const tradeSummary = tradeSummariesBySpawnerId.get(stats.spawnerId);
      const ageTicks = ageContext.ageBySpawnerId.get(stats.spawnerId) ?? 0;
      const snapshotSummary = snapshotSummaries.get(stats.spawnerId) ?? { count: 0, latestTick: null, reasons: [] };
      return {
        runId,
        spawnerId: stats.spawnerId,
        lineageId: stats.lineageId,
        generation: stats.generation,
        parentSpawnerId: stats.parentSpawnerId,
        birthTick: stats.birthTick,
        deathTick: stats.deathTick,
        lifespanTicks: stats.lifespanTicks,
        children: stats.children,
        resolvedTrades: stats.resolvedTrades,
        hitRate: stats.hitRate,
        averagePayoff: stats.averagePayoff,
        cumulativePayoff: stats.cumulativePayoff,
        payoffStdDev: stats.payoffStdDev,
        sharpe: tradeSummary?.sharpe ?? null,
        sortino: tradeSummary?.sortino ?? null,
        downsideVolatility: tradeSummary?.downsideVolatility ?? 0,
        ageExposureTicks: ageTicks,
        ageExposurePercentile: ageContext.percentileBySpawnerId.get(stats.spawnerId) ?? 0,
        reconstructionSnapshotCount: snapshotSummary.count,
        latestReconstructionSnapshotTick: snapshotSummary.latestTick,
        reconstructionSnapshotReasons: snapshotSummary.reasons,
        alreadyAdmitted: filter.bankId ? admittedSourceKeys.has(sourceKey(runId, stats.spawnerId)) : false,
      };
    });
  return rows.filter((row) => candidatePassesFilter(row, filter));
}

function wholeRunAgeContext(facts, runTick) {
  const ageEntries = facts.births.map((birth) => {
    const death = facts.deathBySpawnerId.get(birth.spawner_id);
    const startTick = boundedInteger(birth.birth_tick, 0, 0, Number.MAX_SAFE_INTEGER);
    const endTick = death ? boundedInteger(death.death_tick, startTick, 0, Number.MAX_SAFE_INTEGER) : boundedInteger(runTick, startTick, 0, Number.MAX_SAFE_INTEGER);
    return {
      spawnerId: birth.spawner_id,
      ageTicks: Math.max(0, endTick - startTick),
    };
  });
  const sortedAges = finiteSortedValues(ageEntries.map((entry) => entry.ageTicks));
  const ageBySpawnerId = new Map(ageEntries.map((entry) => [entry.spawnerId, entry.ageTicks]));
  const percentileBySpawnerId = new Map(ageEntries.map((entry) => [entry.spawnerId, percentileRank(sortedAges, entry.ageTicks)]));
  return { ageBySpawnerId, percentileBySpawnerId, sortedAges };
}

function candidateRunEndTick(db, runId, fallbackTick) {
  const row = db.prepare(`
    SELECT MAX(tick) AS tick
    FROM sine_headless_reconstruction_snapshots
    WHERE session_id = ?
  `).get(runId);
  return Math.max(boundedInteger(fallbackTick, 0, 0, Number.MAX_SAFE_INTEGER), boundedInteger(row?.tick, 0, 0, Number.MAX_SAFE_INTEGER));
}

function frozenSnapshotFromSource(source) {
  return {
    sourceTick: source.tick,
    sourceReason: source.reason,
    schemaVersion: source.schemaVersion,
    genome: source.snapshot?.genome ?? {},
    hiddenState: source.snapshot?.hiddenState ?? {},
    learnedState: source.snapshot?.learnedState ?? {},
  };
}

function candidatePassesFilter(row, filter) {
  if (row.resolvedTrades < filter.minResolvedTrades) return false;
  if (row.children < filter.minChildren) return false;
  if (row.ageExposurePercentile < filter.minAgePercentile) return false;
  if (filter.minSharpe !== null && (row.sharpe === null || row.sharpe < filter.minSharpe)) return false;
  if (filter.minSortino !== null && (row.sortino === null || row.sortino < filter.minSortino)) return false;
  return true;
}

function normalizeCandidateFilter(input) {
  return {
    bankId: typeof input.bankId === "string" && input.bankId.trim() ? input.bankId.trim() : null,
    minResolvedTrades: boundedInteger(input.minResolvedTrades, 0, 0, Number.MAX_SAFE_INTEGER),
    minChildren: boundedInteger(input.minChildren, 0, 0, Number.MAX_SAFE_INTEGER),
    minAgePercentile: Math.max(0, Math.min(100, finiteNumber(input.minAgePercentile, 0))),
    minSharpe: optionalFiniteNumber(input.minSharpe),
    minSortino: optionalFiniteNumber(input.minSortino),
    limit: boundedInteger(input.limit, DEFAULT_CANDIDATE_LIMIT, 1, MAX_CANDIDATE_LIMIT),
    offset: boundedInteger(input.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function publicFilter(filter) {
  return {
    minResolvedTrades: filter.minResolvedTrades,
    minChildren: filter.minChildren,
    minAgePercentile: filter.minAgePercentile,
    minSharpe: filter.minSharpe,
    minSortino: filter.minSortino,
    limit: filter.limit,
    offset: filter.offset,
  };
}

function admissionMetrics(candidate) {
  return {
    resolvedTrades: candidate.resolvedTrades,
    children: candidate.children,
    ageExposureTicks: candidate.ageExposureTicks,
    ageExposurePercentile: candidate.ageExposurePercentile,
    sharpe: candidate.sharpe,
    sortino: candidate.sortino,
    downsideVolatility: candidate.downsideVolatility,
    hitRate: candidate.hitRate,
    averagePayoff: candidate.averagePayoff,
    cumulativePayoff: candidate.cumulativePayoff,
    reconstructionSnapshotCount: candidate.reconstructionSnapshotCount,
    latestReconstructionSnapshotTick: candidate.latestReconstructionSnapshotTick,
  };
}

function normalizeRunIds(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(raw.map((runId) => String(runId).trim()).filter(Boolean))];
}

function sourceKey(runId, spawnerId) {
  return `${runId}:${spawnerId}`;
}

function optionalFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function percentileRank(sortedValues, value) {
  if (sortedValues.length === 0) return 0;
  let count = 0;
  for (const candidate of sortedValues) {
    if (candidate <= value) count += 1;
    else break;
  }
  return (count / sortedValues.length) * 100;
}

function compareCandidates(left, right) {
  return (
    compareNullableNumber(right.sortino, left.sortino) ||
    compareNullableNumber(right.sharpe, left.sharpe) ||
    compareNullableNumber(right.resolvedTrades, left.resolvedTrades) ||
    compareNullableNumber(right.children, left.children) ||
    left.runId.localeCompare(right.runId) ||
    left.spawnerId - right.spawnerId
  );
}

function compareNullableNumber(left, right) {
  const leftValue = left === null || left === undefined ? Number.NEGATIVE_INFINITY : left;
  const rightValue = right === null || right === undefined ? Number.NEGATIVE_INFINITY : right;
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function readRequiredText(value, message) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(message);
}
