import { INITIAL_SETTINGS, LEGACY_SECONDS_PER_TICK, type WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS, clampToBounds, type NumericBounds } from "./marketSettingBounds";

export type MarketDataSource = "generated" | "btcusd_1m" | "btcusd_5m";
export const MARKET_TIME_MODEL = "ticks-v2";

export type MarketPlaybackSettings = {
  rocLengthBars: number;
  startDateTime: string;
  generatedTicksPerSecond: number;
  barsPerSecond: number;
};

export type MarketRuntimeConfig = {
  timeModel: typeof MARKET_TIME_MODEL;
  source: MarketDataSource;
  generated: WaveSettings;
  playback: MarketPlaybackSettings;
};

export const INITIAL_PLAYBACK_SETTINGS: MarketPlaybackSettings = {
  rocLengthBars: 50,
  startDateTime: "2021-01-01T00:00",
  generatedTicksPerSecond: 1 / LEGACY_SECONDS_PER_TICK,
  barsPerSecond: 30,
};

export const PLAYBACK_SETTING_BOUNDS: Record<keyof Pick<MarketPlaybackSettings, "rocLengthBars" | "generatedTicksPerSecond" | "barsPerSecond">, NumericBounds> = {
  rocLengthBars: { min: 1, max: 500, step: 1 },
  generatedTicksPerSecond: { min: 1, max: 240, step: 1 },
  barsPerSecond: { min: 1, max: 240, step: 1 },
};

export const INITIAL_MARKET_RUNTIME_CONFIG: MarketRuntimeConfig = {
  timeModel: MARKET_TIME_MODEL,
  source: "generated",
  generated: { ...INITIAL_SETTINGS },
  playback: { ...INITIAL_PLAYBACK_SETTINGS },
};

export function sanitizeMarketRuntimeConfig(value: unknown): MarketRuntimeConfig {
  const record = isRecord(value) ? value : {};
  const generatedCandidate = isRecord(record.generated) ? record.generated : record;
  const playbackCandidate = isRecord(record.playback) ? record.playback : {};
  return {
    timeModel: MARKET_TIME_MODEL,
    source: sanitizeSource(record.source),
    generated: sanitizeGeneratedSettings(generatedCandidate),
    playback: sanitizePlaybackSettings(playbackCandidate, generatedCandidate),
  };
}

export function sanitizeGeneratedSettings(settings: unknown, legacySecondsModel = false): WaveSettings {
  const record = isRecord(settings) ? settings : {};
  return {
    amplitude: sanitizeGeneratedSetting("amplitude", record.amplitude),
    frequency: sanitizeGeneratedSetting("frequency", legacySecondsModel ? scaleLegacySecondsValue(record.frequency) : record.frequency),
    phase: sanitizeGeneratedSetting("phase", record.phase),
    slope: sanitizeGeneratedSetting("slope", legacySecondsModel ? scaleLegacySecondsValue(record.slope) : record.slope),
    noiseAmplitude: sanitizeGeneratedSetting("noiseAmplitude", record.noiseAmplitude),
    noiseFrequency: sanitizeGeneratedSetting("noiseFrequency", legacySecondsModel ? scaleLegacySecondsValue(record.noiseFrequency) : record.noiseFrequency),
    noiseSeed: sanitizeGeneratedSetting("noiseSeed", record.noiseSeed),
    amplitudeDrift: sanitizeGeneratedSetting("amplitudeDrift", record.amplitudeDrift),
    frequencyDrift: sanitizeGeneratedSetting("frequencyDrift", legacySecondsModel ? scaleLegacySecondsValue(record.frequencyDrift) : record.frequencyDrift),
    slopeDrift: sanitizeGeneratedSetting("slopeDrift", legacySecondsModel ? scaleLegacySecondsValue(record.slopeDrift) : record.slopeDrift),
    noiseAmplitudeDrift: sanitizeGeneratedSetting("noiseAmplitudeDrift", record.noiseAmplitudeDrift),
    noiseFrequencyDrift: sanitizeGeneratedSetting("noiseFrequencyDrift", legacySecondsModel ? scaleLegacySecondsValue(record.noiseFrequencyDrift) : record.noiseFrequencyDrift),
    regimeSpeed: sanitizeGeneratedSetting("regimeSpeed", legacySecondsModel ? scaleLegacySecondsValue(record.regimeSpeed) : record.regimeSpeed),
    regimeSeed: sanitizeGeneratedSetting("regimeSeed", record.regimeSeed),
  };
}

export function sanitizePlaybackSettings(settings: unknown, legacyGeneratedSettings: unknown = undefined): MarketPlaybackSettings {
  const record = isRecord(settings) ? settings : {};
  const generatedRecord = isRecord(legacyGeneratedSettings) ? legacyGeneratedSettings : {};
  return {
    rocLengthBars: sanitizePlaybackNumber("rocLengthBars", record.rocLengthBars),
    startDateTime: sanitizeStartDateTime(record.startDateTime),
    generatedTicksPerSecond: sanitizePlaybackNumber(
      "generatedTicksPerSecond",
      record.generatedTicksPerSecond ?? legacyGeneratedSpeedToTicksPerSecond(generatedRecord.speed),
    ),
    barsPerSecond: sanitizePlaybackNumber("barsPerSecond", record.barsPerSecond),
  };
}

export function isBtcSource(source: MarketDataSource) {
  return source === "btcusd_1m" || source === "btcusd_5m";
}

export function sourceLabel(source: MarketDataSource) {
  if (source === "btcusd_1m") return "BTCUSD 1m";
  if (source === "btcusd_5m") return "BTCUSD 5m";
  return "Generated sine waves";
}

export function sameMarketRuntimeConfig(left: MarketRuntimeConfig, right: MarketRuntimeConfig) {
  const sanitizedRight = sanitizeMarketRuntimeConfig(right);
  return (
    left.timeModel === sanitizedRight.timeModel &&
    left.source === sanitizedRight.source &&
    sameGeneratedSettings(left.generated, sanitizedRight.generated) &&
    samePlaybackSettings(left.playback, sanitizedRight.playback)
  );
}

function sameGeneratedSettings(left: WaveSettings, right: WaveSettings) {
  return (
    left.amplitude === right.amplitude &&
    left.frequency === right.frequency &&
    left.phase === right.phase &&
    left.slope === right.slope &&
    left.noiseAmplitude === right.noiseAmplitude &&
    left.noiseFrequency === right.noiseFrequency &&
    left.noiseSeed === right.noiseSeed &&
    left.amplitudeDrift === right.amplitudeDrift &&
    left.frequencyDrift === right.frequencyDrift &&
    left.slopeDrift === right.slopeDrift &&
    left.noiseAmplitudeDrift === right.noiseAmplitudeDrift &&
    left.noiseFrequencyDrift === right.noiseFrequencyDrift &&
    left.regimeSpeed === right.regimeSpeed &&
    left.regimeSeed === right.regimeSeed
  );
}

function samePlaybackSettings(left: MarketPlaybackSettings, right: MarketPlaybackSettings) {
  return (
    left.rocLengthBars === right.rocLengthBars &&
    left.startDateTime === right.startDateTime &&
    left.generatedTicksPerSecond === right.generatedTicksPerSecond &&
    left.barsPerSecond === right.barsPerSecond
  );
}

function sanitizeSource(value: unknown): MarketDataSource {
  return value === "btcusd_1m" || value === "btcusd_5m" || value === "generated" ? value : "generated";
}

function sanitizeGeneratedSetting(key: keyof WaveSettings, value: unknown) {
  return clampToBounds(Number(value), INITIAL_SETTINGS[key], MARKET_SETTING_BOUNDS[key]);
}

function sanitizePlaybackNumber(key: keyof Pick<MarketPlaybackSettings, "rocLengthBars" | "generatedTicksPerSecond" | "barsPerSecond">, value: unknown) {
  return clampToBounds(Number(value), INITIAL_PLAYBACK_SETTINGS[key], PLAYBACK_SETTING_BOUNDS[key]);
}

function scaleLegacySecondsValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric * LEGACY_SECONDS_PER_TICK : value;
}

function legacyGeneratedSpeedToTicksPerSecond(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric / LEGACY_SECONDS_PER_TICK : INITIAL_PLAYBACK_SETTINGS.generatedTicksPerSecond;
}

function sanitizeStartDateTime(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return INITIAL_PLAYBACK_SETTINGS.startDateTime;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? text : INITIAL_PLAYBACK_SETTINGS.startDateTime;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
