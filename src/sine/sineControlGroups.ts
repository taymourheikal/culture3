import type { WaveSettings } from "./marketSignal";
import { MARKET_SETTING_BOUNDS } from "./marketSettingBounds";
import { formatSlope } from "./charts/format";
import { SPAWNER_CONFIG_BOUNDS } from "./spawnerConfigBounds";
import type { SpawnerConfig } from "./spawnerSimulation";

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
  marketField("frequency", "Frequency", (settings) => `${settings.frequency.toFixed(2)} cyc/s`),
  marketField("phase", "Phase", (settings) => `${settings.phase.toFixed(2)} rad`),
  marketField("speed", "Speed", (settings) => `${settings.speed.toFixed(2)}x`),
  marketField("slope", "Slope", (settings) => formatSlope(settings.slope)),
];

const NOISE_CONTROLS: ControlConfig[] = [
  marketField("noiseAmplitude", "Noise amplitude", (settings) => `${settings.noiseAmplitude.toFixed(2)}%`),
  marketField("noiseFrequency", "Noise roughness", (settings) => `${settings.noiseFrequency.toFixed(2)}x`),
  marketField("noiseSeed", "Noise seed", (settings) => String(settings.noiseSeed)),
];

const REGIME_CONTROLS: ControlConfig[] = [
  marketField("amplitudeDrift", "Amplitude drift", (settings) => `+/-${settings.amplitudeDrift.toFixed(2)}%`),
  marketField("frequencyDrift", "Frequency drift", (settings) => `+/-${settings.frequencyDrift.toFixed(3)} cyc/s`),
  marketField("slopeDrift", "Slope drift", (settings) => `+/-${settings.slopeDrift.toFixed(2)}%/s`),
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
      spawnerField("Initial cooldown max", "initialCooldownMax", 0, 10, 0.05),
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
      spawnerField("Pending density divisor", "pendingDensityDivisor", 1, 1000, 1),
      spawnerField("History seconds", "foodHistorySeconds", 1, 600, 1),
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
    key: "reproduction",
    title: "Reproduction",
    controls: [
      spawnerField("Reproduction energy", "reproductionEnergy", 0, 200, 0.5),
      spawnerField("Reproduction cost", "reproductionCost", 0, 100, 0.5),
      spawnerField("Minimum resolved trades", "reproductionMinResolved", 0, 100, 1),
      spawnerField("Minimum average payoff", "reproductionMinAveragePayoff", -5, 5, 0.001),
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
      spawnerField("Cooldown output multiplier", "cooldownOutputMultiplier", 0, 10, 0.05),
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
      spawnerField("Base mutation stddev", "baseMutationStdDev", 0, 1, 0.001),
      spawnerField("Mutation stddev drift", "mutationStdDevMutationStdDev", 0, 1, 0.001),
      spawnerField("Mutation stddev min", "mutationStdDevMin", 0, 1, 0.001),
      spawnerField("Mutation stddev max", "mutationStdDevMax", 0, 2, 0.001),
      spawnerField("Threshold bias mutation", "thresholdBiasMutationStdDev", 0, 1, 0.001),
      spawnerField("Threshold bias min", "thresholdBiasMin", -2, 2, 0.01),
      spawnerField("Threshold bias max", "thresholdBiasMax", -2, 2, 0.01),
      spawnerField("Min horizon mutation", "minHorizonMutationStdDev", 0, 5, 0.01),
      spawnerField("Max horizon mutation", "maxHorizonMutationStdDev", 0, 5, 0.01),
      spawnerField("Cooldown mutation", "cooldownBaseMutationStdDev", 0, 5, 0.01),
    ],
  },
  {
    key: "complexity",
    title: "Complexity Cost",
    controls: [
      spawnerField("Cost per active unit", "brainEnergyCostPerActiveUnit", 0, 1, 0.0001),
      spawnerField("Cost per active connection", "brainEnergyCostPerActiveConnection", 0, 1, 0.0001),
      spawnerField("Cost per active layer", "brainEnergyCostPerActiveLayer", 0, 1, 0.0001),
    ],
  },
  {
    key: "horizon",
    title: "Horizon / Cooldown Ranges",
    controls: [
      spawnerField("Initial min horizon min", "initialMinHorizonMin", 0, 20, 0.05),
      spawnerField("Initial min horizon max", "initialMinHorizonMax", 0, 20, 0.05),
      spawnerField("Initial max horizon min", "initialMaxHorizonMin", 0, 30, 0.05),
      spawnerField("Initial max horizon max", "initialMaxHorizonMax", 0, 30, 0.05),
      spawnerField("Min horizon clamp min", "minHorizonClampMin", 0, 20, 0.05),
      spawnerField("Min horizon clamp max", "minHorizonClampMax", 0, 20, 0.05),
      spawnerField("Max horizon clamp min", "maxHorizonClampMin", 0, 30, 0.05),
      spawnerField("Max horizon clamp max", "maxHorizonClampMax", 0, 30, 0.05),
      spawnerField("Cooldown initial min", "cooldownBaseInitialMin", 0, 20, 0.05),
      spawnerField("Cooldown initial max", "cooldownBaseInitialMax", 0, 20, 0.05),
      spawnerField("Cooldown clamp min", "cooldownBaseClampMin", 0, 20, 0.05),
      spawnerField("Cooldown clamp max", "cooldownBaseClampMax", 0, 20, 0.05),
    ],
  },
];

export function getSpawnerHelp(key: keyof SpawnerConfig): string | undefined {
  const help: Partial<Record<keyof SpawnerConfig, string>> = {
    initialSpawners: "How many food-spawner agents start a new world. More agents means more competing entry ideas from tick one.",
    maxSpawners: "Hard cap on living spawner agents. Reproduction stops at this cap, and new worlds start no higher than it.",
    deathEnergy: "Agents below this energy are removed. Higher values make starvation happen sooner.",
    deathHealth: "Agents at or below this health are removed. Higher values make bad trades more lethal.",
    initialEnergyMin: "Lowest starting energy for new founder agents.",
    initialEnergyMax: "Highest starting energy for new founder agents.",
    initialHealth: "Starting health, and the current healing cap, for spawner agents.",
    initialCooldownMax: "Maximum random starting wait before a founder can spawn its first opportunity.",
    spawnThreshold: "Long or short scores must reach this value before an agent creates an opportunity marker.",
    spawnCost: "Base energy paid whenever an agent creates an opportunity.",
    minimumSpawnEnergySurplus: "Extra energy above spawn cost required before an agent is allowed to act.",
    minSignalStrength: "Lower bound for opportunity strength. Higher values make every spawned trade larger.",
    pendingDensityDivisor: "Scales how crowded the market feels to the NN based on unresolved opportunities.",
    foodHistorySeconds: "How long resolved opportunity markers remain visible on the chart.",
    transactionCost: "Flat cost subtracted from every resolved opportunity payoff.",
    rewardScale: "Multiplier converting positive payoff into agent energy.",
    lossHealthScale: "Multiplier converting negative payoff into health damage.",
    healthGainScale: "Multiplier converting positive payoff into health recovery.",
    recentResolvedPayoffWindow: "Number of recent resolved opportunities used for the global rolling loss chart.",
    agentRecentPayoffWindow: "Number of recent payoffs kept per agent for reproduction eligibility.",
    reproductionEnergy: "Minimum energy required before an agent can clone itself.",
    reproductionCost: "Energy paid by the parent when it reproduces.",
    reproductionMinResolved: "Minimum recent resolved opportunities needed before reproduction is allowed.",
    reproductionMinAveragePayoff: "Minimum recent average payoff needed before reproduction is allowed.",
    initialHiddenUnitsMin: "Lowest number of active recurrent memory units founder agents can start with.",
    initialHiddenUnitsMax: "Highest number of active recurrent memory units founder agents can start with.",
    initialInputConnectionsPerUnit: "How many sparse input-to-gate links each founder memory unit starts with.",
    initialRecurrentConnectionsPerUnit: "How many previous-memory links each founder memory unit starts with.",
    initialOutputConnectionsPerOutput: "How many hidden-to-output links each founder output starts with.",
    newUnitInitialConnections: "How many legal links are attempted when mutation adds a new memory unit.",
    addUnitRate: "Chance a child gains one new recurrent memory unit at birth.",
    disableUnitRate: "Chance a child disables one active memory unit at birth.",
    reenableUnitRate: "Chance a child re-enables one disabled memory unit at birth.",
    addConnectionRate: "Chance a child gains one new legal sparse connection at birth.",
    disableConnectionRate: "Chance a child disables one active connection at birth.",
    reenableConnectionRate: "Chance a child re-enables one disabled connection at birth.",
    newUnitExistingLayerChance: "Relative chance that a new memory unit appears in an already active layer.",
    newUnitNewLayerChance: "Relative chance that a new memory unit appears one layer deeper than the current deepest layer.",
    allowSkipConnections: "When on, lower layers may connect directly to deeper non-adjacent layers.",
    allowInputToOutputConnections: "When on, raw inputs may connect directly to outputs without hidden memory.",
    weightMutationRate: "Chance each connection weight mutates when a child is born.",
    weightMutationStdDev: "Typical size of small inherited weight changes.",
    weightReplaceRate: "Chance a mutating weight is replaced with a fresh random value instead of nudged.",
    newConnectionWeightStdDev: "Initial random weight spread for newly created sparse connections.",
    biasMutationRate: "Chance each gate or output bias mutates when a child is born.",
    biasMutationStdDev: "Typical size of inherited bias changes.",
    gateBiasStdDev: "Initial random bias spread for candidate, update, and reset gates.",
    outputBiasStdDev: "Initial random bias spread for long, short, strength, horizon, and cooldown outputs.",
    brainEnergyCostPerActiveUnit: "Optional extra metabolism for each active memory unit. Default is zero.",
    brainEnergyCostPerActiveConnection: "Optional extra metabolism for each active connection. Default is zero.",
    brainEnergyCostPerActiveLayer: "Optional extra metabolism for each active layer. Default is zero.",
    cooldownOutputMultiplier: "Scales the NN cooldown output. Higher values make actions create longer waits.",
    thresholdBiasInitialStdDev: "Initial random spread for each agent's general tendency to spawn opportunities.",
    baseMutationStdDev: "Starting size of random genome changes inherited by children.",
    mutationStdDevMutationStdDev: "How much the mutation size itself can change during reproduction.",
    mutationStdDevMin: "Lower clamp on inherited mutation size.",
    mutationStdDevMax: "Upper clamp on inherited mutation size.",
    thresholdBiasMutationStdDev: "Mutation size for the agent's spawn tendency bias.",
    thresholdBiasMin: "Lower clamp on spawn tendency bias.",
    thresholdBiasMax: "Upper clamp on spawn tendency bias.",
    minHorizonMutationStdDev: "Mutation size for the shortest prediction horizon.",
    maxHorizonMutationStdDev: "Mutation size for the longest prediction horizon.",
    cooldownBaseMutationStdDev: "Mutation size for each agent's base cooldown.",
    initialMinHorizonMin: "Lower end of the founder range for the shortest resolution horizon.",
    initialMinHorizonMax: "Upper end of the founder range for the shortest resolution horizon.",
    initialMaxHorizonMin: "Lower end of the founder range for the longest resolution horizon.",
    initialMaxHorizonMax: "Upper end of the founder range for the longest resolution horizon.",
    minHorizonClampMin: "Lowest value mutation can assign to the shortest allowed resolution horizon.",
    minHorizonClampMax: "Highest value mutation can assign to the shortest allowed resolution horizon.",
    maxHorizonClampMin: "Lowest value mutation can assign to the longest allowed resolution horizon.",
    maxHorizonClampMax: "Highest value mutation can assign to the longest allowed resolution horizon.",
    cooldownBaseInitialMin: "Lower end of the founder range for inherited base cooldown.",
    cooldownBaseInitialMax: "Upper end of the founder range for inherited base cooldown.",
    cooldownBaseClampMin: "Lowest value mutation can assign to inherited base cooldown.",
    cooldownBaseClampMax: "Highest value mutation can assign to inherited base cooldown.",
  };
  return help[key];
}

function marketField(key: keyof WaveSettings, label: string, display: (settings: WaveSettings) => string): ControlConfig {
  return { key, label, ...MARKET_SETTING_BOUNDS[key], display };
}

function spawnerField(label: string, key: keyof SpawnerConfig, min: number, max: number, step: number): SpawnerControlConfig {
  const bounds = SPAWNER_CONFIG_BOUNDS[key] ?? { min, max, step };
  return { label, key, min: bounds.min, max: bounds.max, step: bounds.step, help: getSpawnerHelp(key) };
}
