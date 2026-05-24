export const SINE_API_BASE = "http://127.0.0.1:8787";

export function sineApiUrl(path: string, params?: URLSearchParams | Record<string, string | number | boolean>) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = params instanceof URLSearchParams ? params : params ? new URLSearchParams(stringifyParams(params)) : null;
  return `${SINE_API_BASE}${normalizedPath}${query && query.size > 0 ? `?${query.toString()}` : ""}`;
}

export async function fetchSineJson<T>(path: string, options: RequestInit = {}, params?: URLSearchParams | Record<string, string | number | boolean>) {
  const response = await fetch(sineApiUrl(path, params), options);
  if (!response.ok) throw new Error(`Sine API request failed (${response.status})`);
  return (await response.json()) as T;
}

function stringifyParams(params: Record<string, string | number | boolean>) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]));
}
