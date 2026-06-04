export type WaveSettings = {
  amplitude: number;
  frequency: number;
  phase: number;
  slope: number;
  noiseAmplitude: number;
  noiseFrequency: number;
  noiseSeed: number;
  amplitudeDrift: number;
  frequencyDrift: number;
  slopeDrift: number;
  noiseAmplitudeDrift: number;
  noiseFrequencyDrift: number;
  regimeSpeed: number;
  regimeSeed: number;
};

export type EffectiveParameters = {
  amplitude: number;
  frequency: number;
  slope: number;
  noiseAmplitude: number;
  noiseFrequency: number;
};

export type SignalSample = {
  tick: number;
  phase: number;
  trend: number;
  signal: number;
  noise: number;
  parameters: EffectiveParameters;
  settings: WaveSettings;
  price?: number;
  volume?: number;
  sourceTimestamp?: number;
  sourceDatetime?: string;
};

export const BASE_ROC = 0;
export const LEGACY_SECONDS_PER_TICK = 0.18;

export const INITIAL_SETTINGS: WaveSettings = {
  amplitude: 1.2,
  frequency: 0.16 * LEGACY_SECONDS_PER_TICK,
  phase: 0,
  slope: 0.02 * LEGACY_SECONDS_PER_TICK,
  noiseAmplitude: 0.35,
  noiseFrequency: 1.5 * LEGACY_SECONDS_PER_TICK,
  noiseSeed: 7,
  amplitudeDrift: 0.9,
  frequencyDrift: 0.04 * LEGACY_SECONDS_PER_TICK,
  slopeDrift: 0.08 * LEGACY_SECONDS_PER_TICK,
  noiseAmplitudeDrift: 0.45,
  noiseFrequencyDrift: 0.6 * LEGACY_SECONDS_PER_TICK,
  regimeSpeed: 0.12 * LEGACY_SECONDS_PER_TICK,
  regimeSeed: 19,
};

export function noiseAt(tick: number, settings: WaveSettings, parameters = effectiveParametersAt(tick, settings)) {
  if (parameters.noiseAmplitude === 0) return 0;
  return parameters.noiseAmplitude * smoothNoise(tick * parameters.noiseFrequency, settings.noiseSeed);
}

export function effectiveParametersAt(tick: number, settings: WaveSettings): EffectiveParameters {
  const regimeTick = tick * settings.regimeSpeed;
  return {
    amplitude: clamp(
      settings.amplitude + settings.amplitudeDrift * smoothNoise(regimeTick + 11.3, settings.regimeSeed + 1),
      0,
      8,
    ),
    frequency: clamp(
      settings.frequency + settings.frequencyDrift * smoothNoise(regimeTick + 23.7, settings.regimeSeed + 2),
      0.01 * LEGACY_SECONDS_PER_TICK,
      1.2 * LEGACY_SECONDS_PER_TICK,
    ),
    slope: clamp(
      settings.slope + settings.slopeDrift * smoothNoise(regimeTick + 37.1, settings.regimeSeed + 3),
      -1 * LEGACY_SECONDS_PER_TICK,
      1 * LEGACY_SECONDS_PER_TICK,
    ),
    noiseAmplitude: clamp(
      settings.noiseAmplitude + settings.noiseAmplitudeDrift * smoothNoise(regimeTick + 41.9, settings.regimeSeed + 4),
      0,
      5,
    ),
    noiseFrequency: clamp(
      settings.noiseFrequency + settings.noiseFrequencyDrift * smoothNoise(regimeTick + 59.5, settings.regimeSeed + 5),
      0.05 * LEGACY_SECONDS_PER_TICK,
      6 * LEGACY_SECONDS_PER_TICK,
    ),
  };
}

function smoothNoise(x: number, seed: number) {
  const left = Math.floor(x);
  const fraction = x - left;
  const eased = fraction * fraction * (3 - 2 * fraction);
  return lerp(hashNoise(left, seed), hashNoise(left + 1, seed), eased) * 2 - 1;
}

function hashNoise(index: number, seed: number) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function lerp(left: number, right: number, amount: number) {
  return left + (right - left) * amount;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
