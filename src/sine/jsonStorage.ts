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

export function patchSettingsGroup<Root, Branch extends object, Key extends keyof Branch>({
  load,
  save,
  sanitize,
  getBranch,
  setBranch,
  values,
  keys,
}: {
  load: () => Root;
  save: (value: Root) => void;
  sanitize: (value: Root, current: Root) => Root;
  getBranch: (root: Root) => Branch;
  setBranch: (root: Root, branch: Branch) => Root;
  values: Branch;
  keys: readonly Key[];
}): { root: Root; branch: Branch } {
  const current = load();
  const nextBranch = { ...getBranch(current) } as Branch;
  for (const key of keys) {
    nextBranch[key] = values[key];
  }
  const sanitized = sanitize(setBranch(current, nextBranch), current);
  save(sanitized);
  return { root: sanitized, branch: getBranch(sanitized) };
}
