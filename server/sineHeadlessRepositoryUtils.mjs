import { parseJsonValue, stringifyJsonValue } from "./jsonRepositoryUtils.mjs";

export function count(statement, runId) {
  return statement.get(runId)?.count ?? 0;
}

export function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function stringifyJson(value) {
  return stringifyJsonValue(value, { nullishToNull: true });
}

export function parseJson(value, fallback) {
  return parseJsonValue(value, fallback);
}
