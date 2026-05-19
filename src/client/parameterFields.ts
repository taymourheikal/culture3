import type { SimulationParameters } from "../sim/types";

export type GroupKey = keyof SimulationParameters;

export type Field = {
  label: string;
  path: string;
  step?: number;
  options?: string[];
};

export type ParameterGroup = {
  key: GroupKey;
  title: string;
  fields: Array<Field | Field[]>;
};

export const PARAMETER_GROUPS: ParameterGroup[] = [
  {
    key: "world",
    title: "World Defaults",
    fields: [
      field("Width", "world.width", 1),
      field("Height", "world.height", 1),
      field("Initial agents", "world.initialAgents", 1),
      field("Minimum agents", "world.minAgents", 1),
      field("Population cap", "world.maxAgents", 1),
      field("Initial food", "world.initialFood", 1),
      field("Max food", "world.maxFood", 1),
      field("Tick rate", "world.tickRate", 1),
      field("Minimum reproduction age", "world.minReproductionAge", 0.1),
      field("Reproduction cooldown", "world.reproductionCooldown", 0.1),
      field("Max age", "world.maxAge", 1),
    ],
  },
  {
    key: "initialGenome",
    title: "Initial Genome Ranges",
    fields: [
      range("Speed", "initialGenome.speed", 0.01),
      range("Attack power", "initialGenome.attackPower", 0.1),
      range("Attack range", "initialGenome.attackRange", 0.1),
      range("Metabolism", "initialGenome.metabolism", 0.001),
      range("Food sensitivity", "initialGenome.foodSensitivity", 0.01),
      range("Aggression bias", "initialGenome.aggressionBias", 0.01),
      range("Reproduction threshold", "initialGenome.reproductionThreshold", 1),
      range("Mutation rate", "initialGenome.mutationRate", 0.001),
    ],
  },
  {
    key: "mutation",
    title: "Mutation",
    fields: [
      field("Mutation rate stddev", "mutation.mutationRateStdDev", 0.001),
      range("Mutation rate clamp", "mutation.mutationRateClamp", 0.001),
      field("Speed stddev", "mutation.speedStdDev", 0.01),
      range("Speed clamp", "mutation.speedClamp", 0.01),
      field("Attack power stddev", "mutation.attackPowerStdDev", 0.1),
      range("Attack power clamp", "mutation.attackPowerClamp", 0.1),
      field("Attack range stddev", "mutation.attackRangeStdDev", 0.1),
      range("Attack range clamp", "mutation.attackRangeClamp", 0.1),
      field("Metabolism stddev", "mutation.metabolismStdDev", 0.001),
      range("Metabolism clamp", "mutation.metabolismClamp", 0.001),
      field("Food sensitivity stddev", "mutation.foodSensitivityStdDev", 0.01),
      range("Food sensitivity clamp", "mutation.foodSensitivityClamp", 0.01),
      field("Aggression bias stddev", "mutation.aggressionBiasStdDev", 0.01),
      range("Aggression bias clamp", "mutation.aggressionBiasClamp", 0.01),
      field("Reproduction threshold stddev", "mutation.reproductionThresholdStdDev", 1),
      range("Reproduction threshold clamp", "mutation.reproductionThresholdClamp", 1),
      field("Weight mutation chance", "mutation.weightMutationChance", 0.01),
      range("Weight clamp", "mutation.weightClamp", 0.1),
      field("Summary speed threshold", "mutation.summarySpeedThreshold", 0.01),
      field("Summary attack threshold", "mutation.summaryAttackPowerThreshold", 0.01),
      field("Summary reach threshold", "mutation.summaryAttackRangeThreshold", 0.1),
      field("Summary metabolism threshold", "mutation.summaryMetabolismThreshold", 0.001),
      field("Summary food focus threshold", "mutation.summaryFoodSensitivityThreshold", 0.01),
      field("Summary aggression threshold", "mutation.summaryAggressionThreshold", 0.01),
      field("Summary max labels", "mutation.summaryMaxLabels", 1),
    ],
  },
  {
    key: "food",
    title: "Food",
    fields: [
      field("Patch count", "food.patchCount", 1),
      field("Patch margin", "food.patchMargin", 1),
      range("Patch radius", "food.patchRadius", 1),
      range("Patch richness", "food.patchRichness", 0.01),
      range("Food energy", "food.foodEnergy", 0.1),
      range("Food radius", "food.foodRadius", 0.1),
      field("Spawn probability min", "food.spawnProbabilityMin", 0.01),
      field("Spawn probability max", "food.spawnProbabilityMax", 0.01),
      field("Second food chance", "food.secondFoodChance", 0.01),
    ],
  },
  {
    key: "founder",
    title: "Founder Agents",
    fields: [
      range("Initial velocity", "founder.initialVelocity", 0.01),
      range("Initial energy", "founder.initialEnergy", 1),
      field("Initial health", "founder.initialHealth", 1),
      field("Radius", "founder.radius", 0.1),
      range("Reproduction cooldown offset", "founder.reproductionCooldownOffset", 0.1),
      range("Attack cooldown offset", "founder.attackCooldownOffset", 0.1),
      field("Initial recent damage", "founder.initialRecentDamage", 0.1),
      field("Initial kills", "founder.initialKills", 1),
      field("Initial children", "founder.initialChildren", 1),
    ],
  },
  {
    key: "sensing",
    title: "Sensing",
    fields: [
      field("Energy divisor", "sensing.energyDivisor", 1),
      field("Health divisor", "sensing.healthDivisor", 1),
      field("Food closeness distance", "sensing.foodClosenessDistance", 1),
      field("Agent closeness distance", "sensing.agentClosenessDistance", 1),
      field("Relative energy divisor", "sensing.relativeEnergyDivisor", 1),
      field("Crowding radius", "sensing.crowdingRadius", 1),
      field("Crowding divisor", "sensing.crowdingDivisor", 1),
      field("Recent damage divisor", "sensing.recentDamageDivisor", 1),
      field("Children divisor", "sensing.childrenDivisor", 1),
    ],
  },
  {
    key: "movement",
    title: "Movement",
    fields: [
      field("Rest threshold", "movement.restThreshold", 0.01),
      field("Normal speed multiplier", "movement.normalSpeedMultiplier", 0.01),
      field("Low-energy speed multiplier", "movement.lowEnergySpeedMultiplier", 0.01),
      field("Low-energy threshold", "movement.lowEnergyThreshold", 0.1),
      field("Velocity inertia", "movement.velocityInertia", 0.01),
    ],
  },
  {
    key: "eating",
    title: "Eating",
    fields: [
      field("Eat distance bonus", "eating.eatDistanceBonus", 0.1),
      field("Base bite size", "eating.baseBiteSize", 0.1),
      field("Bite output multiplier", "eating.biteOutputMultiplier", 0.1),
      field("Max agent energy", "eating.maxAgentEnergy", 1),
      field("Food depletion threshold", "eating.foodDepletionThreshold", 0.1),
    ],
  },
  {
    key: "combat",
    title: "Combat",
    fields: [
      field("Attack energy minimum", "combat.attackEnergyMinimum", 0.1),
      field("Attack intent threshold", "combat.attackIntentThreshold", 0.01),
      range("Damage multiplier", "combat.damageMultiplier", 0.01),
      field("Flat attack energy cost", "combat.flatAttackEnergyCost", 0.1),
      field("Attack power cost multiplier", "combat.attackPowerCostMultiplier", 0.01),
      field("Attack cooldown", "combat.attackCooldown", 0.01),
      field("Kill energy reward", "combat.killEnergyReward", 1),
      field("Max agent energy", "combat.maxAgentEnergy", 1),
    ],
  },
  {
    key: "metabolism",
    title: "Metabolism",
    fields: [
      field("Movement cost multiplier", "metabolism.movementCostMultiplier", 0.001),
      field("Attack posture cost multiplier", "metabolism.attackPostureCostMultiplier", 0.001),
      field("Low-energy health threshold", "metabolism.lowEnergyHealthThreshold", 0.1),
      field("Low-energy health damage/tick", "metabolism.lowEnergyHealthDamagePerTick", 0.01),
    ],
  },
  {
    key: "reproduction",
    title: "Reproduction",
    fields: [
      field("Output suppression threshold", "reproduction.outputSuppressionThreshold", 0.01),
      field("Surplus override multiplier", "reproduction.surplusOverrideMultiplier", 0.01),
      range("Child energy share", "reproduction.childEnergyShare", 0.01),
      range("Child spawn distance", "reproduction.childSpawnDistance", 0.1),
      field("Child velocity inheritance", "reproduction.childVelocityInheritance", 0.01),
      field("Child health", "reproduction.childHealth", 1),
      field("Child radius", "reproduction.childRadius", 0.1),
      field("Child attack cooldown", "reproduction.childAttackCooldown", 0.01),
    ],
  },
  {
    key: "lineage",
    title: "Lineage",
    fields: [
      field("Hue step", "lineage.hueStep", 0.001),
      field("Saturation", "lineage.saturation", 1),
      field("Lightness", "lineage.lightness", 1),
    ],
  },
  {
    key: "runtime",
    title: "Runtime",
    fields: [
      field("Initial seed", "runtime.initialSeed", 1),
      field("RNG offset", "runtime.rngOffset", 1),
      field("Default speed", "runtime.defaultSpeed", 0.5),
      field("Speed min", "runtime.speedMin", 0.5),
      field("Speed max", "runtime.speedMax", 0.5),
      field("Speed step", "runtime.speedStep", 0.5),
      field("Max frame elapsed", "runtime.maxFrameElapsed", 0.01),
      field("Max steps/frame", "runtime.maxStepsPerFrame", 1),
      field("Autosave interval ms", "runtime.autosaveIntervalMs", 100),
      field("Stats refresh ms", "runtime.statsRefreshMs", 50),
    ],
  },
];

function field(label: string, path: string, step?: number): Field {
  return { label, path, step };
}

function range(label: string, path: string, step?: number): Field[] {
  return [
    field(`${label} min`, `${path}.min`, step),
    field(`${label} max`, `${path}.max`, step),
  ];
}
