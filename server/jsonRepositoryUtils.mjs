export function parseJsonValue(value, fallback, { passthroughNonString = false } = {}) {
  if (value === undefined || value === null) return fallback;
  if (passthroughNonString && typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function stringifyJsonValue(value, { nullishToNull = false } = {}) {
  return JSON.stringify(nullishToNull ? value ?? null : value);
}
