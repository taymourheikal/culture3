import { INITIAL_SETTINGS, type WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS, clampToBounds } from "./marketSettingBounds";

const STORAGE_KEY = "roc-signal-lab.settings.v1";

export function loadSavedMarketSettings(): WaveSettings {
  const storage = browserStorage();
  if (!storage) return { ...INITIAL_SETTINGS };

  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (!saved) return { ...INITIAL_SETTINGS };
    return sanitizeSettings({ ...INITIAL_SETTINGS, ...(JSON.parse(saved) as Partial<WaveSettings>) });
  } catch {
    return { ...INITIAL_SETTINGS };
  }
}

export function saveMarketSettingsGroup(settings: WaveSettings, keys: Array<keyof WaveSettings>) {
  const current = loadSavedMarketSettings();
  const next = { ...current };
  for (const key of keys) {
    next[key] = settings[key];
  }
  const sanitized = sanitizeSettings(next);
  browserStorage()?.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function sanitizeSettings(settings: WaveSettings): WaveSettings {
  return {
    amplitude: sanitizeSetting("amplitude", settings.amplitude),
    frequency: sanitizeSetting("frequency", settings.frequency),
    phase: sanitizeSetting("phase", settings.phase),
    speed: sanitizeSetting("speed", settings.speed),
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
