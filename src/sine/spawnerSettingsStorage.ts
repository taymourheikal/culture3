import { DEFAULT_SPAWNER_CONFIG } from "./spawner/config";
import { LEGACY_SECONDS_PER_TICK } from "./marketSignal";
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

export function sanitizeSpawnerConfig(config: Partial<SpawnerConfig>): SpawnerConfig {
  const migrated = migrateLegacySpawnerConfig(config);
  const next = { ...DEFAULT_SPAWNER_CONFIG };
  for (const key of Object.keys(DEFAULT_SPAWNER_CONFIG) as Array<keyof SpawnerConfig>) {
    next[key] = sanitizeValue(key, migrated[key]);
  }

  normalizeBoundedPair(next, "initialEnergyMin", "initialEnergyMax", 0.1);
  normalizeBoundedPair(next, "initialHiddenUnitsMin", "initialHiddenUnitsMax", 1);
  normalizeBoundedPair(next, "initialMinHorizonTicksMin", "initialMinHorizonTicksMax", 1);
  normalizeBoundedPair(next, "initialMaxHorizonTicksMin", "initialMaxHorizonTicksMax", 1);
  normalizeBoundedPair(next, "minHorizonTicksClampMin", "minHorizonTicksClampMax", 1);
  normalizeBoundedPair(next, "maxHorizonTicksClampMin", "maxHorizonTicksClampMax", 1);
  normalizeBoundedPair(next, "cooldownBaseTicksInitialMin", "cooldownBaseTicksInitialMax", 1);
  normalizeBoundedPair(next, "cooldownBaseTicksClampMin", "cooldownBaseTicksClampMax", 1);
  normalizeBoundedPair(next, "thresholdBiasMin", "thresholdBiasMax", 0.001);
  normalizeInitialPopulation(next);

  return next;
}

function migrateLegacySpawnerConfig(config: Partial<SpawnerConfig>) {
  const record = { ...(config as Partial<SpawnerConfig> & Record<string, number | undefined>) };
  copyLegacyNumber(record, "metabolism", "energyDrainPerTick");
  const legacySecondsModel = record.tickSeconds !== undefined || record.foodHistorySeconds !== undefined || record.initialCooldownMax !== undefined;
  copyLegacyTicks(record, "foodHistorySeconds", "foodHistoryTicks");
  copyLegacyTicks(record, "initialCooldownMax", "initialCooldownMaxTicks");
  copyLegacyTicks(record, "cooldownOutputMultiplier", "cooldownOutputMultiplierTicks");
  copyLegacyTicks(record, "initialMinHorizonMin", "initialMinHorizonTicksMin");
  copyLegacyTicks(record, "initialMinHorizonMax", "initialMinHorizonTicksMax");
  copyLegacyTicks(record, "initialMaxHorizonMin", "initialMaxHorizonTicksMin");
  copyLegacyTicks(record, "initialMaxHorizonMax", "initialMaxHorizonTicksMax");
  copyLegacyTicks(record, "minHorizonMutationStdDev", "minHorizonTicksMutationStdDev", false);
  copyLegacyTicks(record, "maxHorizonMutationStdDev", "maxHorizonTicksMutationStdDev", false);
  copyLegacyTicks(record, "minHorizonClampMin", "minHorizonTicksClampMin");
  copyLegacyTicks(record, "minHorizonClampMax", "minHorizonTicksClampMax");
  copyLegacyTicks(record, "maxHorizonClampMin", "maxHorizonTicksClampMin");
  copyLegacyTicks(record, "maxHorizonClampMax", "maxHorizonTicksClampMax");
  copyLegacyTicks(record, "cooldownBaseInitialMin", "cooldownBaseTicksInitialMin");
  copyLegacyTicks(record, "cooldownBaseInitialMax", "cooldownBaseTicksInitialMax");
  copyLegacyTicks(record, "cooldownBaseMutationStdDev", "cooldownBaseTicksMutationStdDev", false);
  copyLegacyTicks(record, "cooldownBaseClampMin", "cooldownBaseTicksClampMin");
  copyLegacyTicks(record, "cooldownBaseClampMax", "cooldownBaseTicksClampMax");
  if (legacySecondsModel) {
    copyLegacyPerTickCost(record, "energyDrainPerTick");
    copyLegacyPerTickCost(record, "brainEnergyCostPerActiveUnit");
    copyLegacyPerTickCost(record, "brainEnergyCostPerActiveConnection");
    copyLegacyPerTickCost(record, "brainEnergyCostPerActiveLayer");
  }
  return record;
}

function copyLegacyNumber(record: Record<string, number | undefined>, legacyKey: string, nextKey: keyof SpawnerConfig) {
  if (record[nextKey] !== undefined || record[legacyKey] === undefined) return;
  const numeric = Number(record[legacyKey]);
  if (Number.isFinite(numeric)) record[nextKey] = numeric;
}

function copyLegacyTicks(record: Record<string, number | undefined>, legacyKey: string, nextKey: keyof SpawnerConfig, round = true) {
  if (record[nextKey] !== undefined || record[legacyKey] === undefined) return;
  const numeric = Number(record[legacyKey]);
  if (!Number.isFinite(numeric)) return;
  const ticks = numeric / LEGACY_SECONDS_PER_TICK;
  record[nextKey] = round ? Math.round(ticks) : ticks;
}

function copyLegacyPerTickCost(record: Record<string, number | undefined>, key: keyof SpawnerConfig) {
  const numeric = Number(record[key]);
  if (Number.isFinite(numeric)) record[key] = numeric * LEGACY_SECONDS_PER_TICK;
}

function cloneSpawnerConfig() {
  return sanitizeSpawnerConfig({ ...DEFAULT_SPAWNER_CONFIG });
}

function sanitizeValue(key: keyof SpawnerConfig, value: number | undefined) {
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

function normalizeInitialPopulation(config: SpawnerConfig) {
  const initialBounds = SPAWNER_CONFIG_BOUNDS.initialSpawners;
  const maxBounds = SPAWNER_CONFIG_BOUNDS.maxSpawners;

  if (config.initialSpawners > config.maxSpawners) {
    config.maxSpawners = Math.min(maxBounds.max, config.initialSpawners);
  }

  if (config.initialSpawners > config.maxSpawners) {
    config.initialSpawners = Math.max(initialBounds.min, config.maxSpawners);
  }

  config.initialSpawners = Math.round(config.initialSpawners);
  config.maxSpawners = Math.round(config.maxSpawners);
}

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function browserStorage(): BrowserStorage | null {
  return (globalThis as { localStorage?: BrowserStorage }).localStorage ?? null;
}
