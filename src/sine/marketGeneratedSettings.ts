import { INITIAL_SETTINGS, LEGACY_SECONDS_PER_TICK, type WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS, clampToBounds } from "./marketSettingBounds";

export const GENERATED_SETTING_KEYS = [
  "amplitude",
  "frequency",
  "phase",
  "slope",
  "noiseAmplitude",
  "noiseFrequency",
  "noiseSeed",
  "amplitudeDrift",
  "frequencyDrift",
  "slopeDrift",
  "noiseAmplitudeDrift",
  "noiseFrequencyDrift",
  "regimeSpeed",
  "regimeSeed",
] as const satisfies ReadonlyArray<keyof WaveSettings>;

const LEGACY_SECONDS_SCALED_KEYS = new Set<keyof WaveSettings>([
  "frequency",
  "slope",
  "noiseFrequency",
  "frequencyDrift",
  "slopeDrift",
  "noiseFrequencyDrift",
  "regimeSpeed",
]);

export function sanitizeGeneratedSettings(settings: unknown, legacySecondsModel = false): WaveSettings {
  const record = isRecord(settings) ? settings : {};
  const sanitized = {} as WaveSettings;
  for (const key of GENERATED_SETTING_KEYS) {
    const rawValue = legacySecondsModel && LEGACY_SECONDS_SCALED_KEYS.has(key) ? scaleLegacySecondsValue(record[key]) : record[key];
    sanitized[key] = sanitizeGeneratedSetting(key, rawValue);
  }
  return sanitized;
}

export function sameGeneratedSettings(left: WaveSettings, right: WaveSettings) {
  return GENERATED_SETTING_KEYS.every((key) => left[key] === right[key]);
}

function sanitizeGeneratedSetting(key: keyof WaveSettings, value: unknown) {
  return clampToBounds(Number(value), INITIAL_SETTINGS[key], MARKET_SETTING_BOUNDS[key]);
}

function scaleLegacySecondsValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric * LEGACY_SECONDS_PER_TICK : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
