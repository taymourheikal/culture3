import { LEGACY_SECONDS_PER_TICK, type WaveSettings } from "./marketSignal";
import { clampFinite } from "./numeric";

export type NumericBounds = {
  min: number;
  max: number;
  step: number;
};

export const MARKET_SETTING_BOUNDS: Record<keyof WaveSettings, NumericBounds> = {
  amplitude: { min: 0, max: 8, step: 0.05 },
  frequency: { min: 0.01 * LEGACY_SECONDS_PER_TICK, max: 1.2 * LEGACY_SECONDS_PER_TICK, step: 0.001 },
  phase: { min: -Math.PI, max: Math.PI, step: 0.01 },
  slope: { min: -1 * LEGACY_SECONDS_PER_TICK, max: 1 * LEGACY_SECONDS_PER_TICK, step: 0.001 },
  noiseAmplitude: { min: 0, max: 5, step: 0.05 },
  noiseFrequency: { min: 0.05 * LEGACY_SECONDS_PER_TICK, max: 6 * LEGACY_SECONDS_PER_TICK, step: 0.005 },
  noiseSeed: { min: 0, max: 100, step: 1 },
  amplitudeDrift: { min: 0, max: 6, step: 0.05 },
  frequencyDrift: { min: 0, max: 0.6 * LEGACY_SECONDS_PER_TICK, step: 0.001 },
  slopeDrift: { min: 0, max: 1 * LEGACY_SECONDS_PER_TICK, step: 0.001 },
  noiseAmplitudeDrift: { min: 0, max: 4, step: 0.05 },
  noiseFrequencyDrift: { min: 0, max: 4 * LEGACY_SECONDS_PER_TICK, step: 0.005 },
  regimeSpeed: { min: 0.01 * LEGACY_SECONDS_PER_TICK, max: 1.5 * LEGACY_SECONDS_PER_TICK, step: 0.001 },
  regimeSeed: { min: 0, max: 100, step: 1 },
};

export function clampToBounds(value: number, fallback: number, bounds: NumericBounds) {
  return clampFinite(value, fallback, bounds.min, bounds.max);
}
