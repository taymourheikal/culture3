import { nonNegativeInteger } from "../src/sine/numeric.ts";
import { sineStatements } from "./sineDb.mjs";
import { parseHistoricalBirthRow, parseHistoricalDeathRow, parseHistoricalResolvedTradeRow } from "./sineHistoricalRows.mjs";

export function createHistoricalAnalysisContext(sessionId, rangeInput = {}) {
  const extents = sineStatements.getSineSessionTickExtents.get(sessionId, sessionId, sessionId, sessionId) ?? {};
  const births = sineStatements.listSineBirthsForSession.all(sessionId).map(parseHistoricalBirthRow);
  const deaths = sineStatements.listSineDeathsForSession.all(sessionId).map(parseHistoricalDeathRow);
  const resolvedTrades = sineStatements.listSineResolvedFoods.all(sessionId)
    .map(parseHistoricalResolvedTradeRow)
    .filter(Boolean);
  const spawnedFoods = sineStatements.listSineSpawnedFoods.all(sessionId).map((row) => ({
    tick: nonNegativeInteger(row.tick, 0),
  }));
  const latestTick = Math.max(
    nonNegativeInteger(extents.latest_state_tick, 0),
    nonNegativeInteger(extents.latest_birth_tick, 0),
    nonNegativeInteger(extents.latest_death_tick, 0),
    nonNegativeInteger(extents.latest_food_tick, 0),
  );
  return createRangedHistoricalAnalysisContext({
    sessionId,
    latestTick,
    births,
    deaths,
    resolvedTrades,
    spawnedFoods,
  }, rangeInput);
}

export function resolveDiagnosticsRange(latestTick, rangeInput = {}) {
  const runStartTick = 0;
  const runLatestTick = nonNegativeInteger(latestTick, 0);
  let fromPercent = clampPercent(rangeInput.fromPercent, 0);
  let toPercent = clampPercent(rangeInput.toPercent, 100);
  if (runLatestTick > runStartTick && fromPercent >= toPercent) {
    fromPercent = 0;
    toPercent = 100;
  }
  const span = Math.max(0, runLatestTick - runStartTick);
  const fromTick = span > 0 ? runStartTick + Math.round((span * fromPercent) / 100) : runStartTick;
  const toTick = span > 0 ? runStartTick + Math.round((span * toPercent) / 100) : runLatestTick;
  return {
    startTick: runStartTick,
    latestTick: runLatestTick,
    fromPercent,
    toPercent,
    fromTick: Math.min(fromTick, toTick),
    toTick: Math.max(fromTick, toTick),
  };
}

function createRangedHistoricalAnalysisContext(fullContext, rangeInput) {
  const range = resolveDiagnosticsRange(fullContext.latestTick, rangeInput);
  const deathsBySpawnerId = new Map(fullContext.deaths.map((death) => [death.spawnerId, death]));
  const intervalBirths = fullContext.births.filter((birth) => isTickInRange(birth.tick, range));
  const intervalDeaths = fullContext.deaths.filter((death) => isTickInRange(death.tick, range));
  const intervalResolvedTrades = fullContext.resolvedTrades.filter((trade) => isTickInRange(trade.tick, range));
  const intervalSpawnedFoods = fullContext.spawnedFoods.filter((food) => isTickInRange(food.tick, range));
  const aliveAgentsAtTo = fullContext.births.filter((birth) => {
    const death = deathsBySpawnerId.get(birth.spawnerId);
    return birth.tick <= range.toTick && (!death || death.tick > range.toTick);
  });
  const baselinePopulation = fullContext.births.reduce((count, birth) => {
    const death = deathsBySpawnerId.get(birth.spawnerId);
    return birth.tick < range.fromTick && (!death || death.tick >= range.fromTick) ? count + 1 : count;
  }, 0);
  const agentAgeEntries = agentAgeExposureEntries(fullContext.births, deathsBySpawnerId, range);
  const agentAges = agentAgeEntries.map((entry) => entry.ageTicks);
  return {
    sessionId: fullContext.sessionId,
    range,
    startTick: range.fromTick,
    latestTick: range.toTick,
    rangeSpanTicks: Math.max(0, range.toTick - range.fromTick),
    births: intervalBirths,
    deaths: intervalDeaths,
    resolvedTrades: intervalResolvedTrades,
    spawnedCount: intervalSpawnedFoods.length,
    baselinePopulation,
    aliveAgentsAtTo,
    agentAges,
    agentAgeBySpawnerId: new Map(agentAgeEntries.map((entry) => [entry.spawnerId, entry.ageTicks])),
  };
}

function agentAgeExposureEntries(births, deathsBySpawnerId, range) {
  return births
    .filter((birth) => {
      const death = deathsBySpawnerId.get(birth.spawnerId);
      return birth.tick <= range.toTick && (!death || death.tick >= range.fromTick);
    })
    .map((birth) => {
      const death = deathsBySpawnerId.get(birth.spawnerId);
      const startTick = Math.max(range.fromTick, nonNegativeInteger(birth.tick, 0));
      const endTick = Math.min(range.toTick, nonNegativeInteger(death?.tick, range.toTick));
      return {
        spawnerId: birth.spawnerId,
        ageTicks: Math.max(0, endTick - startTick),
      };
    });
}

function clampPercent(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function isTickInRange(tick, range) {
  return tick >= range.fromTick && tick <= range.toTick;
}
