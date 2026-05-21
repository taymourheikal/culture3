import type { WaveSettings } from "./marketSignal";

export type NumericBounds = {
  min: number;
  max: number;
  step: number;
};

export const MARKET_SETTING_BOUNDS: Record<keyof WaveSettings, NumericBounds> = {
  amplitude: { min: 0, max: 8, step: 0.05 },
  frequency: { min: 0.01, max: 1.2, step: 0.01 },
  phase: { min: -Math.PI, max: Math.PI, step: 0.01 },
  speed: { min: 0.05, max: 8, step: 0.05 },
  slope: { min: -1, max: 1, step: 0.01 },
  noiseAmplitude: { min: 0, max: 5, step: 0.05 },
  noiseFrequency: { min: 0.05, max: 6, step: 0.05 },
  noiseSeed: { min: 0, max: 100, step: 1 },
  amplitudeDrift: { min: 0, max: 6, step: 0.05 },
  frequencyDrift: { min: 0, max: 0.6, step: 0.005 },
  slopeDrift: { min: 0, max: 1, step: 0.01 },
  noiseAmplitudeDrift: { min: 0, max: 4, step: 0.05 },
  noiseFrequencyDrift: { min: 0, max: 4, step: 0.05 },
  regimeSpeed: { min: 0.01, max: 1.5, step: 0.01 },
  regimeSeed: { min: 0, max: 100, step: 1 },
};

export function clampToBounds(value: number, fallback: number, bounds: NumericBounds) {
  const finiteValue = Number.isFinite(value) ? value : fallback;
  return Math.min(bounds.max, Math.max(bounds.min, finiteValue));
}
