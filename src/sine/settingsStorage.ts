import { INITIAL_SETTINGS, type WaveSettings } from "./marketSignal";
import {
  INITIAL_MARKET_RUNTIME_CONFIG,
  sanitizeGeneratedSettings,
  sanitizeMarketRuntimeConfig,
  type MarketPlaybackSettings,
  type MarketRuntimeConfig,
} from "./marketRuntimeConfig";
import { patchSettingsGroup, saveJsonSetting, getBrowserStorage } from "./jsonStorage";

const STORAGE_KEY = "roc-signal-lab.settings.v1";
const RUNTIME_STORAGE_KEY = "roc-signal-lab.runtime-settings.v1";

export function loadSavedMarketSettings(): WaveSettings {
  return loadSavedMarketRuntimeConfig().generated;
}

export function loadSavedMarketRuntimeConfig(): MarketRuntimeConfig {
  const storage = getBrowserStorage();
  if (!storage) return structuredClone(INITIAL_MARKET_RUNTIME_CONFIG);

  try {
    const savedRuntime = storage.getItem(RUNTIME_STORAGE_KEY);
    if (savedRuntime) return sanitizeMarketRuntimeConfig(JSON.parse(savedRuntime));
    const legacy = storage.getItem(STORAGE_KEY);
    if (legacy) {
      return sanitizeMarketRuntimeConfig({
        ...INITIAL_MARKET_RUNTIME_CONFIG,
        generated: sanitizeGeneratedSettings({ ...INITIAL_SETTINGS, ...(JSON.parse(legacy) as Partial<WaveSettings>) }, true),
      });
    }
    return structuredClone(INITIAL_MARKET_RUNTIME_CONFIG);
  } catch {
    return structuredClone(INITIAL_MARKET_RUNTIME_CONFIG);
  }
}

export function saveMarketSettingsGroup(settings: WaveSettings, keys: Array<keyof WaveSettings>) {
  return patchSettingsGroup({
    load: loadSavedMarketRuntimeConfig,
    save: saveRuntimeConfig,
    sanitize: sanitizeMarketRuntimeConfig,
    getBranch: (config) => config.generated,
    setBranch: (config, generated) => ({ ...config, generated }),
    values: settings,
    keys,
  }).branch;
}

export function savePlaybackSettingsGroup(playback: MarketPlaybackSettings, keys: Array<keyof MarketPlaybackSettings>) {
  return patchSettingsGroup({
    load: loadSavedMarketRuntimeConfig,
    save: saveRuntimeConfig,
    sanitize: sanitizeMarketRuntimeConfig,
    getBranch: (config) => config.playback,
    setBranch: (config, playback) => ({ ...config, playback }),
    values: playback,
    keys,
  }).root;
}

export function saveMarketSourceDefault(config: MarketRuntimeConfig) {
  const sanitized = sanitizeMarketRuntimeConfig(config);
  saveRuntimeConfig(sanitized);
  return sanitized;
}

export function sanitizeSettings(settings: WaveSettings): WaveSettings {
  return sanitizeGeneratedSettings(settings);
}

function saveRuntimeConfig(config: MarketRuntimeConfig) {
  saveJsonSetting(RUNTIME_STORAGE_KEY, config);
}
