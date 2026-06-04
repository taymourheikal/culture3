import { finiteOr, nonNegativeInteger } from "../src/sine/numeric.ts";
import { parseJsonValue, stringifyJsonValue } from "./jsonRepositoryUtils.mjs";

export function parseJson(value, fallback) {
  return parseJsonValue(value, fallback, { passthroughNonString: true });
}

export function stringifyJson(value) {
  return stringifyJsonValue(value);
}

export function rows(value) {
  return Array.isArray(value) ? value : [];
}

export function eventTick(row, batch) {
  return row.tick ?? batch.tick ?? 0;
}

export function eventTime(row, batch) {
  return row.time ?? row.tick ?? batch.tick ?? 0;
}

export function finiteNumber(value, fallback) {
  return finiteOr(value, fallback);
}

export function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function integerNumber(value, fallback) {
  return nonNegativeInteger(value, fallback);
}

export function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

export function normalizeDeathCause(value) {
  return ["low_energy", "low_health", "both"].includes(value) ? value : "unknown";
}
