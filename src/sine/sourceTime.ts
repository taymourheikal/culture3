export function datetimeFromUnixSeconds(value: number | null | undefined) {
  return dateFromUnixSeconds(value)?.toISOString() ?? null;
}

export function dateFromUnixSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const date = new Date(numeric * 1000);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function nullableUnixSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseDateTimeToUnixSeconds(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text) ? `${text}Z` : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}
