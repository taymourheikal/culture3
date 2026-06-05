import { sanitizeMarketRuntimeConfig } from "../src/sine/marketRuntimeConfig.ts";
import { sineStatements } from "./sineDb.mjs";
import { buildCohortAnalysis, cohortBucketCount } from "./sineCohortDiagnostics.mjs";
import { buildCohortRegimeContext } from "./sineCohortRegimeContext.mjs";
import { createHistoricalAnalysisContext } from "./sineHistoricalContext.mjs";
import { saveSinePersistenceBatch } from "./sinePersistenceWriter.mjs";
import { parseJson } from "./sineRepositoryUtils.mjs";
import { buildSineSessionDiagnostics } from "./sineRunDiagnostics.mjs";
import { getSineSpawnerInspection } from "./sineSpawnerInspectionRepository.mjs";
import { createTradeQualityModel, selectTradeQualityAgents } from "./sineTradeQuality.mjs";

export { getSineSpawnerInspection, saveSinePersistenceBatch };

export function upsertSineSession({ id, settings, spawnerConfig, status = "running" }) {
  const now = new Date().toISOString();
  sineStatements.upsertSineSession.run(id, now, now, status, JSON.stringify(settings ?? {}), JSON.stringify(spawnerConfig ?? {}));
  return { id, updatedAt: now };
}

export function updateSineSessionStatus(id, status) {
  if (!["running", "paused", "stopped"].includes(status)) return { ok: false, error: "Invalid status" };
  const existing = sineStatements.getSineSession.get(id);
  if (!existing) return { ok: false, error: "Not found" };
  const now = new Date().toISOString();
  const result = sineStatements.updateSineSessionStatus.run(status, now, id);
  return { ok: result.changes > 0, id, status, updatedAt: now };
}

export function deleteSineSession(id) {
  const result = sineStatements.deleteSineSession.run(id);
  return { ok: result.changes > 0, changes: result.changes };
}

export function listSineSessions(limit = 30) {
  return sineStatements.listSineSessions.all(limit).map((row) => {
    const settings = parseJson(row.settings_json, {});
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at ?? null,
      status: row.status,
      runMode: row.run_mode ?? "lab",
      marketSource: settings.source ?? null,
      seed: row.seed ?? null,
      targetTicks: row.target_ticks ?? null,
      checkpointIntervalTicks: row.checkpoint_interval_ticks ?? null,
      minimumResolvedTrades: row.minimum_resolved_trades ?? null,
      terminationReason: row.termination_reason ?? null,
      error: row.error ?? null,
      settings,
      spawnerConfig: parseJson(row.spawner_config_json, {}),
      births: row.births,
      deaths: row.deaths,
      stateSnapshots: row.state_snapshots,
      headlessCheckpoints: row.headless_checkpoints ?? 0,
      eligibleAgents: row.eligible_agents ?? 0,
      reconstructionSnapshots: row.reconstruction_snapshots ?? 0,
      reconstructableAgents: row.reconstructable_agents ?? 0,
      latestTick: row.latest_tick ?? 0,
    };
  });
}

export function getSineSessionAnalysis(sessionId, rangeInput = {}) {
  const session = sineStatements.getSineSession.get(sessionId);
  if (!session) return null;

  const context = createHistoricalAnalysisContext(sessionId, rangeInput);
  const diagnostics = buildSineSessionDiagnostics(context);

  return {
    session: {
      id: session.id,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      completedAt: session.completed_at ?? null,
      status: session.status,
      runMode: session.run_mode ?? "lab",
      seed: session.seed ?? null,
      targetTicks: session.target_ticks ?? null,
      checkpointIntervalTicks: session.checkpoint_interval_ticks ?? null,
      minimumResolvedTrades: session.minimum_resolved_trades ?? null,
      terminationReason: session.termination_reason ?? null,
      error: session.error ?? null,
      settings: parseJson(session.settings_json, {}),
      spawnerConfig: parseJson(session.spawner_config_json, {}),
    },
    diagnostics,
  };
}

export function getSineSessionCohortAnalysis(sessionId, input = {}) {
  const session = sineStatements.getSineSession.get(sessionId);
  if (!session) return null;

  const context = createHistoricalAnalysisContext(sessionId, input);
  const model = createTradeQualityModel(context.resolvedTrades, context.agentAgeBySpawnerId, context.agentAges);
  const selection = selectTradeQualityAgents(model, {
    minTrades: input.minTrades,
    minAgePercentile: input.minAgePercentile,
  });
  const bucketCount = cohortBucketCount(input.bucketCount, context.range);
  const settings = parseJson(session.settings_json, {});
  const marketConfig = sanitizeMarketRuntimeConfig(settings);
  const regimeContext = buildCohortRegimeContext(marketConfig, context.range, bucketCount);
  const cohort = buildCohortAnalysis({ context, selection, bucketCount, regimeContext });

  return {
    sessionId,
    range: context.range,
    filter: {
      minTrades: selection.tradeFilter.minTrades,
      minAgePercentile: selection.ageFilter.minAgePercentile,
      minAgeTicks: selection.minAgeTicks,
      eligibleAgents: selection.eligible.length,
      activeAgents: cohort.concentration.activeAgents,
    },
    bucketCount,
    market: {
      source: marketConfig.source,
      regimeStatus: regimeContext.status,
      snappedStartTimestamp: regimeContext.snappedStartTimestamp,
    },
    timeline: cohort.timeline,
    regimeGrid: cohort.regimeGrid,
    concentration: cohort.concentration,
  };
}
