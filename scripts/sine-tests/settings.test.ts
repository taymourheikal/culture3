import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { MARKET_SETTING_BOUNDS } from "../../src/sine/marketSettingBounds";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig } from "../../src/sine/spawnerSimulation";
import { SPAWNER_CONFIG_BOUNDS } from "../../src/sine/spawnerConfigBounds";
import { sanitizeSpawnerConfig } from "../../src/sine/spawnerSettingsStorage";
import { sanitizeSettings } from "../../src/sine/settingsStorage";
import type { SineTest } from "./helpers";

function testMarketSettingsSanitizerClampsSavedValues() {
  const sanitized = sanitizeSettings({
    ...INITIAL_SETTINGS,
    amplitude: 999,
    frequency: -999,
    phase: Number.NaN,
    speed: 999,
    slope: -999,
    noiseAmplitude: 999,
    noiseFrequency: -999,
    regimeSpeed: -999,
  });

  assert.equal(sanitized.amplitude, MARKET_SETTING_BOUNDS.amplitude.max);
  assert.equal(sanitized.frequency, MARKET_SETTING_BOUNDS.frequency.min);
  assert.equal(sanitized.phase, INITIAL_SETTINGS.phase);
  assert.equal(sanitized.speed, MARKET_SETTING_BOUNDS.speed.max);
  assert.equal(sanitized.slope, MARKET_SETTING_BOUNDS.slope.min);
  assert.equal(sanitized.noiseAmplitude, MARKET_SETTING_BOUNDS.noiseAmplitude.max);
  assert.equal(sanitized.noiseFrequency, MARKET_SETTING_BOUNDS.noiseFrequency.min);
  assert.equal(sanitized.regimeSpeed, MARKET_SETTING_BOUNDS.regimeSpeed.min);
}

function testSpawnerConfigSanitizerClampsAndNormalizesPairs() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 9999,
    maxSpawners: -9999,
    initialHiddenUnitsMin: 9999,
    initialHiddenUnitsMax: -9999,
    mutationStdDevMin: 9999,
    mutationStdDevMax: -9999,
    thresholdBiasMin: 9999,
    thresholdBiasMax: -9999,
    initialMinHorizonMin: 9999,
    initialMinHorizonMax: -9999,
  });

  for (const key of Object.keys(SPAWNER_CONFIG_BOUNDS) as Array<keyof SpawnerConfig>) {
    const bounds = SPAWNER_CONFIG_BOUNDS[key];
    assert(sanitized[key] >= bounds.min, `${key} below minimum`);
    assert(sanitized[key] <= bounds.max, `${key} above maximum`);
  }

  assert.equal(sanitized.initialSpawners, SPAWNER_CONFIG_BOUNDS.initialSpawners.max);
  assert.equal(sanitized.maxSpawners, SPAWNER_CONFIG_BOUNDS.maxSpawners.min);
  assert(sanitized.initialHiddenUnitsMax >= sanitized.initialHiddenUnitsMin + 1);
  assert(sanitized.mutationStdDevMax >= sanitized.mutationStdDevMin + 0.001);
  assert(sanitized.thresholdBiasMax >= sanitized.thresholdBiasMin + 0.001);
  assert(sanitized.initialMinHorizonMax >= sanitized.initialMinHorizonMin + 0.01);
}

export const tests: SineTest[] = [
  { name: "Market Settings Sanitizer Clamps Saved Values", run: testMarketSettingsSanitizerClampsSavedValues },
  { name: "Spawner Config Sanitizer Clamps And Normalizes Pairs", run: testSpawnerConfigSanitizerClampsAndNormalizesPairs },
];
