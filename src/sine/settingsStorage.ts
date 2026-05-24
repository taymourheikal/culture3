import { INITIAL_SETTINGS, type WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS, clampToBounds } from "./marketSettingBounds";
import {
  INITIAL_MARKET_RUNTIME_CONFIG,
  sanitizeGeneratedSettings,
  sanitizeMarketRuntimeConfig,
  type MarketPlaybackSettings,
  type MarketRuntimeConfig,
} from "./marketRuntimeConfig";

const STORAGE_KEY = "roc-signal-lab.settings.v1";
const RUNTIME_STORAGE_KEY = "roc-signal-lab.runtime-settings.v1";

export function loadSavedMarketSettings(): WaveSettings {
  return loadSavedMarketRuntimeConfig().generated;
}

export function loadSavedMarketRuntimeConfig(): MarketRuntimeConfig {
  const storage = browserStorage();
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
  const current = loadSavedMarketRuntimeConfig();
  const next = { ...current.generated };
  for (const key of keys) {
    next[key] = settings[key];
  }
  const sanitized = sanitizeMarketRuntimeConfig({ ...current, generated: next });
  saveRuntimeConfig(sanitized);
  return sanitized.generated;
}

export function savePlaybackSettingsGroup(playback: MarketPlaybackSettings, keys: Array<keyof MarketPlaybackSettings>) {
  const current = loadSavedMarketRuntimeConfig();
  const next: Record<keyof MarketPlaybackSettings, string | number> = { ...current.playback };
  for (const key of keys) {
    next[key] = playback[key];
  }
  const sanitized = sanitizeMarketRuntimeConfig({ ...current, playback: next });
  saveRuntimeConfig(sanitized);
  return sanitized;
}

export function saveMarketSourceDefault(config: MarketRuntimeConfig) {
  const sanitized = sanitizeMarketRuntimeConfig(config);
  saveRuntimeConfig(sanitized);
  return sanitized;
}

export function sanitizeSettings(settings: WaveSettings): WaveSettings {
  return {
    amplitude: sanitizeSetting("amplitude", settings.amplitude),
    frequency: sanitizeSetting("frequency", settings.frequency),
    phase: sanitizeSetting("phase", settings.phase),
    slope: sanitizeSetting("slope", settings.slope),
    noiseAmplitude: sanitizeSetting("noiseAmplitude", settings.noiseAmplitude),
    noiseFrequency: sanitizeSetting("noiseFrequency", settings.noiseFrequency),
    noiseSeed: sanitizeSetting("noiseSeed", settings.noiseSeed),
    amplitudeDrift: sanitizeSetting("amplitudeDrift", settings.amplitudeDrift),
    frequencyDrift: sanitizeSetting("frequencyDrift", settings.frequencyDrift),
    slopeDrift: sanitizeSetting("slopeDrift", settings.slopeDrift),
    noiseAmplitudeDrift: sanitizeSetting("noiseAmplitudeDrift", settings.noiseAmplitudeDrift),
    noiseFrequencyDrift: sanitizeSetting("noiseFrequencyDrift", settings.noiseFrequencyDrift),
    regimeSpeed: sanitizeSetting("regimeSpeed", settings.regimeSpeed),
    regimeSeed: sanitizeSetting("regimeSeed", settings.regimeSeed),
  };
}

function sanitizeSetting(key: keyof WaveSettings, value: number) {
  return clampToBounds(value, INITIAL_SETTINGS[key], MARKET_SETTING_BOUNDS[key]);
}

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function browserStorage(): BrowserStorage | null {
  return (globalThis as { localStorage?: BrowserStorage }).localStorage ?? null;
}

function saveRuntimeConfig(config: MarketRuntimeConfig) {
  const storage = browserStorage();
  if (!storage) return;
  storage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(config));
}
