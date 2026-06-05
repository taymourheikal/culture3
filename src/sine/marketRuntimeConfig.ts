import { INITIAL_SETTINGS, LEGACY_SECONDS_PER_TICK, type WaveSettings } from "./marketSignal";
import { clampToBounds, type NumericBounds } from "./marketSettingBounds";
import { sameGeneratedSettings, sanitizeGeneratedSettings } from "./marketGeneratedSettings";

export { sanitizeGeneratedSettings } from "./marketGeneratedSettings";

export type MarketDataSource = "generated" | "btcusd_1m" | "btcusd_5m";
export const MARKET_TIME_MODEL = "ticks-v2";

export type MarketPlaybackEndMode = "none" | "ticks" | "date";

export type MarketPlaybackSettings = {
  rocLengthBars: number;
  startDateTime: string;
  generatedTicksPerSecond: number;
  barsPerSecond: number;
  endMode: MarketPlaybackEndMode;
  endAfterTicks: number;
  endDateTime: string;
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
  endMode: "none",
  endAfterTicks: 10000,
  endDateTime: "2021-01-01T00:00",
};

export const PLAYBACK_SETTING_BOUNDS: Record<keyof Pick<MarketPlaybackSettings, "rocLengthBars" | "generatedTicksPerSecond" | "barsPerSecond" | "endAfterTicks">, NumericBounds> = {
  rocLengthBars: { min: 1, max: 500, step: 1 },
  generatedTicksPerSecond: { min: 1, max: 240, step: 1 },
  barsPerSecond: { min: 1, max: 240, step: 1 },
  endAfterTicks: { min: 1, max: 10_000_000, step: 100 },
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
    endMode: sanitizePlaybackEndMode(record.endMode),
    endAfterTicks: sanitizePlaybackNumber("endAfterTicks", record.endAfterTicks),
    endDateTime: sanitizeDateTime(record.endDateTime, INITIAL_PLAYBACK_SETTINGS.endDateTime),
  };
}

export function isBtcSource(source: MarketDataSource) {
  return source === "btcusd_1m" || source === "btcusd_5m";
}

export function sourceSupportsDatePlaybackEnd(source: MarketDataSource) {
  return isBtcSource(source);
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

function samePlaybackSettings(left: MarketPlaybackSettings, right: MarketPlaybackSettings) {
  return (
    left.rocLengthBars === right.rocLengthBars &&
    left.startDateTime === right.startDateTime &&
    left.generatedTicksPerSecond === right.generatedTicksPerSecond &&
    left.barsPerSecond === right.barsPerSecond &&
    left.endMode === right.endMode &&
    left.endAfterTicks === right.endAfterTicks &&
    left.endDateTime === right.endDateTime
  );
}

function sanitizeSource(value: unknown): MarketDataSource {
  return value === "btcusd_1m" || value === "btcusd_5m" || value === "generated" ? value : "generated";
}

function sanitizePlaybackNumber(key: keyof Pick<MarketPlaybackSettings, "rocLengthBars" | "generatedTicksPerSecond" | "barsPerSecond" | "endAfterTicks">, value: unknown) {
  return clampToBounds(Number(value), INITIAL_PLAYBACK_SETTINGS[key], PLAYBACK_SETTING_BOUNDS[key]);
}

function legacyGeneratedSpeedToTicksPerSecond(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric / LEGACY_SECONDS_PER_TICK : INITIAL_PLAYBACK_SETTINGS.generatedTicksPerSecond;
}

function sanitizeStartDateTime(value: unknown) {
  return sanitizeDateTime(value, INITIAL_PLAYBACK_SETTINGS.startDateTime);
}

function sanitizeDateTime(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? text : fallback;
}

function sanitizePlaybackEndMode(value: unknown): MarketPlaybackEndMode {
  return value === "ticks" || value === "date" || value === "none" ? value : INITIAL_PLAYBACK_SETTINGS.endMode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
