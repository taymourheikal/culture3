import { loadSavedMarketRuntimeConfig } from "./settingsStorage";
import { loadSavedSpawnerConfig, sanitizeSpawnerConfig } from "./spawnerSettingsStorage";
import { getBrowserStorage, patchSettingsGroup, saveJsonSetting } from "./jsonStorage";
import { DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL } from "./headless/types";
import { sanitizeMarketRuntimeConfig, type MarketPlaybackSettings, type MarketRuntimeConfig } from "./marketRuntimeConfig";
import type { WaveSettings } from "./marketSignal";
import type { SpawnerConfig } from "./spawnerSimulation";

const STORAGE_KEY = "roc-signal-lab.runs-settings.v1";

export type SineRunsDefaults = {
  ticks: number;
  seed: number;
  minimumResolvedTrades: number;
  resolvedTradeSnapshotInterval: number;
  checkpointIntervalTicks: number;
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
};

export function loadSavedRunsDefaults(): SineRunsDefaults {
  const fallback = labDefaults();
  const storage = getBrowserStorage();
  if (!storage) return fallback;
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return saved ? sanitizeRunsDefaults(JSON.parse(saved), fallback) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSavedLabDefaultsForRuns(): Pick<SineRunsDefaults, "marketConfig" | "spawnerConfig"> {
  return {
    marketConfig: loadSavedMarketRuntimeConfig(),
    spawnerConfig: loadSavedSpawnerConfig(),
  };
}

export function saveRunsExecutionDefaults(defaults: SineRunsDefaults) {
  const current = loadSavedRunsDefaults();
  const next = sanitizeRunsDefaults(
    {
      ...current,
      ticks: defaults.ticks,
      seed: defaults.seed,
      minimumResolvedTrades: defaults.minimumResolvedTrades,
      resolvedTradeSnapshotInterval: defaults.resolvedTradeSnapshotInterval,
      checkpointIntervalTicks: defaults.checkpointIntervalTicks,
    },
    current,
  );
  saveRunsDefaults(next);
  return next;
}

export function saveRunsMarketSourceDefault(config: MarketRuntimeConfig) {
  const current = loadSavedRunsDefaults();
  const next = sanitizeRunsDefaults({ ...current, marketConfig: sanitizeMarketRuntimeConfig(config) }, current);
  saveRunsDefaults(next);
  return next.marketConfig;
}

export function saveRunsPlaybackSettingsGroup(playback: MarketPlaybackSettings, keys: Array<keyof MarketPlaybackSettings>) {
  return patchRunsSettingsGroup({
    getBranch: (defaults) => defaults.marketConfig.playback,
    setBranch: (defaults, nextPlayback) => ({ ...defaults, marketConfig: { ...defaults.marketConfig, playback: nextPlayback } }),
    values: playback,
    keys,
  }).root.marketConfig;
}

export function saveRunsMarketSettingsGroup(settings: WaveSettings, keys: Array<keyof WaveSettings>) {
  return patchRunsSettingsGroup({
    getBranch: (defaults) => defaults.marketConfig.generated,
    setBranch: (defaults, nextGenerated) => ({ ...defaults, marketConfig: { ...defaults.marketConfig, generated: nextGenerated } }),
    values: settings,
    keys,
  }).branch;
}

export function saveRunsSpawnerConfigGroup(config: SpawnerConfig, keys: Array<keyof SpawnerConfig>) {
  return patchRunsSettingsGroup({
    getBranch: (defaults) => defaults.spawnerConfig,
    setBranch: (defaults, spawnerConfig) => ({ ...defaults, spawnerConfig }),
    values: config,
    keys,
  }).branch;
}

function patchRunsSettingsGroup<Branch extends object, Key extends keyof Branch>({
  getBranch,
  setBranch,
  values,
  keys,
}: {
  getBranch: (defaults: SineRunsDefaults) => Branch;
  setBranch: (defaults: SineRunsDefaults, branch: Branch) => SineRunsDefaults;
  values: Branch;
  keys: readonly Key[];
}) {
  return patchSettingsGroup({
    load: loadSavedRunsDefaults,
    save: saveRunsDefaults,
    sanitize: (value, current) => sanitizeRunsDefaults(value, current),
    getBranch,
    setBranch,
    values,
    keys,
  });
}

function labDefaults(): SineRunsDefaults {
  return {
    ticks: 100000,
    seed: 101,
    minimumResolvedTrades: 10,
    resolvedTradeSnapshotInterval: DEFAULT_HEADLESS_RESOLVED_TRADE_SNAPSHOT_INTERVAL,
    checkpointIntervalTicks: 10000,
    marketConfig: loadSavedMarketRuntimeConfig(),
    spawnerConfig: loadSavedSpawnerConfig(),
  };
}

function sanitizeRunsDefaults(value: unknown, fallback: SineRunsDefaults): SineRunsDefaults {
  const record = isRecord(value) ? value : {};
  return {
    ticks: readInteger(record.ticks, fallback.ticks, 0),
    seed: readInteger(record.seed, fallback.seed, 0),
    minimumResolvedTrades: readInteger(record.minimumResolvedTrades, fallback.minimumResolvedTrades, 0),
    resolvedTradeSnapshotInterval: readInteger(record.resolvedTradeSnapshotInterval, fallback.resolvedTradeSnapshotInterval, 0),
    checkpointIntervalTicks: readInteger(record.checkpointIntervalTicks, fallback.checkpointIntervalTicks, 1),
    marketConfig: sanitizeMarketRuntimeConfig(record.marketConfig ?? fallback.marketConfig),
    spawnerConfig: sanitizeSpawnerConfig(isRecord(record.spawnerConfig) ? record.spawnerConfig : fallback.spawnerConfig),
  };
}

function saveRunsDefaults(defaults: SineRunsDefaults) {
  saveJsonSetting(STORAGE_KEY, defaults);
}

function readInteger(value: unknown, fallback: number, min: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.floor(parsed)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
