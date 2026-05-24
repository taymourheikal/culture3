export type Vec2 = {
  x: number;
  y: number;
};

export type BrainWeights = {
  inputHidden: number[];
  hiddenBias: number[];
  hiddenHidden?: number[];
  secondHiddenBias?: number[];
  lastHiddenOutput: number[];
  outputBias: number[];
};

export type NumericRange = {
  min: number;
  max: number;
};

export type Genome = {
  speed: number;
  attackPower: number;
  attackRange: number;
  metabolism: number;
  foodSensitivity: number;
  aggressionBias: number;
  reproductionThreshold: number;
  mutationRate: number;
  brainWeights: BrainWeights;
  neural: AgentNeuralParameters;
};

export type Agent = {
  id: number;
  lineageId: number;
  parentId: number | null;
  generation: number;
  position: Vec2;
  velocity: Vec2;
  energy: number;
  age: number;
  health: number;
  genome: Genome;
  color: string;
  radius: number;
  cooldown: number;
  attackCooldown: number;
  recentDamage: number;
  kills: number;
  children: number;
  lastMutationSummary: string;
};

export type Food = {
  id: number;
  patchId: number;
  position: Vec2;
  energy: number;
  radius: number;
};

export type FoodPatch = {
  id: number;
  center: Vec2;
  radius: number;
  richness: number;
};

export type Lineage = {
  id: number;
  founderAgentId: number;
  color: string;
  birthTick: number;
  currentPopulation: number;
  maxPopulation: number;
  maxGeneration: number;
  totalBorn: number;
  totalKilled: number;
  totalFoodConsumed: number;
  extinctAt?: number;
};

export type BirthEvent = {
  tick: number;
  parentId: number;
  childId: number;
  lineageId: number;
  generation: number;
  mutationSummary: string;
};

export type DeathEvent = {
  tick: number;
  agentId: number;
  lineageId: number;
  cause: "starvation" | "attack" | "age";
  killedBy?: number;
};

export type WorldConfig = {
  width: number;
  height: number;
  initialAgents: number;
  minAgents: number;
  maxAgents: number;
  initialFood: number;
  maxFood: number;
  tickRate: number;
  minReproductionAge: number;
  reproductionCooldown: number;
  maxAge: number;
};

export type AgentNeuralParameters = {
  hiddenCount: number;
  secondLayerEnabled: boolean;
  secondHiddenCount: number;
  activation: "tanh" | "relu" | "sigmoid";
  initialWeightMean: number;
  initialWeightStdDev: number;
};

export type AgentsParameters = {
  inputCount: number;
  outputCount: number;
  initialLineages: number;
  families: AgentNeuralParameters[];
};

export type InitialGenomeParameters = {
  speed: NumericRange;
  attackPower: NumericRange;
  attackRange: NumericRange;
  metabolism: NumericRange;
  foodSensitivity: NumericRange;
  aggressionBias: NumericRange;
  reproductionThreshold: NumericRange;
  mutationRate: NumericRange;
};

export type MutationParameters = {
  mutationRateStdDev: number;
  mutationRateClamp: NumericRange;
  speedStdDev: number;
  speedClamp: NumericRange;
  attackPowerStdDev: number;
  attackPowerClamp: NumericRange;
  attackRangeStdDev: number;
  attackRangeClamp: NumericRange;
  metabolismStdDev: number;
  metabolismClamp: NumericRange;
  foodSensitivityStdDev: number;
  foodSensitivityClamp: NumericRange;
  aggressionBiasStdDev: number;
  aggressionBiasClamp: NumericRange;
  reproductionThresholdStdDev: number;
  reproductionThresholdClamp: NumericRange;
  weightMutationChance: number;
  weightClamp: NumericRange;
  summarySpeedThreshold: number;
  summaryAttackPowerThreshold: number;
  summaryAttackRangeThreshold: number;
  summaryMetabolismThreshold: number;
  summaryFoodSensitivityThreshold: number;
  summaryAggressionThreshold: number;
  summaryMaxLabels: number;
};

export type FoodParameters = {
  patchCount: number;
  patchMargin: number;
  patchRadius: NumericRange;
  patchRichness: NumericRange;
  foodEnergy: NumericRange;
  foodRadius: NumericRange;
  spawnProbabilityMin: number;
  spawnProbabilityMax: number;
  secondFoodChance: number;
};

export type FounderParameters = {
  initialVelocity: NumericRange;
  initialEnergy: NumericRange;
  initialHealth: number;
  radius: number;
  reproductionCooldownOffset: NumericRange;
  attackCooldownOffset: NumericRange;
  initialRecentDamage: number;
  initialKills: number;
  initialChildren: number;
};

export type SensingParameters = {
  energyDivisor: number;
  healthDivisor: number;
  foodClosenessDistance: number;
  agentClosenessDistance: number;
  relativeEnergyDivisor: number;
  crowdingRadius: number;
  crowdingDivisor: number;
  recentDamageDivisor: number;
  childrenDivisor: number;
};

export type MovementParameters = {
  restThreshold: number;
  normalSpeedMultiplier: number;
  lowEnergySpeedMultiplier: number;
  lowEnergyThreshold: number;
  velocityInertia: number;
};

export type EatingParameters = {
  eatDistanceBonus: number;
  baseBiteSize: number;
  biteOutputMultiplier: number;
  maxAgentEnergy: number;
  foodDepletionThreshold: number;
};

export type CombatParameters = {
  attackEnergyMinimum: number;
  attackIntentThreshold: number;
  damageMultiplier: NumericRange;
  flatAttackEnergyCost: number;
  attackPowerCostMultiplier: number;
  attackCooldown: number;
  killEnergyReward: number;
  maxAgentEnergy: number;
};

export type MetabolismParameters = {
  movementCostMultiplier: number;
  attackPostureCostMultiplier: number;
  lowEnergyHealthThreshold: number;
  lowEnergyHealthDamagePerTick: number;
};

export type ReproductionParameters = {
  outputSuppressionThreshold: number;
  surplusOverrideMultiplier: number;
  childEnergyShare: NumericRange;
  childSpawnDistance: NumericRange;
  childVelocityInheritance: number;
  childHealth: number;
  childRadius: number;
  childAttackCooldown: number;
};

export type LineageParameters = {
  hueStep: number;
  saturation: number;
  lightness: number;
};

export type RuntimeParameters = {
  initialSeed: number;
  rngOffset: number;
  defaultSpeed: number;
  speedMin: number;
  speedMax: number;
  speedStep: number;
  maxFrameElapsed: number;
  maxStepsPerFrame: number;
  autosaveIntervalMs: number;
  statsRefreshMs: number;
};

export type SimulationParameters = {
  world: WorldConfig;
  agents: AgentsParameters;
  initialGenome: InitialGenomeParameters;
  mutation: MutationParameters;
  food: FoodParameters;
  founder: FounderParameters;
  sensing: SensingParameters;
  movement: MovementParameters;
  eating: EatingParameters;
  combat: CombatParameters;
  metabolism: MetabolismParameters;
  reproduction: ReproductionParameters;
  lineage: LineageParameters;
  runtime: RuntimeParameters;
};

export type WorldState = {
  worldId: string;
  seed: number;
  tick: number;
  nextAgentId: number;
  nextLineageId: number;
  nextFoodId: number;
  agents: Agent[];
  food: Food[];
  foodPatches: FoodPatch[];
  lineages: Record<number, Lineage>;
  birthEvents: BirthEvent[];
  deathEvents: DeathEvent[];
  config: WorldConfig;
  parameters: SimulationParameters;
};

export type WorldSnapshot = {
  timestamp: string;
  tick: number;
  seed: number;
  agents: Agent[];
  food: Food[];
  lineages: Lineage[];
};
