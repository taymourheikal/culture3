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
      spawnerField("Initial spawner agents", "initialSpawners"),
      spawnerField("Max population", "maxSpawners"),
      spawnerField("Death energy", "deathEnergy"),
      spawnerField("Death health", "deathHealth"),
      spawnerField("Initial energy min", "initialEnergyMin"),
      spawnerField("Initial energy max", "initialEnergyMax"),
      spawnerField("Initial health", "initialHealth"),
      spawnerField("Initial cooldown max ticks", "initialCooldownMaxTicks"),
    ],
  },
  {
    key: "spawning",
    title: "Opportunity Spawning",
    controls: [
      spawnerField("Spawn cost", "spawnCost"),
      spawnerField("Min energy surplus", "minimumSpawnEnergySurplus"),
      spawnerField("History ticks", "foodHistoryTicks"),
    ],
  },
  {
    key: "founderDefaults",
    title: "Founder Defaults",
    controls: [
      spawnerField("Default spawn threshold", "defaultSpawnThreshold"),
      spawnerField("Default min signal strength", "defaultMinSignalStrength"),
    ],
  },
  {
    key: "perception",
    title: "Perception Defaults",
    controls: [
      spawnerField("Delta 1 from tick", "defaultDeltaLag1FromTicks"),
      spawnerField("Delta 1 to tick", "defaultDeltaLag1ToTicks"),
      spawnerField("Delta 2 from tick", "defaultDeltaLag2FromTicks"),
      spawnerField("Delta 2 to tick", "defaultDeltaLag2ToTicks"),
      spawnerField("Delta 3 from tick", "defaultDeltaLag3FromTicks"),
      spawnerField("Delta 3 to tick", "defaultDeltaLag3ToTicks"),
      spawnerField("Delta 4 from tick", "defaultDeltaLag4FromTicks"),
      spawnerField("Delta 4 to tick", "defaultDeltaLag4ToTicks"),
      spawnerField("Delta 5 from tick", "defaultDeltaLag5FromTicks"),
      spawnerField("Delta 5 to tick", "defaultDeltaLag5ToTicks"),
      spawnerField("Rolling window ticks", "defaultRollingWindowTicks"),
      spawnerField("Local scale window ticks", "defaultLocalScaleWindowTicks"),
      spawnerField("Local scale sample step", "defaultLocalScaleSampleStepTicks"),
      spawnerField("Volume scale window ticks", "defaultVolumeScaleWindowTicks"),
      spawnerField("Volume scale sample step", "defaultVolumeScaleSampleStepTicks"),
      spawnerField("Volume delta lag ticks", "defaultVolumeDeltaLagTicks"),
      spawnerField("Volume acceleration lag ticks", "defaultVolumeAccelerationLagTicks"),
      spawnerField("RSI window ticks", "defaultRsiWindowTicks"),
      spawnerField("Volume-price agreement lag", "defaultVolumePriceAgreementLagTicks"),
      spawnerField("Trend window ticks", "defaultTrendWindowTicks"),
      spawnerField("Cycle window ticks", "defaultCycleWindowTicks"),
      spawnerField("Roughness sensitivity", "defaultRoughnessSensitivity"),
      spawnerField("Pending density scale", "defaultPendingDensityScale"),
      spawnerField("Founder randomization ticks", "founderPerceptionRandomizationTicks"),
    ],
  },
  {
    key: "trade",
    title: "Trade / Reward",
    controls: [
      spawnerField("Transaction cost", "transactionCost"),
      spawnerField("Payoff scale window", "defaultPayoffScaleWindowTicks"),
      spawnerField("Payoff scale sample step", "defaultPayoffScaleSampleStepTicks"),
      spawnerField("Reward scale", "rewardScale"),
      spawnerField("Loss health scale", "lossHealthScale"),
      spawnerField("Win health gain scale", "healthGainScale"),
      spawnerField("World payoff window", "recentResolvedPayoffWindow"),
      spawnerField("Agent payoff window", "agentRecentPayoffWindow"),
    ],
  },
  {
    key: "analysis",
    title: "Analysis / Telemetry",
    controls: [
      spawnerField("Uniqueness population limit", "uniquenessPopulationLimit"),
    ],
  },
  {
    key: "learning",
    title: "Learning / Plasticity",
    controls: [
      spawnerField("Weight learning rate", "plasticityWeightLearningRate"),
      spawnerField("Bias learning rate", "plasticityBiasLearningRate"),
      spawnerField("Positive reward multiplier", "plasticityPositiveRewardMultiplier"),
      spawnerField("Negative reward multiplier", "plasticityNegativeRewardMultiplier"),
      spawnerField("Reproduction reward", "plasticityReproductionRewardStrength"),
      spawnerField("Experience decay", "plasticityExperienceDecayRate"),
      spawnerField("Max learned delta", "plasticityMaxLearnedDelta"),
      spawnerField("Eligibility trace strength", "plasticityEligibilityTraceStrength"),
      spawnerField("Plasticity drift", "plasticityMutationStdDev"),
    ],
  },
  {
    key: "reproduction",
    title: "Reproduction",
    controls: [
      spawnerField("Reproduction energy", "reproductionEnergy"),
      spawnerField("Reproduction cost", "reproductionCost"),
      spawnerField("Cost min multiplier", "reproductionCostMinMultiplier"),
      spawnerField("Cost max multiplier", "reproductionCostMaxMultiplier"),
      spawnerField("Cost pressure curve", "reproductionCostPressureCurve"),
      spawnerField("Initial reproduction bias", "initialReproductionOutputBias"),
    ],
  },
  {
    key: "architecture",
    title: "Initial Brain",
    controls: [
      spawnerField("Initial hidden units min", "initialHiddenUnitsMin"),
      spawnerField("Initial hidden units max", "initialHiddenUnitsMax"),
      spawnerField("Input connections per unit", "initialInputConnectionsPerUnit"),
      spawnerField("Recurrent connections per unit", "initialRecurrentConnectionsPerUnit"),
      spawnerField("Output connections per output", "initialOutputConnectionsPerOutput"),
      spawnerField("New unit initial connections", "newUnitInitialConnections"),
      spawnerField("Gate bias stddev", "gateBiasStdDev"),
      spawnerField("Output bias stddev", "outputBiasStdDev"),
    ],
  },
  {
    key: "topology",
    title: "Topology Mutation",
    controls: [
      spawnerField("Add unit rate", "addUnitRate"),
      spawnerField("Disable unit rate", "disableUnitRate"),
      spawnerField("Re-enable unit rate", "reenableUnitRate"),
      spawnerField("Add connection rate", "addConnectionRate"),
      spawnerField("Disable connection rate", "disableConnectionRate"),
      spawnerField("Re-enable connection rate", "reenableConnectionRate"),
      spawnerField("Existing layer chance", "newUnitExistingLayerChance"),
      spawnerField("New layer chance", "newUnitNewLayerChance"),
      spawnerField("Allow skip connections", "allowSkipConnections"),
      spawnerField("Allow input-output links", "allowInputToOutputConnections"),
    ],
  },
  {
    key: "outputs",
    title: "Decision Outputs",
    controls: [
      spawnerField("Cooldown output multiplier ticks", "cooldownOutputMultiplierTicks"),
      spawnerField("Threshold bias init stddev", "thresholdBiasInitialStdDev"),
    ],
  },
  {
    key: "mutation",
    title: "Mutation",
    controls: [
      spawnerField("Weight mutation rate", "weightMutationRate"),
      spawnerField("Weight mutation stddev", "weightMutationStdDev"),
      spawnerField("Weight replace rate", "weightReplaceRate"),
      spawnerField("New connection stddev", "newConnectionWeightStdDev"),
      spawnerField("Bias mutation rate", "biasMutationRate"),
      spawnerField("Bias mutation stddev", "biasMutationStdDev"),
      spawnerField("Threshold bias mutation", "thresholdBiasMutationStdDev"),
      spawnerField("Threshold bias min", "thresholdBiasMin"),
      spawnerField("Threshold bias max", "thresholdBiasMax"),
      spawnerField("Min horizon mutation ticks", "minHorizonTicksMutationStdDev"),
      spawnerField("Max horizon mutation ticks", "maxHorizonTicksMutationStdDev"),
      spawnerField("Cooldown mutation ticks", "cooldownBaseTicksMutationStdDev"),
      spawnerField("Perception mutation rate", "perceptionMutationRate"),
      spawnerField("Perception lag mutation", "perceptionLagMutationStdDev"),
      spawnerField("Perception window mutation", "perceptionWindowMutationStdDev"),
      spawnerField("Roughness sensitivity mutation", "perceptionSensitivityMutationStdDev"),
      spawnerField("Pending density scale mutation", "perceptionDensityScaleMutationStdDev"),
      spawnerField("Payoff scale mutation rate", "payoffScaleMutationRate"),
      spawnerField("Payoff window mutation", "payoffScaleWindowMutationStdDev"),
      spawnerField("Payoff sample step mutation", "payoffScaleSampleStepMutationStdDev"),
      spawnerField("Trading policy mutation rate", "tradingPolicyMutationRate"),
      spawnerField("Spawn threshold mutation", "spawnThresholdMutationStdDev"),
      spawnerField("Min strength mutation", "minSignalStrengthMutationStdDev"),
      spawnerField("Mutation-profile drift", "mutationProfileMutationStdDev"),
    ],
  },
  {
    key: "complexity",
    title: "Energy Drain / Complexity Cost",
    controls: [
      spawnerField("Base energy drain per tick", "energyDrainPerTick"),
      spawnerField("Cost per active unit", "brainEnergyCostPerActiveUnit"),
      spawnerField("Cost per active connection", "brainEnergyCostPerActiveConnection"),
      spawnerField("Cost per active layer", "brainEnergyCostPerActiveLayer"),
    ],
  },
  {
    key: "horizon",
    title: "Horizon / Cooldown Ranges",
    controls: [
      spawnerField("Initial min horizon min ticks", "initialMinHorizonTicksMin"),
      spawnerField("Initial min horizon max ticks", "initialMinHorizonTicksMax"),
      spawnerField("Initial max horizon min ticks", "initialMaxHorizonTicksMin"),
      spawnerField("Initial max horizon max ticks", "initialMaxHorizonTicksMax"),
      spawnerField("Min horizon clamp min ticks", "minHorizonTicksClampMin"),
      spawnerField("Min horizon clamp max ticks", "minHorizonTicksClampMax"),
      spawnerField("Max horizon clamp min ticks", "maxHorizonTicksClampMin"),
      spawnerField("Max horizon clamp max ticks", "maxHorizonTicksClampMax"),
      spawnerField("Cooldown initial min ticks", "cooldownBaseTicksInitialMin"),
      spawnerField("Cooldown initial max ticks", "cooldownBaseTicksInitialMax"),
      spawnerField("Cooldown clamp min ticks", "cooldownBaseTicksClampMin"),
      spawnerField("Cooldown clamp max ticks", "cooldownBaseTicksClampMax"),
    ],
  },
];

function marketField(key: keyof WaveSettings, label: string, display: (settings: WaveSettings) => string): ControlConfig {
  return { key, label, ...MARKET_SETTING_BOUNDS[key], display };
}

function spawnerField(label: string, key: keyof SpawnerConfig): SpawnerControlConfig {
  const bounds = SPAWNER_CONFIG_BOUNDS[key];
  return { label, key, min: bounds.min, max: bounds.max, step: bounds.step, help: getSpawnerHelp(key) };
}
