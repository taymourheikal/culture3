import { DEFAULT_SPAWNER_CONFIG } from "./spawner/config";
import { SPAWNER_CONFIG_BOUNDS, clampSpawnerValue } from "./spawnerConfigBounds";
import type { SpawnerConfig } from "./spawnerSimulation";

const STORAGE_KEY = "roc-signal-lab.spawner-settings.v1";

export function loadSavedSpawnerConfig(): SpawnerConfig {
  const storage = browserStorage();
  if (!storage) return cloneSpawnerConfig();

  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (!saved) return cloneSpawnerConfig();
    return sanitizeSpawnerConfig({ ...DEFAULT_SPAWNER_CONFIG, ...(JSON.parse(saved) as Partial<SpawnerConfig>) });
  } catch {
    return cloneSpawnerConfig();
  }
}

export function saveSpawnerConfigGroup(config: SpawnerConfig, keys: Array<keyof SpawnerConfig>) {
  const current = loadSavedSpawnerConfig();
  const next = { ...current };
  for (const key of keys) {
    next[key] = config[key];
  }
  const sanitized = sanitizeSpawnerConfig(next);
  browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function sanitizeSpawnerConfig(config: SpawnerConfig): SpawnerConfig {
  const next = { ...DEFAULT_SPAWNER_CONFIG };
  for (const key of Object.keys(DEFAULT_SPAWNER_CONFIG) as Array<keyof SpawnerConfig>) {
    next[key] = sanitizeValue(key, config[key]);
  }

  normalizeBoundedPair(next, "initialEnergyMin", "initialEnergyMax", 0.1);
  normalizeBoundedPair(next, "initialHiddenUnitsMin", "initialHiddenUnitsMax", 1);
  normalizeBoundedPair(next, "initialMinHorizonMin", "initialMinHorizonMax", 0.01);
  normalizeBoundedPair(next, "initialMaxHorizonMin", "initialMaxHorizonMax", 0.01);
  normalizeBoundedPair(next, "minHorizonClampMin", "minHorizonClampMax", 0.01);
  normalizeBoundedPair(next, "maxHorizonClampMin", "maxHorizonClampMax", 0.01);
  normalizeBoundedPair(next, "cooldownBaseInitialMin", "cooldownBaseInitialMax", 0.01);
  normalizeBoundedPair(next, "cooldownBaseClampMin", "cooldownBaseClampMax", 0.01);
  normalizeBoundedPair(next, "mutationStdDevMin", "mutationStdDevMax", 0.001);
  normalizeBoundedPair(next, "thresholdBiasMin", "thresholdBiasMax", 0.001);

  return next;
}

function cloneSpawnerConfig() {
  return sanitizeSpawnerConfig({ ...DEFAULT_SPAWNER_CONFIG });
}

function sanitizeValue(key: keyof SpawnerConfig, value: number) {
  return clampSpawnerValue(value, DEFAULT_SPAWNER_CONFIG[key], SPAWNER_CONFIG_BOUNDS[key]);
}

function normalizeBoundedPair(config: SpawnerConfig, minKey: keyof SpawnerConfig, maxKey: keyof SpawnerConfig, gap: number) {
  const minBounds = SPAWNER_CONFIG_BOUNDS[minKey];
  const maxBounds = SPAWNER_CONFIG_BOUNDS[maxKey];
  const maxAllowedMin = maxBounds.max - gap;

  config[minKey] = Math.min(config[minKey], maxAllowedMin);
  config[minKey] = Math.max(minBounds.min, Math.min(minBounds.max, config[minKey]));
  config[maxKey] = Math.max(config[maxKey], config[minKey] + gap);
  config[maxKey] = Math.max(maxBounds.min, Math.min(maxBounds.max, config[maxKey]));

  if (config[maxKey] < config[minKey] + gap) {
    config[minKey] = Math.max(minBounds.min, config[maxKey] - gap);
  }

  if (minBounds.integer) config[minKey] = Math.round(config[minKey]);
  if (maxBounds.integer) config[maxKey] = Math.round(config[maxKey]);
}

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function browserStorage(): BrowserStorage | null {
  return (globalThis as { localStorage?: BrowserStorage }).localStorage ?? null;
}
