import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS, LEGACY_SECONDS_PER_TICK } from "../../src/sine/marketSignal";
import { MARKET_SETTING_BOUNDS } from "../../src/sine/marketSettingBounds";
import { INITIAL_MARKET_RUNTIME_CONFIG, sameMarketRuntimeConfig, sanitizeMarketRuntimeConfig } from "../../src/sine/marketRuntimeConfig";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig } from "../../src/sine/spawnerSimulation";
import { SPAWNER_CONFIG_BOUNDS } from "../../src/sine/spawnerConfigBounds";
import { sanitizeSpawnerConfig } from "../../src/sine/spawnerSettingsStorage";
import { loadSavedMarketRuntimeConfig, sanitizeSettings, saveMarketSettingsGroup, savePlaybackSettingsGroup } from "../../src/sine/settingsStorage";
import {
  loadSavedRunsDefaults,
  saveRunsMarketSettingsGroup,
  saveRunsPlaybackSettingsGroup,
  saveRunsSpawnerConfigGroup,
} from "../../src/sine/runsSettingsStorage";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import { CONTROL_GROUPS, SPAWNER_CONTROL_GROUPS } from "../../src/sine/sineControlGroups";
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
    newUnitInitialConnections: -9999,
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
  assert.equal(sanitized.newUnitInitialConnections, SPAWNER_CONFIG_BOUNDS.newUnitInitialConnections.min);
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

function testMarketRuntimeComparatorCoversEveryGeneratedField() {
  const base = sanitizeMarketRuntimeConfig(INITIAL_MARKET_RUNTIME_CONFIG);
  for (const key of Object.keys(INITIAL_SETTINGS) as Array<keyof typeof INITIAL_SETTINGS>) {
    assert.equal(
      sameMarketRuntimeConfig(base, { ...base, generated: { ...base.generated, [key]: base.generated[key] + 0.01 } }),
      false,
      `generated comparator ignored ${key}`,
    );
  }
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

function testLegacySpawnerTradingPolicyAliasesMigrateToFounderDefaults() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    defaultSpawnThreshold: undefined,
    defaultMinSignalStrength: undefined,
    spawnThreshold: 0.72,
    minSignalStrength: 0.31,
  } as Partial<SpawnerConfig> & Record<string, number | undefined>);

  assert.equal(sanitized.defaultSpawnThreshold, 0.72);
  assert.equal(sanitized.defaultMinSignalStrength, 0.31);
  assert.equal("spawnThreshold" in sanitized, false);
  assert.equal("minSignalStrength" in sanitized, false);
}

function testNewTradingPolicyDefaultsWinOverLegacyAliases() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    defaultSpawnThreshold: 0.61,
    defaultMinSignalStrength: 0.17,
    spawnThreshold: 0.72,
    minSignalStrength: 0.31,
  } as Partial<SpawnerConfig> & Record<string, number | undefined>);

  assert.equal(sanitized.defaultSpawnThreshold, 0.61);
  assert.equal(sanitized.defaultMinSignalStrength, 0.17);
}

function testLegacySpawnerConfigMigratesAllTickAliases() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    tickSeconds: LEGACY_SECONDS_PER_TICK,
    foodHistoryTicks: undefined,
    initialCooldownMaxTicks: undefined,
    cooldownOutputMultiplierTicks: undefined,
    initialMinHorizonTicksMin: undefined,
    initialMinHorizonTicksMax: undefined,
    initialMaxHorizonTicksMin: undefined,
    initialMaxHorizonTicksMax: undefined,
    minHorizonTicksMutationStdDev: undefined,
    maxHorizonTicksMutationStdDev: undefined,
    minHorizonTicksClampMin: undefined,
    minHorizonTicksClampMax: undefined,
    maxHorizonTicksClampMin: undefined,
    maxHorizonTicksClampMax: undefined,
    cooldownBaseTicksInitialMin: undefined,
    cooldownBaseTicksInitialMax: undefined,
    cooldownBaseTicksMutationStdDev: undefined,
    cooldownBaseTicksClampMin: undefined,
    cooldownBaseTicksClampMax: undefined,
    foodHistorySeconds: 18,
    initialCooldownMax: 9,
    cooldownOutputMultiplier: 1.8,
    initialMinHorizonMin: 1.8,
    initialMinHorizonMax: 3.6,
    initialMaxHorizonMin: 5.4,
    initialMaxHorizonMax: 7.2,
    minHorizonMutationStdDev: 0.36,
    maxHorizonMutationStdDev: 0.54,
    minHorizonClampMin: 1.8,
    minHorizonClampMax: 9,
    maxHorizonClampMin: 10.8,
    maxHorizonClampMax: 18,
    cooldownBaseInitialMin: 1.8,
    cooldownBaseInitialMax: 3.6,
    cooldownBaseMutationStdDev: 0.72,
    cooldownBaseClampMin: 1.8,
    cooldownBaseClampMax: 9,
    brainEnergyCostPerActiveUnit: 0.01,
  } as Partial<SpawnerConfig> & Record<string, number | undefined>);

  assert.equal(sanitized.foodHistoryTicks, 100);
  assert.equal(sanitized.initialCooldownMaxTicks, 50);
  assert.equal(sanitized.cooldownOutputMultiplierTicks, 10);
  assert.equal(sanitized.initialMinHorizonTicksMin, 10);
  assert.equal(sanitized.initialMinHorizonTicksMax, 20);
  assert.equal(sanitized.initialMaxHorizonTicksMin, 30);
  assert.equal(sanitized.initialMaxHorizonTicksMax, 40);
  assert.equal(sanitized.minHorizonTicksMutationStdDev, 2);
  assert.equal(sanitized.maxHorizonTicksMutationStdDev, 0.54 / LEGACY_SECONDS_PER_TICK);
  assert.equal(sanitized.minHorizonTicksClampMin, 10);
  assert.equal(sanitized.minHorizonTicksClampMax, 50);
  assert.equal(sanitized.maxHorizonTicksClampMin, 60);
  assert.equal(sanitized.maxHorizonTicksClampMax, 100);
  assert.equal(sanitized.cooldownBaseTicksInitialMin, 10);
  assert.equal(sanitized.cooldownBaseTicksInitialMax, 20);
  assert.equal(sanitized.cooldownBaseTicksMutationStdDev, 4);
  assert.equal(sanitized.cooldownBaseTicksClampMin, 10);
  assert.equal(sanitized.cooldownBaseTicksClampMax, 50);
  assert.equal(sanitized.brainEnergyCostPerActiveUnit, 0.01 * LEGACY_SECONDS_PER_TICK);
}

function testSpawnerBoundedPairsNormalizeExactly() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    initialEnergyMin: 999,
    initialEnergyMax: -999,
    cooldownBaseTicksClampMin: 999,
    cooldownBaseTicksClampMax: -999,
    thresholdBiasMin: 999,
    thresholdBiasMax: -999,
  });

  assert.equal(sanitized.initialEnergyMin, 200);
  assert.equal(sanitized.initialEnergyMax, 200.1);
  assert.equal(sanitized.cooldownBaseTicksClampMin, 499);
  assert.equal(sanitized.cooldownBaseTicksClampMax, 500);
  assert.equal(sanitized.thresholdBiasMin, 1.999);
  assert.equal(sanitized.thresholdBiasMax, 2);
}

function testControlMetadataCoversAllSettingsWithoutDuplicates() {
  const marketKeys = CONTROL_GROUPS.flatMap((group) => group.controls.map((control) => control.key));
  const spawnerKeys = SPAWNER_CONTROL_GROUPS.flatMap((group) => group.controls.map((control) => control.key));

  assert.deepEqual([...marketKeys].sort(), (Object.keys(MARKET_SETTING_BOUNDS) as Array<keyof typeof MARKET_SETTING_BOUNDS>).sort());
  assert.equal(new Set(marketKeys).size, marketKeys.length);
  assert.equal(new Set(spawnerKeys).size, spawnerKeys.length);

  for (const control of CONTROL_GROUPS.flatMap((group) => group.controls)) {
    assert.deepEqual(
      { min: control.min, max: control.max, step: control.step },
      MARKET_SETTING_BOUNDS[control.key],
      `market control bounds drifted for ${control.key}`,
    );
    assert.equal(typeof control.display(INITIAL_SETTINGS), "string");
  }

  for (const control of SPAWNER_CONTROL_GROUPS.flatMap((group) => group.controls)) {
    const bounds = SPAWNER_CONFIG_BOUNDS[control.key];
    assert(bounds, `missing spawner bounds for ${control.key}`);
    assert.deepEqual(
      { min: control.min, max: control.max, step: control.step },
      { min: bounds.min, max: bounds.max, step: bounds.step },
      `spawner control bounds drifted for ${control.key}`,
    );
    const help = control.help;
    assert.ok(typeof help === "string", `missing help for ${control.key}`);
    assert.ok(help.length > 0, `empty help for ${control.key}`);
  }
}

function testControlMetadataGoldenOrder() {
  assert.deepEqual(
    CONTROL_GROUPS.map((group) => ({
      key: group.key,
      title: group.title,
      controls: group.controls.map((control) => `${control.key}:${control.label}:${control.min}:${control.max}:${control.step}:${control.display(INITIAL_SETTINGS)}`),
    })),
    [
      {
        key: "market",
        title: "Market Signal",
        controls: [
          "amplitude:Amplitude:0:8:0.05:1.20%",
          "frequency:Frequency:0.0018:0.216:0.001:0.029 cyc/tick",
          "phase:Phase:-3.141592653589793:3.141592653589793:0.01:0.00 rad",
          "slope:Slope:-0.18:0.18:0.001:+0.004%/tick",
        ],
      },
      {
        key: "noise",
        title: "Smooth Noise",
        controls: ["noiseAmplitude:Noise amplitude:0:5:0.05:0.35%", "noiseFrequency:Noise roughness:0.009:1.08:0.005:0.27x", "noiseSeed:Noise seed:0:100:1:7"],
      },
      {
        key: "regime",
        title: "Regime Drift",
        controls: [
          "amplitudeDrift:Amplitude drift:0:6:0.05:+/-0.90%",
          "frequencyDrift:Frequency drift:0:0.108:0.001:+/-0.007 cyc/tick",
          "slopeDrift:Slope drift:0:0.18:0.001:+/-0.014%/tick",
          "noiseAmplitudeDrift:Noise amp drift:0:4:0.05:+/-0.45%",
          "noiseFrequencyDrift:Noise rough drift:0:0.72:0.005:+/-0.11x",
          "regimeSpeed:Regime speed:0.0018:0.27:0.001:0.02x",
          "regimeSeed:Regime seed:0:100:1:19",
        ],
      },
    ],
  );

  assert.deepEqual(
    SPAWNER_CONTROL_GROUPS.map((group) => ({
      key: group.key,
      title: group.title,
      controls: group.controls.map((control) => control.key),
    })),
    [
      { key: "population", title: "Population", controls: ["initialSpawners", "maxSpawners", "deathEnergy", "deathHealth", "initialEnergyMin", "initialEnergyMax", "initialHealth", "initialCooldownMaxTicks"] },
      {
        key: "spawning",
        title: "Opportunity Spawning",
        controls: ["spawnCost", "minimumSpawnEnergySurplus", "foodHistoryTicks"],
      },
      {
        key: "founderDefaults",
        title: "Founder Defaults",
        controls: ["defaultSpawnThreshold", "defaultMinSignalStrength"],
      },
      {
        key: "perception",
        title: "Perception Defaults",
        controls: [
          "defaultDeltaLag1FromTicks",
          "defaultDeltaLag1ToTicks",
          "defaultDeltaLag2FromTicks",
          "defaultDeltaLag2ToTicks",
          "defaultDeltaLag3FromTicks",
          "defaultDeltaLag3ToTicks",
          "defaultDeltaLag4FromTicks",
          "defaultDeltaLag4ToTicks",
          "defaultDeltaLag5FromTicks",
          "defaultDeltaLag5ToTicks",
          "defaultRollingWindowTicks",
          "defaultLocalScaleWindowTicks",
          "defaultLocalScaleSampleStepTicks",
          "defaultVolumeScaleWindowTicks",
          "defaultVolumeScaleSampleStepTicks",
          "defaultVolumeDeltaLagTicks",
          "defaultVolumeAccelerationLagTicks",
          "defaultRsiWindowTicks",
          "defaultVolumePriceAgreementLagTicks",
          "defaultTrendWindowTicks",
          "defaultCycleWindowTicks",
          "defaultRoughnessSensitivity",
          "defaultPendingDensityScale",
          "founderPerceptionRandomizationTicks",
        ],
      },
      {
        key: "trade",
        title: "Trade / Reward",
        controls: [
          "transactionCost",
          "defaultPayoffScaleWindowTicks",
          "defaultPayoffScaleSampleStepTicks",
          "rewardScale",
          "lossHealthScale",
          "healthGainScale",
          "recentResolvedPayoffWindow",
          "agentRecentPayoffWindow",
        ],
      },
      { key: "analysis", title: "Analysis / Telemetry", controls: ["uniquenessPopulationLimit"] },
      {
        key: "learning",
        title: "Learning / Plasticity",
        controls: [
          "plasticityWeightLearningRate",
          "plasticityBiasLearningRate",
          "plasticityPositiveRewardMultiplier",
          "plasticityNegativeRewardMultiplier",
          "plasticityReproductionRewardStrength",
          "plasticityExperienceDecayRate",
          "plasticityMaxLearnedDelta",
          "plasticityEligibilityTraceStrength",
          "plasticityMutationStdDev",
        ],
      },
      {
        key: "reproduction",
        title: "Reproduction",
        controls: [
          "reproductionEnergy",
          "reproductionCost",
          "reproductionCostMinMultiplier",
          "reproductionCostMaxMultiplier",
          "reproductionCostPressureCurve",
          "initialReproductionOutputBias",
        ],
      },
      {
        key: "architecture",
        title: "Initial Brain",
        controls: [
          "initialHiddenUnitsMin",
          "initialHiddenUnitsMax",
          "initialInputConnectionsPerUnit",
          "initialRecurrentConnectionsPerUnit",
          "initialOutputConnectionsPerOutput",
          "newUnitInitialConnections",
          "gateBiasStdDev",
          "outputBiasStdDev",
        ],
      },
      {
        key: "topology",
        title: "Topology Mutation",
        controls: [
          "addUnitRate",
          "disableUnitRate",
          "reenableUnitRate",
          "addConnectionRate",
          "disableConnectionRate",
          "reenableConnectionRate",
          "newUnitExistingLayerChance",
          "newUnitNewLayerChance",
          "allowSkipConnections",
          "allowInputToOutputConnections",
        ],
      },
      { key: "outputs", title: "Decision Outputs", controls: ["cooldownOutputMultiplierTicks", "thresholdBiasInitialStdDev"] },
      {
        key: "mutation",
        title: "Mutation",
        controls: [
          "weightMutationRate",
          "weightMutationStdDev",
          "weightReplaceRate",
          "newConnectionWeightStdDev",
          "biasMutationRate",
          "biasMutationStdDev",
          "thresholdBiasMutationStdDev",
          "thresholdBiasMin",
          "thresholdBiasMax",
          "minHorizonTicksMutationStdDev",
          "maxHorizonTicksMutationStdDev",
          "cooldownBaseTicksMutationStdDev",
          "perceptionMutationRate",
          "perceptionLagMutationStdDev",
          "perceptionWindowMutationStdDev",
          "perceptionSensitivityMutationStdDev",
          "perceptionDensityScaleMutationStdDev",
          "payoffScaleMutationRate",
          "payoffScaleWindowMutationStdDev",
          "payoffScaleSampleStepMutationStdDev",
          "tradingPolicyMutationRate",
          "spawnThresholdMutationStdDev",
          "minSignalStrengthMutationStdDev",
          "mutationProfileMutationStdDev",
        ],
      },
      { key: "complexity", title: "Energy Drain / Complexity Cost", controls: ["energyDrainPerTick", "brainEnergyCostPerActiveUnit", "brainEnergyCostPerActiveConnection", "brainEnergyCostPerActiveLayer"] },
      {
        key: "horizon",
        title: "Horizon / Cooldown Ranges",
        controls: [
          "initialMinHorizonTicksMin",
          "initialMinHorizonTicksMax",
          "initialMaxHorizonTicksMin",
          "initialMaxHorizonTicksMax",
          "minHorizonTicksClampMin",
          "minHorizonTicksClampMax",
          "maxHorizonTicksClampMin",
          "maxHorizonTicksClampMax",
          "cooldownBaseTicksInitialMin",
          "cooldownBaseTicksInitialMax",
          "cooldownBaseTicksClampMin",
          "cooldownBaseTicksClampMax",
        ],
      },
    ],
  );
}

function testLabGroupedSettingsSavesPatchOnlyRequestedKeys() {
  withMockLocalStorage(() => {
    const savedMarket = saveMarketSettingsGroup(
      {
        ...INITIAL_SETTINGS,
        amplitude: 6.5,
        frequency: 0.123,
      },
      ["amplitude"],
    );
    const runtimeAfterMarket = loadSavedMarketRuntimeConfig();
    assert.equal(savedMarket.amplitude, 6.5);
    assert.equal(savedMarket.frequency, INITIAL_SETTINGS.frequency);
    assert.equal(runtimeAfterMarket.generated.amplitude, 6.5);
    assert.equal(runtimeAfterMarket.generated.frequency, INITIAL_SETTINGS.frequency);

    const savedPlayback = savePlaybackSettingsGroup(
      {
        ...runtimeAfterMarket.playback,
        generatedTicksPerSecond: 22,
        barsPerSecond: 33,
      },
      ["generatedTicksPerSecond"],
    );
    const runtimeAfterPlayback = loadSavedMarketRuntimeConfig();
    assert.equal(savedPlayback.playback.generatedTicksPerSecond, 22);
    assert.equal(savedPlayback.playback.barsPerSecond, runtimeAfterMarket.playback.barsPerSecond);
    assert.equal(runtimeAfterPlayback.generated.amplitude, 6.5);
    assert.equal(runtimeAfterPlayback.playback.generatedTicksPerSecond, 22);
    assert.equal(runtimeAfterPlayback.playback.barsPerSecond, runtimeAfterMarket.playback.barsPerSecond);
  });
}

function testRunsGroupedSettingsSavesPatchOnlyRequestedKeys() {
  withMockLocalStorage(() => {
    const initialRuns = loadSavedRunsDefaults();

    const savedMarket = saveRunsMarketSettingsGroup(
      {
        ...INITIAL_SETTINGS,
        amplitude: 13,
        frequency: 0.2,
      },
      ["frequency"],
    );
    const afterMarket = loadSavedRunsDefaults();
    assert.equal(savedMarket.frequency, 0.2);
    assert.equal(savedMarket.amplitude, initialRuns.marketConfig.generated.amplitude);
    assert.equal(afterMarket.marketConfig.generated.frequency, 0.2);
    assert.equal(afterMarket.marketConfig.generated.amplitude, initialRuns.marketConfig.generated.amplitude);
    assert.equal(afterMarket.ticks, initialRuns.ticks);

    const savedPlayback = saveRunsPlaybackSettingsGroup(
      {
        ...afterMarket.marketConfig.playback,
        generatedTicksPerSecond: 17,
        barsPerSecond: 29,
      },
      ["barsPerSecond"],
    );
    const afterPlayback = loadSavedRunsDefaults();
    assert.equal(savedPlayback.playback.barsPerSecond, 29);
    assert.equal(savedPlayback.playback.generatedTicksPerSecond, afterMarket.marketConfig.playback.generatedTicksPerSecond);
    assert.equal(afterPlayback.marketConfig.generated.frequency, 0.2);

    const savedSpawner = saveRunsSpawnerConfigGroup(
      {
        ...afterPlayback.spawnerConfig,
        initialSpawners: 77,
        maxSpawners: 88,
        reproductionEnergy: 99,
      },
      ["reproductionEnergy"],
    );
    const afterSpawner = loadSavedRunsDefaults();
    assert.equal(savedSpawner.reproductionEnergy, 99);
    assert.equal(savedSpawner.initialSpawners, afterPlayback.spawnerConfig.initialSpawners);
    assert.equal(savedSpawner.maxSpawners, afterPlayback.spawnerConfig.maxSpawners);
    assert.equal(afterSpawner.spawnerConfig.reproductionEnergy, 99);
    assert.equal(afterSpawner.marketConfig.playback.barsPerSecond, 29);
  });
}

function withMockLocalStorage(callback: () => void) {
  const previousStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const values = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  try {
    callback();
  } finally {
    if (previousStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousStorage;
  }
}

export const tests: SineTest[] = [
  { name: "Market Settings Sanitizer Clamps Saved Values", run: testMarketSettingsSanitizerClampsSavedValues },
  { name: "Spawner Config Sanitizer Clamps And Normalizes Pairs", run: testSpawnerConfigSanitizerClampsAndNormalizesPairs },
  { name: "Initial Spawners Raise Population Cap When Saved", run: testInitialSpawnersRaisePopulationCapWhenSaved },
  { name: "Spawner Config Sanitizer Drops Removed Reproduction Gates", run: testSpawnerConfigSanitizerDropsRemovedReproductionGates },
  { name: "Market Runtime Config Wraps Bare Generated Settings", run: testMarketRuntimeConfigWrapsBareGeneratedSettings },
  { name: "Simulation State Treats Plain Settings As Tick Native", run: testSimulationStateTreatsPlainSettingsAsTickNative },
  { name: "Market Runtime Comparator Covers Runtime Fields", run: testMarketRuntimeComparatorCoversRuntimeFields },
  { name: "Market Runtime Comparator Covers Every Generated Field", run: testMarketRuntimeComparatorCoversEveryGeneratedField },
  { name: "Legacy Saved Market Settings Migrate From Seconds", run: testLegacySavedMarketSettingsMigrateFromSeconds },
  { name: "Lab Grouped Settings Saves Patch Only Requested Keys", run: testLabGroupedSettingsSavesPatchOnlyRequestedKeys },
  { name: "Runs Grouped Settings Saves Patch Only Requested Keys", run: testRunsGroupedSettingsSavesPatchOnlyRequestedKeys },
  { name: "Legacy Spawner Metabolism Alias Migrates To Energy Drain", run: testLegacySpawnerMetabolismAliasMigratesToEnergyDrain },
  { name: "Legacy Spawner Trading Policy Aliases Migrate To Founder Defaults", run: testLegacySpawnerTradingPolicyAliasesMigrateToFounderDefaults },
  { name: "New Trading Policy Defaults Win Over Legacy Aliases", run: testNewTradingPolicyDefaultsWinOverLegacyAliases },
  { name: "Legacy Spawner Config Migrates All Tick Aliases", run: testLegacySpawnerConfigMigratesAllTickAliases },
  { name: "Spawner Bounded Pairs Normalize Exactly", run: testSpawnerBoundedPairsNormalizeExactly },
  { name: "Control Metadata Covers All Settings Without Duplicates", run: testControlMetadataCoversAllSettingsWithoutDuplicates },
  { name: "Control Metadata Golden Order", run: testControlMetadataGoldenOrder },
];
