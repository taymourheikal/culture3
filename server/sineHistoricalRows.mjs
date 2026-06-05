import { nonNegativeInteger } from "../src/sine/numeric.ts";
import { finiteNumber, finiteNumberOrNull, normalizeDeathCause, parseJson } from "./sineRepositoryUtils.mjs";

export function parseHistoricalBirthRow(row) {
  return {
    spawnerId: Number(row.spawner_id),
    parentSpawnerId: row.parent_spawner_id === null ? null : Number(row.parent_spawner_id),
    lineageId: Number(row.lineage_id),
    generation: Number(row.generation ?? 0),
    tick: nonNegativeInteger(row.birth_tick, 0),
    sourceTimestamp: finiteNumberOrNull(row.source_timestamp),
    sourceDatetime: row.source_datetime ?? null,
  };
}

export function parseHistoricalDeathRow(row) {
  return {
    spawnerId: Number(row.spawner_id),
    lineageId: Number(row.lineage_id),
    generation: Number(row.generation ?? 0),
    tick: nonNegativeInteger(row.death_tick, 0),
    deathCause: normalizeDeathCause(row.death_cause),
    deathEnergyThreshold: finiteNumberOrNull(row.death_energy_threshold),
    deathHealthThreshold: finiteNumberOrNull(row.death_health_threshold),
    sourceTimestamp: finiteNumberOrNull(row.source_timestamp),
    sourceDatetime: row.source_datetime ?? null,
  };
}

export function parseHistoricalResolvedTradeRow(row) {
  const food = parseJson(row.food_json, null);
  if (!food) return null;
  const payoff = finiteNumber(food.payoff, 0);
  const status = String(food.status ?? (payoff > 0 ? "win" : "loss"));
  return {
    tick: nonNegativeInteger(food.resolveTick ?? row.tick, nonNegativeInteger(row.tick, 0)),
    spawnTick: nonNegativeInteger(food.spawnTick, nonNegativeInteger(row.tick, 0)),
    resolveTick: nonNegativeInteger(food.resolveTick ?? row.tick, nonNegativeInteger(row.tick, 0)),
    spawnerId: nonNegativeInteger(food.creatorSpawnerId, nonNegativeInteger(row.spawner_id, 0)),
    lineageId: nonNegativeInteger(food.creatorLineageId, nonNegativeInteger(row.lineage_id, 0)),
    payoff,
    status,
    win: status === "win" || payoff > 0,
    direction: String(food.direction ?? "unknown"),
    strength: finiteNumber(food.strength, 0),
    horizonTicks: nonNegativeInteger(food.horizonTicks, 0),
    entrySignal: finiteNumberOrNull(food.entrySignal),
    exitSignal: finiteNumberOrNull(food.exitSignal),
    entryPrice: finiteNumberOrNull(food.entryPrice),
    exitPrice: finiteNumberOrNull(food.exitPrice),
    sourceTimestamp: finiteNumberOrNull(food.sourceTimestamp),
    exitSourceTimestamp: finiteNumberOrNull(food.exitSourceTimestamp),
  };
}
