export type WaveSettings = {
  amplitude: number;
  frequency: number;
  phase: number;
  speed: number;
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
  time: number;
  phase: number;
  trend: number;
  signal: number;
  noise: number;
  parameters: EffectiveParameters;
  settings: WaveSettings;
};

export const BASE_ROC = 0;

export const INITIAL_SETTINGS: WaveSettings = {
  amplitude: 1.2,
  frequency: 0.16,
  phase: 0,
  speed: 1,
  slope: 0.02,
  noiseAmplitude: 0.35,
  noiseFrequency: 1.5,
  noiseSeed: 7,
  amplitudeDrift: 0.9,
  frequencyDrift: 0.04,
  slopeDrift: 0.08,
  noiseAmplitudeDrift: 0.45,
  noiseFrequencyDrift: 0.6,
  regimeSpeed: 0.12,
  regimeSeed: 19,
};

export function noiseAt(time: number, settings: WaveSettings, parameters = effectiveParametersAt(time, settings)) {
  if (parameters.noiseAmplitude === 0) return 0;
  return parameters.noiseAmplitude * smoothNoise(time * parameters.noiseFrequency, settings.noiseSeed);
}

export function effectiveParametersAt(time: number, settings: WaveSettings): EffectiveParameters {
  const regimeTime = time * settings.regimeSpeed;
  return {
    amplitude: clamp(
      settings.amplitude + settings.amplitudeDrift * smoothNoise(regimeTime + 11.3, settings.regimeSeed + 1),
      0,
      8,
    ),
    frequency: clamp(
      settings.frequency + settings.frequencyDrift * smoothNoise(regimeTime + 23.7, settings.regimeSeed + 2),
      0.01,
      1.2,
    ),
    slope: clamp(
      settings.slope + settings.slopeDrift * smoothNoise(regimeTime + 37.1, settings.regimeSeed + 3),
      -1,
      1,
    ),
    noiseAmplitude: clamp(
      settings.noiseAmplitude + settings.noiseAmplitudeDrift * smoothNoise(regimeTime + 41.9, settings.regimeSeed + 4),
      0,
      5,
    ),
    noiseFrequency: clamp(
      settings.noiseFrequency + settings.noiseFrequencyDrift * smoothNoise(regimeTime + 59.5, settings.regimeSeed + 5),
      0.05,
      6,
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
