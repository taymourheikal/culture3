export type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function getBrowserStorage(): BrowserStorage | null {
  return (globalThis as { localStorage?: BrowserStorage }).localStorage ?? null;
}

export function loadJsonSetting<T>(key: string, fallback: () => T, sanitize: (value: unknown) => T): T {
  const storage = getBrowserStorage();
  if (!storage) return fallback();
  try {
    const saved = storage.getItem(key);
    return saved ? sanitize(JSON.parse(saved)) : fallback();
  } catch {
    return fallback();
  }
}

export function saveJsonSetting(key: string, value: unknown) {
  getBrowserStorage()?.setItem(key, JSON.stringify(value));
}
