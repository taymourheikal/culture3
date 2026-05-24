import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS, LEGACY_SECONDS_PER_TICK } from "../../src/sine/marketSignal";
import { MARKET_SETTING_BOUNDS } from "../../src/sine/marketSettingBounds";
import { INITIAL_MARKET_RUNTIME_CONFIG, sameMarketRuntimeConfig, sanitizeMarketRuntimeConfig } from "../../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig } from "../../src/sine/spawnerSimulation";
import { SPAWNER_CONFIG_BOUNDS } from "../../src/sine/spawnerConfigBounds";
import { sanitizeSpawnerConfig } from "../../src/sine/spawnerSettingsStorage";
import { loadSavedMarketRuntimeConfig, sanitizeSettings } from "../../src/sine/settingsStorage";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import type { SineTest } from "./helpers";

function testMarketSettingsSanitizerClampsSavedValues() {
  const sanitized = sanitizeSettings({
    ...INITIAL_SETTINGS,
    amplitude: 999,
    frequency: -999,
    phase: Number.NaN,
    slope: -999,
    noiseAmplitude: 999,
    noiseFrequency: -999,
    regimeSpeed: -999,
  });

  assert.equal(sanitized.amplitude, MARKET_SETTING_BOUNDS.amplitude.max);
  assert.equal(sanitized.frequency, MARKET_SETTING_BOUNDS.frequency.min);
  assert.equal(sanitized.phase, INITIAL_SETTINGS.phase);
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
    uniquenessPopulationLimit: 12.7,
    initialHiddenUnitsMin: 9999,
    initialHiddenUnitsMax: -9999,
    thresholdBiasMin: 9999,
    thresholdBiasMax: -9999,
    initialMinHorizonTicksMin: 9999,
    initialMinHorizonTicksMax: -9999,
  });

  for (const key of Object.keys(SPAWNER_CONFIG_BOUNDS) as Array<keyof SpawnerConfig>) {
    const bounds = SPAWNER_CONFIG_BOUNDS[key];
    assert(sanitized[key] >= bounds.min, `${key} below minimum`);
    assert(sanitized[key] <= bounds.max, `${key} above maximum`);
  }

  assert.equal(sanitized.initialSpawners, SPAWNER_CONFIG_BOUNDS.initialSpawners.max);
  assert.equal(sanitized.maxSpawners, SPAWNER_CONFIG_BOUNDS.initialSpawners.max);
  assert.equal(sanitized.uniquenessPopulationLimit, 13);
  assert(sanitized.initialHiddenUnitsMax >= sanitized.initialHiddenUnitsMin + 1);
  assert(sanitized.thresholdBiasMax >= sanitized.thresholdBiasMin + 0.001);
  assert(sanitized.initialMinHorizonTicksMax >= sanitized.initialMinHorizonTicksMin + 0.01);
}

function testInitialSpawnersRaisePopulationCapWhenSaved() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 300,
    maxSpawners: 250,
  });

  assert.equal(sanitized.initialSpawners, 300);
  assert.equal(sanitized.maxSpawners, 300);
}

function testSpawnerConfigSanitizerDropsRemovedReproductionGates() {
  const removedResolvedKey = `reproduction${"MinResolved"}`;
  const removedPayoffKey = `reproduction${"MinAveragePayoff"}`;
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    [removedResolvedKey]: 99,
    [removedPayoffKey]: 2,
  } as Partial<SpawnerConfig> & Record<string, number>);

  assert.equal(removedResolvedKey in sanitized, false);
  assert.equal(removedPayoffKey in sanitized, false);
}

function testMarketRuntimeConfigWrapsBareGeneratedSettings() {
  const runtime = sanitizeMarketRuntimeConfig({
    ...INITIAL_SETTINGS,
    amplitude: 999,
    source: "btcusd_5m",
    playback: {
      rocLengthBars: 0,
      startDateTime: "2021-03-04T05:06",
      barsPerSecond: 999,
    },
  });

  assert.equal(runtime.source, "btcusd_5m");
  assert.equal(runtime.generated.amplitude, MARKET_SETTING_BOUNDS.amplitude.max);
  assert.equal(runtime.playback.rocLengthBars, 1);
  assert.equal(runtime.playback.startDateTime, "2021-03-04T05:06");
  assert.equal(runtime.playback.barsPerSecond, 240);
}

function testSimulationStateTreatsPlainSettingsAsTickNative() {
  const plain = createSimulationState(INITIAL_SETTINGS);
  const runtime = createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG);

  assert.equal(plain.timeline.settings.frequency, INITIAL_SETTINGS.frequency);
  assert.equal(plain.timeline.settings.slope, INITIAL_SETTINGS.slope);
  assert.equal(runtime.timeline.settings.frequency, INITIAL_SETTINGS.frequency);
  assert.equal(runtime.timeline.settings.slope, INITIAL_SETTINGS.slope);
}

function testMarketRuntimeComparatorCoversRuntimeFields() {
  const base = sanitizeMarketRuntimeConfig(INITIAL_MARKET_RUNTIME_CONFIG);

  assert.equal(sameMarketRuntimeConfig(base, { ...base }), true);
  assert.equal(sameMarketRuntimeConfig(base, { ...base, source: "btcusd_1m" }), false);
  assert.equal(sameMarketRuntimeConfig(base, { ...base, generated: { ...base.generated, amplitude: base.generated.amplitude + 0.25 } }), false);
  assert.equal(
    sameMarketRuntimeConfig(base, { ...base, playback: { ...base.playback, rocLengthBars: base.playback.rocLengthBars + 1 } }),
    false,
  );
  assert.equal(
    sameMarketRuntimeConfig(base, { ...base, playback: { ...base.playback, startDateTime: "2021-02-03T04:05" } }),
    false,
  );
}

function testLegacySavedMarketSettingsMigrateFromSeconds() {
  const previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const values = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  values.set(
    "roc-signal-lab.settings.v1",
    JSON.stringify({
      ...INITIAL_SETTINGS,
      frequency: 0.16,
      slope: 0.02,
      speed: LEGACY_SECONDS_PER_TICK,
    }),
  );

  try {
    const migrated = loadSavedMarketRuntimeConfig();
    assert.equal(migrated.generated.frequency, 0.16 * LEGACY_SECONDS_PER_TICK);
    assert.equal(migrated.generated.slope, 0.02 * LEGACY_SECONDS_PER_TICK);
    assert.equal(migrated.playback.generatedTicksPerSecond, 1 / LEGACY_SECONDS_PER_TICK);
  } finally {
    if (previousStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
  }
}

function testLegacySpawnerMetabolismAliasMigratesToEnergyDrain() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    energyDrainPerTick: undefined,
    metabolism: 0.123,
  } as Partial<SpawnerConfig> & Record<string, number | undefined>);

  assert.equal(sanitized.energyDrainPerTick, 0.123);
  assert.equal("metabolism" in sanitized, false);
}

export const tests: SineTest[] = [
  { name: "Market Settings Sanitizer Clamps Saved Values", run: testMarketSettingsSanitizerClampsSavedValues },
  { name: "Spawner Config Sanitizer Clamps And Normalizes Pairs", run: testSpawnerConfigSanitizerClampsAndNormalizesPairs },
  { name: "Initial Spawners Raise Population Cap When Saved", run: testInitialSpawnersRaisePopulationCapWhenSaved },
  { name: "Spawner Config Sanitizer Drops Removed Reproduction Gates", run: testSpawnerConfigSanitizerDropsRemovedReproductionGates },
  { name: "Market Runtime Config Wraps Bare Generated Settings", run: testMarketRuntimeConfigWrapsBareGeneratedSettings },
  { name: "Simulation State Treats Plain Settings As Tick Native", run: testSimulationStateTreatsPlainSettingsAsTickNative },
  { name: "Market Runtime Comparator Covers Runtime Fields", run: testMarketRuntimeComparatorCoversRuntimeFields },
  { name: "Legacy Saved Market Settings Migrate From Seconds", run: testLegacySavedMarketSettingsMigrateFromSeconds },
  { name: "Legacy Spawner Metabolism Alias Migrates To Energy Drain", run: testLegacySpawnerMetabolismAliasMigratesToEnergyDrain },
];
