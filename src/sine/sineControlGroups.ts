import type { WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS } from "./marketSettingBounds";
import { formatSlope } from "./charts/format";
import { SPAWNER_CONFIG_BOUNDS } from "./spawnerConfigBounds";
import type { SpawnerConfig } from "./spawnerSimulation";
import { getSpawnerHelp } from "./spawnerControlHelp";

export type ControlConfig = {
  key: keyof WaveSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  display: (settings: WaveSettings) => string;
};

export type ControlGroup = {
  key: string;
  title: string;
  controls: ControlConfig[];
};

export type SpawnerControlConfig = {
  key: keyof SpawnerConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  help?: string;
};

export type SpawnerControlGroup = {
  key: string;
  title: string;
  controls: SpawnerControlConfig[];
};

const MARKET_SIGNAL_CONTROLS: ControlConfig[] = [
  marketField("amplitude", "Amplitude", (settings) => `${settings.amplitude.toFixed(2)}%`),
  marketField("frequency", "Frequency", (settings) => `${settings.frequency.toFixed(3)} cyc/tick`),
  marketField("phase", "Phase", (settings) => `${settings.phase.toFixed(2)} rad`),
  marketField("slope", "Slope", (settings) => formatSlope(settings.slope)),
];

const NOISE_CONTROLS: ControlConfig[] = [
  marketField("noiseAmplitude", "Noise amplitude", (settings) => `${settings.noiseAmplitude.toFixed(2)}%`),
  marketField("noiseFrequency", "Noise roughness", (settings) => `${settings.noiseFrequency.toFixed(2)}x`),
  marketField("noiseSeed", "Noise seed", (settings) => String(settings.noiseSeed)),
];

const REGIME_CONTROLS: ControlConfig[] = [
  marketField("amplitudeDrift", "Amplitude drift", (settings) => `+/-${settings.amplitudeDrift.toFixed(2)}%`),
  marketField("frequencyDrift", "Frequency drift", (settings) => `+/-${settings.frequencyDrift.toFixed(3)} cyc/tick`),
  marketField("slopeDrift", "Slope drift", (settings) => `+/-${settings.slopeDrift.toFixed(3)}%/tick`),
  marketField("noiseAmplitudeDrift", "Noise amp drift", (settings) => `+/-${settings.noiseAmplitudeDrift.toFixed(2)}%`),
  marketField("noiseFrequencyDrift", "Noise rough drift", (settings) => `+/-${settings.noiseFrequencyDrift.toFixed(2)}x`),
  marketField("regimeSpeed", "Regime speed", (settings) => `${settings.regimeSpeed.toFixed(2)}x`),
  marketField("regimeSeed", "Regime seed", (settings) => String(settings.regimeSeed)),
];

export const CONTROL_GROUPS: ControlGroup[] = [
  { key: "market", title: "Market Signal", controls: MARKET_SIGNAL_CONTROLS },
  { key: "noise", title: "Smooth Noise", controls: NOISE_CONTROLS },
  { key: "regime", title: "Regime Drift", controls: REGIME_CONTROLS },
];

export const SPAWNER_CONTROL_GROUPS: SpawnerControlGroup[] = [
  {
    key: "population",
    title: "Population",
    controls: [
      spawnerField("Initial spawner agents", "initialSpawners", 1, 500, 1),
      spawnerField("Max population", "maxSpawners", 1, 1000, 1),
      spawnerField("Death energy", "deathEnergy", -100, 100, 0.5),
      spawnerField("Death health", "deathHealth", -50, 100, 1),
      spawnerField("Initial energy min", "initialEnergyMin", 0, 200, 0.5),
      spawnerField("Initial energy max", "initialEnergyMax", 0, 250, 0.5),
      spawnerField("Initial health", "initialHealth", 1, 300, 1),
      spawnerField("Initial cooldown max ticks", "initialCooldownMaxTicks", 0, 500, 1),
    ],
  },
  {
    key: "spawning",
    title: "Opportunity Spawning",
    controls: [
      spawnerField("Spawn threshold", "spawnThreshold", 0, 1.5, 0.01),
      spawnerField("Spawn cost", "spawnCost", 0, 20, 0.05),
      spawnerField("Min energy surplus", "minimumSpawnEnergySurplus", 0, 20, 0.05),
      spawnerField("Min signal strength", "minSignalStrength", 0, 1, 0.01),
      spawnerField("History ticks", "foodHistoryTicks", 1, 5000, 1),
    ],
  },
  {
    key: "perception",
    title: "Perception Defaults",
    controls: [
      spawnerField("Delta 1 from tick", "defaultDeltaLag1FromTicks", 0, 1000, 1),
      spawnerField("Delta 1 to tick", "defaultDeltaLag1ToTicks", 0, 1000, 1),
      spawnerField("Delta 2 from tick", "defaultDeltaLag2FromTicks", 0, 1000, 1),
      spawnerField("Delta 2 to tick", "defaultDeltaLag2ToTicks", 0, 1000, 1),
      spawnerField("Delta 3 from tick", "defaultDeltaLag3FromTicks", 0, 1000, 1),
      spawnerField("Delta 3 to tick", "defaultDeltaLag3ToTicks", 0, 1000, 1),
      spawnerField("Delta 4 from tick", "defaultDeltaLag4FromTicks", 0, 1000, 1),
      spawnerField("Delta 4 to tick", "defaultDeltaLag4ToTicks", 0, 1000, 1),
      spawnerField("Delta 5 from tick", "defaultDeltaLag5FromTicks", 0, 1000, 1),
      spawnerField("Delta 5 to tick", "defaultDeltaLag5ToTicks", 0, 1000, 1),
      spawnerField("Rolling window ticks", "defaultRollingWindowTicks", 0, 1000, 1),
      spawnerField("Local scale window ticks", "defaultLocalScaleWindowTicks", 0, 1000, 1),
      spawnerField("Local scale sample step", "defaultLocalScaleSampleStepTicks", 1, 1000, 1),
      spawnerField("Trend window ticks", "defaultTrendWindowTicks", 0, 1000, 1),
      spawnerField("Cycle window ticks", "defaultCycleWindowTicks", 0, 1000, 1),
      spawnerField("Roughness sensitivity", "defaultRoughnessSensitivity", 0, 1, 0.001),
      spawnerField("Pending density scale", "defaultPendingDensityScale", 1, 1000, 1),
      spawnerField("Founder randomization ticks", "founderPerceptionRandomizationTicks", 0, 1000, 1),
    ],
  },
  {
    key: "trade",
    title: "Trade / Reward",
    controls: [
      spawnerField("Transaction cost", "transactionCost", 0, 2, 0.001),
      spawnerField("Reward scale", "rewardScale", 0, 50, 0.1),
      spawnerField("Loss health scale", "lossHealthScale", 0, 50, 0.1),
      spawnerField("Win health gain scale", "healthGainScale", 0, 20, 0.1),
      spawnerField("World payoff window", "recentResolvedPayoffWindow", 1, 500, 1),
      spawnerField("Agent payoff window", "agentRecentPayoffWindow", 1, 200, 1),
    ],
  },
  {
    key: "analysis",
    title: "Analysis / Telemetry",
    controls: [
      spawnerField("Uniqueness population limit", "uniquenessPopulationLimit", 1, 1000, 1),
    ],
  },
  {
    key: "reproduction",
    title: "Reproduction",
    controls: [
      spawnerField("Reproduction energy", "reproductionEnergy", 0, 200, 0.5),
      spawnerField("Reproduction cost", "reproductionCost", 0, 100, 0.5),
      spawnerField("Initial reproduction bias", "initialReproductionOutputBias", -12, 2, 0.1),
    ],
  },
  {
    key: "architecture",
    title: "Initial Brain",
    controls: [
      spawnerField("Initial hidden units min", "initialHiddenUnitsMin", 1, 256, 1),
      spawnerField("Initial hidden units max", "initialHiddenUnitsMax", 1, 512, 1),
      spawnerField("Input connections per unit", "initialInputConnectionsPerUnit", 0, 64, 1),
      spawnerField("Recurrent connections per unit", "initialRecurrentConnectionsPerUnit", 0, 64, 1),
      spawnerField("Output connections per output", "initialOutputConnectionsPerOutput", 0, 128, 1),
      spawnerField("New unit initial connections", "newUnitInitialConnections", 0, 128, 1),
      spawnerField("Gate bias stddev", "gateBiasStdDev", 0, 2, 0.01),
      spawnerField("Output bias stddev", "outputBiasStdDev", 0, 2, 0.01),
    ],
  },
  {
    key: "topology",
    title: "Topology Mutation",
    controls: [
      spawnerField("Add unit rate", "addUnitRate", 0, 1, 0.001),
      spawnerField("Disable unit rate", "disableUnitRate", 0, 1, 0.001),
      spawnerField("Re-enable unit rate", "reenableUnitRate", 0, 1, 0.001),
      spawnerField("Add connection rate", "addConnectionRate", 0, 1, 0.001),
      spawnerField("Disable connection rate", "disableConnectionRate", 0, 1, 0.001),
      spawnerField("Re-enable connection rate", "reenableConnectionRate", 0, 1, 0.001),
      spawnerField("Existing layer chance", "newUnitExistingLayerChance", 0, 1, 0.001),
      spawnerField("New layer chance", "newUnitNewLayerChance", 0, 1, 0.001),
      spawnerField("Allow skip connections", "allowSkipConnections", 0, 1, 1),
      spawnerField("Allow input-output links", "allowInputToOutputConnections", 0, 1, 1),
    ],
  },
  {
    key: "outputs",
    title: "Decision Outputs",
    controls: [
      spawnerField("Cooldown output multiplier ticks", "cooldownOutputMultiplierTicks", 0, 500, 1),
      spawnerField("Threshold bias init stddev", "thresholdBiasInitialStdDev", 0, 1, 0.001),
    ],
  },
  {
    key: "mutation",
    title: "Mutation",
    controls: [
      spawnerField("Weight mutation rate", "weightMutationRate", 0, 1, 0.001),
      spawnerField("Weight mutation stddev", "weightMutationStdDev", 0, 2, 0.001),
      spawnerField("Weight replace rate", "weightReplaceRate", 0, 1, 0.001),
      spawnerField("New connection stddev", "newConnectionWeightStdDev", 0, 2, 0.001),
      spawnerField("Bias mutation rate", "biasMutationRate", 0, 1, 0.001),
      spawnerField("Bias mutation stddev", "biasMutationStdDev", 0, 2, 0.001),
      spawnerField("Threshold bias mutation", "thresholdBiasMutationStdDev", 0, 1, 0.001),
      spawnerField("Threshold bias min", "thresholdBiasMin", -2, 2, 0.01),
      spawnerField("Threshold bias max", "thresholdBiasMax", -2, 2, 0.01),
      spawnerField("Min horizon mutation ticks", "minHorizonTicksMutationStdDev", 0, 200, 0.1),
      spawnerField("Max horizon mutation ticks", "maxHorizonTicksMutationStdDev", 0, 200, 0.1),
      spawnerField("Cooldown mutation ticks", "cooldownBaseTicksMutationStdDev", 0, 200, 0.1),
      spawnerField("Perception mutation rate", "perceptionMutationRate", 0, 1, 0.001),
      spawnerField("Perception lag mutation", "perceptionLagMutationStdDev", 0, 1000, 0.1),
      spawnerField("Perception window mutation", "perceptionWindowMutationStdDev", 0, 1000, 0.1),
      spawnerField("Roughness sensitivity mutation", "perceptionSensitivityMutationStdDev", 0, 1, 0.0001),
      spawnerField("Pending density scale mutation", "perceptionDensityScaleMutationStdDev", 0, 1000, 0.1),
      spawnerField("Mutation-profile drift", "mutationProfileMutationStdDev", 0, 1, 0.001),
    ],
  },
  {
    key: "complexity",
    title: "Energy Drain / Complexity Cost",
    controls: [
      spawnerField("Base energy drain per tick", "energyDrainPerTick", 0, 5, 0.001),
      spawnerField("Cost per active unit", "brainEnergyCostPerActiveUnit", 0, 1, 0.0001),
      spawnerField("Cost per active connection", "brainEnergyCostPerActiveConnection", 0, 1, 0.0001),
      spawnerField("Cost per active layer", "brainEnergyCostPerActiveLayer", 0, 1, 0.0001),
    ],
  },
  {
    key: "horizon",
    title: "Horizon / Cooldown Ranges",
    controls: [
      spawnerField("Initial min horizon min ticks", "initialMinHorizonTicksMin", 0, 2000, 1),
      spawnerField("Initial min horizon max ticks", "initialMinHorizonTicksMax", 0, 2000, 1),
      spawnerField("Initial max horizon min ticks", "initialMaxHorizonTicksMin", 0, 3000, 1),
      spawnerField("Initial max horizon max ticks", "initialMaxHorizonTicksMax", 0, 3000, 1),
      spawnerField("Min horizon clamp min ticks", "minHorizonTicksClampMin", 0, 2000, 1),
      spawnerField("Min horizon clamp max ticks", "minHorizonTicksClampMax", 0, 2000, 1),
      spawnerField("Max horizon clamp min ticks", "maxHorizonTicksClampMin", 0, 3000, 1),
      spawnerField("Max horizon clamp max ticks", "maxHorizonTicksClampMax", 0, 3000, 1),
      spawnerField("Cooldown initial min ticks", "cooldownBaseTicksInitialMin", 0, 2000, 1),
      spawnerField("Cooldown initial max ticks", "cooldownBaseTicksInitialMax", 0, 2000, 1),
      spawnerField("Cooldown clamp min ticks", "cooldownBaseTicksClampMin", 0, 2000, 1),
      spawnerField("Cooldown clamp max ticks", "cooldownBaseTicksClampMax", 0, 2000, 1),
    ],
  },
];

function marketField(key: keyof WaveSettings, label: string, display: (settings: WaveSettings) => string): ControlConfig {
  return { key, label, ...MARKET_SETTING_BOUNDS[key], display };
}

function spawnerField(label: string, key: keyof SpawnerConfig, min: number, max: number, step: number): SpawnerControlConfig {
  const bounds = SPAWNER_CONFIG_BOUNDS[key] ?? { min, max, step };
  return { label, key, min: bounds.min, max: bounds.max, step: bounds.step, help: getSpawnerHelp(key) };
}
