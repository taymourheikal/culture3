import { DEFAULT_SPAWNER_CONFIG } from "./spawner/config";
import { LEGACY_SECONDS_PER_TICK } from "./marketSignal";
import { SPAWNER_CONFIG_BOUNDS, clampSpawnerValue } from "./spawnerConfigBounds";
import { loadJsonSetting, saveJsonSetting } from "./jsonStorage";
import type { SpawnerConfig } from "./spawnerSimulation";

const STORAGE_KEY = "roc-signal-lab.spawner-settings.v1";

const LEGACY_NUMBER_ALIASES: Array<{ legacyKey: string; nextKey: keyof SpawnerConfig }> = [
  { legacyKey: "metabolism", nextKey: "energyDrainPerTick" },
  { legacyKey: "spawnThreshold", nextKey: "defaultSpawnThreshold" },
  { legacyKey: "minSignalStrength", nextKey: "defaultMinSignalStrength" },
];

const LEGACY_TICK_ALIASES: Array<{ legacyKey: string; nextKey: keyof SpawnerConfig; round?: boolean }> = [
  { legacyKey: "foodHistorySeconds", nextKey: "foodHistoryTicks" },
  { legacyKey: "initialCooldownMax", nextKey: "initialCooldownMaxTicks" },
  { legacyKey: "cooldownOutputMultiplier", nextKey: "cooldownOutputMultiplierTicks" },
  { legacyKey: "initialMinHorizonMin", nextKey: "initialMinHorizonTicksMin" },
  { legacyKey: "initialMinHorizonMax", nextKey: "initialMinHorizonTicksMax" },
  { legacyKey: "initialMaxHorizonMin", nextKey: "initialMaxHorizonTicksMin" },
  { legacyKey: "initialMaxHorizonMax", nextKey: "initialMaxHorizonTicksMax" },
  { legacyKey: "minHorizonMutationStdDev", nextKey: "minHorizonTicksMutationStdDev", round: false },
  { legacyKey: "maxHorizonMutationStdDev", nextKey: "maxHorizonTicksMutationStdDev", round: false },
  { legacyKey: "minHorizonClampMin", nextKey: "minHorizonTicksClampMin" },
  { legacyKey: "minHorizonClampMax", nextKey: "minHorizonTicksClampMax" },
  { legacyKey: "maxHorizonClampMin", nextKey: "maxHorizonTicksClampMin" },
  { legacyKey: "maxHorizonClampMax", nextKey: "maxHorizonTicksClampMax" },
  { legacyKey: "cooldownBaseInitialMin", nextKey: "cooldownBaseTicksInitialMin" },
  { legacyKey: "cooldownBaseInitialMax", nextKey: "cooldownBaseTicksInitialMax" },
  { legacyKey: "cooldownBaseMutationStdDev", nextKey: "cooldownBaseTicksMutationStdDev", round: false },
  { legacyKey: "cooldownBaseClampMin", nextKey: "cooldownBaseTicksClampMin" },
  { legacyKey: "cooldownBaseClampMax", nextKey: "cooldownBaseTicksClampMax" },
];

const LEGACY_SECONDS_MODEL_TRIGGERS = ["tickSeconds", "foodHistorySeconds", "initialCooldownMax"];
const LEGACY_PER_TICK_COST_KEYS: Array<keyof SpawnerConfig> = [
  "energyDrainPerTick",
  "brainEnergyCostPerActiveUnit",
  "brainEnergyCostPerActiveConnection",
  "brainEnergyCostPerActiveLayer",
];

const BOUNDED_PAIRS: Array<{ minKey: keyof SpawnerConfig; maxKey: keyof SpawnerConfig; gap: number }> = [
  { minKey: "initialEnergyMin", maxKey: "initialEnergyMax", gap: 0.1 },
  { minKey: "initialHiddenUnitsMin", maxKey: "initialHiddenUnitsMax", gap: 1 },
  { minKey: "initialMinHorizonTicksMin", maxKey: "initialMinHorizonTicksMax", gap: 1 },
  { minKey: "initialMaxHorizonTicksMin", maxKey: "initialMaxHorizonTicksMax", gap: 1 },
  { minKey: "minHorizonTicksClampMin", maxKey: "minHorizonTicksClampMax", gap: 1 },
  { minKey: "maxHorizonTicksClampMin", maxKey: "maxHorizonTicksClampMax", gap: 1 },
  { minKey: "cooldownBaseTicksInitialMin", maxKey: "cooldownBaseTicksInitialMax", gap: 1 },
  { minKey: "cooldownBaseTicksClampMin", maxKey: "cooldownBaseTicksClampMax", gap: 1 },
  { minKey: "thresholdBiasMin", maxKey: "thresholdBiasMax", gap: 0.001 },
  { minKey: "reproductionCostMinMultiplier", maxKey: "reproductionCostMaxMultiplier", gap: 0 },
];

export function loadSavedSpawnerConfig(): SpawnerConfig {
  return loadJsonSetting(STORAGE_KEY, cloneSpawnerConfig, (saved) => sanitizeSpawnerConfig(saved as Partial<SpawnerConfig>));
}

export function saveSpawnerConfigGroup(config: SpawnerConfig, keys: Array<keyof SpawnerConfig>) {
  const current = loadSavedSpawnerConfig();
  const next = { ...current };
  for (const key of keys) {
    next[key] = config[key];
  }
  const sanitized = sanitizeSpawnerConfig(next);
  saveJsonSetting(STORAGE_KEY, sanitized);
  return sanitized;
}

export function sanitizeSpawnerConfig(config: Partial<SpawnerConfig>): SpawnerConfig {
  const migrated = migrateLegacySpawnerConfig(config);
  const next = { ...DEFAULT_SPAWNER_CONFIG };
  for (const key of Object.keys(DEFAULT_SPAWNER_CONFIG) as Array<keyof SpawnerConfig>) {
    next[key] = sanitizeValue(key, migrated[key]);
  }

  for (const pair of BOUNDED_PAIRS) normalizeBoundedPair(next, pair.minKey, pair.maxKey, pair.gap);
  normalizeInitialPopulation(next);

  return next;
}

function migrateLegacySpawnerConfig(config: Partial<SpawnerConfig>) {
  const record = { ...(config as Partial<SpawnerConfig> & Record<string, number | undefined>) };
  for (const alias of LEGACY_NUMBER_ALIASES) copyLegacyNumber(record, alias.legacyKey, alias.nextKey);
  const legacySecondsModel = LEGACY_SECONDS_MODEL_TRIGGERS.some((key) => record[key] !== undefined);
  for (const alias of LEGACY_TICK_ALIASES) copyLegacyTicks(record, alias.legacyKey, alias.nextKey, alias.round ?? true);
  if (legacySecondsModel) {
    for (const key of LEGACY_PER_TICK_COST_KEYS) copyLegacyPerTickCost(record, key);
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
