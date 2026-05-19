import type { SimulationParameters } from "./types";

export const DEFAULT_SIMULATION_PARAMETERS: SimulationParameters = {
  world: {
    width: 2400,
    height: 1600,
    initialAgents: 72,
    minAgents: 18,
    maxAgents: 260,
    initialFood: 260,
    maxFood: 520,
    tickRate: 20,
    minReproductionAge: 5,
    reproductionCooldown: 2.5,
    maxAge: 145,
  },
  agents: {
    inputCount: 14,
    outputCount: 6,
    initialLineages: 3,
    families: [
      {
        hiddenCount: 12,
        secondLayerEnabled: false,
        secondHiddenCount: 8,
        activation: "tanh",
        initialWeightMean: 0,
        initialWeightStdDev: 0.75,
      },
      {
        hiddenCount: 10,
        secondLayerEnabled: false,
        secondHiddenCount: 8,
        activation: "tanh",
        initialWeightMean: 0,
        initialWeightStdDev: 0.75,
      },
      {
        hiddenCount: 14,
        secondLayerEnabled: false,
        secondHiddenCount: 10,
        activation: "tanh",
        initialWeightMean: 0,
        initialWeightStdDev: 0.75,
      },
    ],
  },
  initialGenome: {
    speed: { min: 0.65, max: 1.45 },
    attackPower: { min: 4, max: 13 },
    attackRange: { min: 18, max: 35 },
    metabolism: { min: 0.035, max: 0.075 },
    foodSensitivity: { min: 0.75, max: 1.45 },
    aggressionBias: { min: -0.2, max: 0.3 },
    reproductionThreshold: { min: 105, max: 145 },
    mutationRate: { min: 0.025, max: 0.08 },
  },
  mutation: {
    mutationRateStdDev: 0.004,
    mutationRateClamp: { min: 0.01, max: 0.14 },
    speedStdDev: 0.06,
    speedClamp: { min: 0.35, max: 2.2 },
    attackPowerStdDev: 0.8,
    attackPowerClamp: { min: 1, max: 24 },
    attackRangeStdDev: 1.8,
    attackRangeClamp: { min: 12, max: 55 },
    metabolismStdDev: 0.004,
    metabolismClamp: { min: 0.018, max: 0.13 },
    foodSensitivityStdDev: 0.06,
    foodSensitivityClamp: { min: 0.35, max: 2.1 },
    aggressionBiasStdDev: 0.05,
    aggressionBiasClamp: { min: -0.9, max: 1.2 },
    reproductionThresholdStdDev: 4,
    reproductionThresholdClamp: { min: 75, max: 180 },
    weightMutationChance: 0.35,
    weightClamp: { min: -3, max: 3 },
    summarySpeedThreshold: 0.04,
    summaryAttackPowerThreshold: 0.55,
    summaryAttackRangeThreshold: 1.2,
    summaryMetabolismThreshold: 0.004,
    summaryFoodSensitivityThreshold: 0.04,
    summaryAggressionThreshold: 0.035,
    summaryMaxLabels: 2,
  },
  food: {
    patchCount: 18,
    patchMargin: 120,
    patchRadius: { min: 95, max: 260 },
    patchRichness: { min: 0.45, max: 1.3 },
    foodEnergy: { min: 16, max: 32 },
    foodRadius: { min: 2.5, max: 5 },
    spawnProbabilityMin: 0.04,
    spawnProbabilityMax: 0.85,
    secondFoodChance: 0.2,
  },
  founder: {
    initialVelocity: { min: -0.4, max: 0.4 },
    initialEnergy: { min: 65, max: 115 },
    initialHealth: 100,
    radius: 6,
    reproductionCooldownOffset: { min: 1, max: 5 },
    attackCooldownOffset: { min: 0, max: 1.4 },
    initialRecentDamage: 0,
    initialKills: 0,
    initialChildren: 0,
  },
  sensing: {
    energyDivisor: 150,
    healthDivisor: 100,
    foodClosenessDistance: 350,
    agentClosenessDistance: 300,
    relativeEnergyDivisor: 150,
    crowdingRadius: 85,
    crowdingDivisor: 12,
    recentDamageDivisor: 35,
    childrenDivisor: 8,
  },
  movement: {
    restThreshold: 0.55,
    normalSpeedMultiplier: 2.15,
    lowEnergySpeedMultiplier: 1.1,
    lowEnergyThreshold: 12,
    velocityInertia: 0.58,
  },
  eating: {
    eatDistanceBonus: 4,
    baseBiteSize: 9,
    biteOutputMultiplier: 10,
    maxAgentEnergy: 220,
    foodDepletionThreshold: 0.5,
  },
  combat: {
    attackEnergyMinimum: 16,
    attackIntentThreshold: 0.42,
    damageMultiplier: { min: 0.75, max: 1.25 },
    flatAttackEnergyCost: 8,
    attackPowerCostMultiplier: 0.22,
    attackCooldown: 0.65,
    killEnergyReward: 34,
    maxAgentEnergy: 220,
  },
  metabolism: {
    movementCostMultiplier: 0.025,
    attackPostureCostMultiplier: 0.016,
    lowEnergyHealthThreshold: 12,
    lowEnergyHealthDamagePerTick: 0.18,
  },
  reproduction: {
    outputSuppressionThreshold: -0.1,
    surplusOverrideMultiplier: 1.25,
    childEnergyShare: { min: 0.42, max: 0.54 },
    childSpawnDistance: { min: 12, max: 26 },
    childVelocityInheritance: -0.15,
    childHealth: 100,
    childRadius: 5.5,
    childAttackCooldown: 0,
  },
  lineage: {
    hueStep: 137.508,
    saturation: 74,
    lightness: 58,
  },
  runtime: {
    initialSeed: 184203,
    rngOffset: 101,
    defaultSpeed: 4,
    speedMin: 0.5,
    speedMax: 12,
    speedStep: 0.5,
    maxFrameElapsed: 0.12,
    maxStepsPerFrame: 12,
    autosaveIntervalMs: 5000,
    statsRefreshMs: 250,
  },
};

export function cloneParameters(parameters: SimulationParameters = DEFAULT_SIMULATION_PARAMETERS): SimulationParameters {
  return structuredClone(parameters);
}

export function mergeParameters(base: SimulationParameters, override: Partial<SimulationParameters>) {
  return deepMerge(cloneParameters(base), override) as SimulationParameters;
}

export function sanitizeParameters(parameters: SimulationParameters): SimulationParameters {
  const next = mergeParameters(DEFAULT_SIMULATION_PARAMETERS, parameters);
  next.world.width = positive(next.world.width, DEFAULT_SIMULATION_PARAMETERS.world.width);
  next.world.height = positive(next.world.height, DEFAULT_SIMULATION_PARAMETERS.world.height);
  next.world.initialAgents = integer(next.world.initialAgents, 0);
  next.world.minAgents = integer(next.world.minAgents, 0);
  next.world.maxAgents = positiveInteger(next.world.maxAgents, 1);
  next.world.initialFood = integer(next.world.initialFood, 0);
  next.world.maxFood = integer(next.world.maxFood, 0);
  next.world.tickRate = positive(next.world.tickRate, DEFAULT_SIMULATION_PARAMETERS.world.tickRate);
  next.world.minReproductionAge = nonNegative(next.world.minReproductionAge);
  next.world.reproductionCooldown = nonNegative(next.world.reproductionCooldown);
  next.world.maxAge = positive(next.world.maxAge, DEFAULT_SIMULATION_PARAMETERS.world.maxAge);

  next.agents.inputCount = DEFAULT_SIMULATION_PARAMETERS.agents.inputCount;
  next.agents.outputCount = DEFAULT_SIMULATION_PARAMETERS.agents.outputCount;
  next.agents.initialLineages = positiveInteger(next.agents.initialLineages, DEFAULT_SIMULATION_PARAMETERS.agents.initialLineages);
  if (next.world.initialAgents > 0) {
    next.agents.initialLineages = Math.min(next.agents.initialLineages, next.world.initialAgents);
  }
  if (!Array.isArray(next.agents.families) || next.agents.families.length === 0) {
    next.agents.families = cloneParameters(DEFAULT_SIMULATION_PARAMETERS).agents.families;
  }
  next.agents.families = resizeFamilies(next.agents.families, next.agents.initialLineages);
  const defaultFamily = DEFAULT_SIMULATION_PARAMETERS.agents.families[0];
  if (!defaultFamily) {
    throw new Error("Missing default agent family");
  }
  next.agents.families = next.agents.families.map((family, index) => {
    const fallback =
      DEFAULT_SIMULATION_PARAMETERS.agents.families[index % DEFAULT_SIMULATION_PARAMETERS.agents.families.length] ??
      defaultFamily;
    return {
      hiddenCount: positiveInteger(family.hiddenCount, fallback.hiddenCount),
      secondLayerEnabled: Boolean(family.secondLayerEnabled),
      secondHiddenCount: positiveInteger(family.secondHiddenCount, fallback.secondHiddenCount),
      activation: ["tanh", "relu", "sigmoid"].includes(family.activation) ? family.activation : fallback.activation,
      initialWeightMean: Number.isFinite(family.initialWeightMean) ? family.initialWeightMean : fallback.initialWeightMean,
      initialWeightStdDev: positive(family.initialWeightStdDev, fallback.initialWeightStdDev),
    };
  });

  next.food.patchCount = positiveInteger(next.food.patchCount, DEFAULT_SIMULATION_PARAMETERS.food.patchCount);
  next.food.patchMargin = nonNegative(next.food.patchMargin);
  next.food.spawnProbabilityMin = probability(next.food.spawnProbabilityMin);
  next.food.spawnProbabilityMax = probability(next.food.spawnProbabilityMax);
  next.food.secondFoodChance = probability(next.food.secondFoodChance);

  next.mutation.weightMutationChance = probability(next.mutation.weightMutationChance);
  next.mutation.summaryMaxLabels = positiveInteger(next.mutation.summaryMaxLabels, DEFAULT_SIMULATION_PARAMETERS.mutation.summaryMaxLabels);

  next.runtime.initialSeed = integer(next.runtime.initialSeed, DEFAULT_SIMULATION_PARAMETERS.runtime.initialSeed);
  next.runtime.rngOffset = integer(next.runtime.rngOffset, DEFAULT_SIMULATION_PARAMETERS.runtime.rngOffset);
  next.runtime.speedMin = positive(next.runtime.speedMin, DEFAULT_SIMULATION_PARAMETERS.runtime.speedMin);
  next.runtime.speedMax = positive(next.runtime.speedMax, DEFAULT_SIMULATION_PARAMETERS.runtime.speedMax);
  next.runtime.speedStep = positive(next.runtime.speedStep, DEFAULT_SIMULATION_PARAMETERS.runtime.speedStep);
  next.runtime.defaultSpeed = positive(next.runtime.defaultSpeed, DEFAULT_SIMULATION_PARAMETERS.runtime.defaultSpeed);
  next.runtime.maxFrameElapsed = positive(next.runtime.maxFrameElapsed, DEFAULT_SIMULATION_PARAMETERS.runtime.maxFrameElapsed);
  next.runtime.maxStepsPerFrame = positiveInteger(next.runtime.maxStepsPerFrame, DEFAULT_SIMULATION_PARAMETERS.runtime.maxStepsPerFrame);
  next.runtime.autosaveIntervalMs = positive(next.runtime.autosaveIntervalMs, DEFAULT_SIMULATION_PARAMETERS.runtime.autosaveIntervalMs);
  next.runtime.statsRefreshMs = positive(next.runtime.statsRefreshMs, DEFAULT_SIMULATION_PARAMETERS.runtime.statsRefreshMs);

  normalizeRanges(next);
  return next;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isRecord(target) || !isRecord(source)) return source ?? target;
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(target[key])) {
      target[key] = deepMerge(target[key], value);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integer(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function positiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.round(value));
}

function positive(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function nonNegative(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function probability(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeRanges(parameters: SimulationParameters) {
  for (const group of Object.values(parameters)) {
    if (!isRecord(group)) continue;
    for (const value of Object.values(group)) {
      if (!isRangeRecord(value)) continue;
      if (!Number.isFinite(value.min)) value.min = 0;
      if (!Number.isFinite(value.max)) value.max = value.min;
      if (value.max < value.min) {
        const min = value.max;
        value.max = value.min;
        value.min = min;
      }
    }
  }
}

function isRangeRecord(value: unknown): value is { min: number; max: number } {
  return isRecord(value) && typeof value.min === "number" && typeof value.max === "number";
}

function resizeFamilies(families: SimulationParameters["agents"]["families"], count: number) {
  const resized = families.slice(0, count);
  const defaults = DEFAULT_SIMULATION_PARAMETERS.agents.families;
  while (resized.length < count) {
    const fallback = defaults[resized.length % defaults.length] ?? defaults[0];
    if (!fallback) {
      throw new Error("Missing default agent family");
    }
    resized.push(structuredClone(fallback));
  }
  return resized;
}
