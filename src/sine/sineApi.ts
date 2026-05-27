export const SINE_API_BASE = "http://127.0.0.1:8787";

export function sineApiUrl(path: string, params?: URLSearchParams | Record<string, string | number | boolean>) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = params instanceof URLSearchParams ? params : params ? new URLSearchParams(stringifyParams(params)) : null;
  return `${SINE_API_BASE}${normalizedPath}${query && query.size > 0 ? `?${query.toString()}` : ""}`;
}

export async function fetchSineJson<T>(path: string, options: RequestInit = {}, params?: URLSearchParams | Record<string, string | number | boolean>) {
  return requestSineJson<T>(path, { options, params, errorMessage: (status) => `Sine API request failed (${status})` });
}

export async function getSineJson<T>(path: string, params?: URLSearchParams | Record<string, string | number | boolean>) {
  return fetchSineJson<T>(path, {}, params);
}

export async function postSineJson<T>(
  path: string,
  body: unknown,
  { errorMessage = (status: number) => `Sine API request failed (${status})` }: { errorMessage?: (status: number) => string } = {},
) {
  return requestSineJson<T>(path, {
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    errorMessage,
  });
}

export async function deleteSineJson(path: string, { errorMessage = (status: number) => `Sine API request failed (${status})` } = {}) {
  const response = await fetch(sineApiUrl(path), { method: "DELETE" });
  if (!response.ok) throw new Error(errorMessage(response.status));
}

async function requestSineJson<T>(
  path: string,
  {
    options,
    params,
    errorMessage,
  }: {
    options: RequestInit;
    params?: URLSearchParams | Record<string, string | number | boolean>;
    errorMessage: (status: number) => string;
  },
) {
  const response = await fetch(sineApiUrl(path, params), options);
  if (!response.ok) throw new Error(errorMessage(response.status));
  return (await response.json()) as T;
}

function stringifyParams(params: Record<string, string | number | boolean>) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]));
}
