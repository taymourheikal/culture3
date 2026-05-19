import { forwardBrain } from "./brain";
import { createGenome, mutateGenome } from "./genome";
import { clamp, distance, normalize, wrapPosition } from "./math";
import { DEFAULT_SIMULATION_PARAMETERS, sanitizeParameters } from "./parameters";
import { createRng, type Rng } from "./rng";
import type { Agent, DeathEvent, Food, FoodPatch, SimulationParameters, Vec2, WorldConfig, WorldSnapshot, WorldState } from "./types";

export const DEFAULT_CONFIG: WorldConfig = DEFAULT_SIMULATION_PARAMETERS.world;

export function createWorld(seed = Date.now() % 1_000_000, parameters: SimulationParameters = DEFAULT_SIMULATION_PARAMETERS): WorldState {
  const rng = createRng(seed);
  const worldParameters = sanitizeParameters(parameters);
  const config = worldParameters.world;
  const world: WorldState = {
    worldId: `local-v0-${seed}-${Date.now().toString(36)}`,
    seed,
    tick: 0,
    nextAgentId: 1,
    nextLineageId: 1,
    nextFoodId: 1,
    agents: [],
    food: [],
    foodPatches: createFoodPatches(rng, config, worldParameters),
    lineages: {},
    birthEvents: [],
    deathEvents: [],
    config,
    parameters: worldParameters,
  };

  for (let i = 0; i < config.initialFood; i += 1) {
    addFood(world, rng);
  }

  const agentsPerLineage = Math.floor(config.initialAgents / worldParameters.agents.initialLineages);
  for (let familyIndex = 0; familyIndex < worldParameters.agents.initialLineages; familyIndex += 1) {
    addLineage(world, rng, familyIndex, agentsPerLineage);
  }

  return world;
}

export function stepWorld(world: WorldState, rng: Rng) {
  world.tick += 1;
  growFood(world, rng);

  const agents = [...world.agents];
  for (const agent of agents) {
    if (!world.agents.includes(agent)) continue;

    const senses = sense(agent, world);
    const outputs = forwardBrain(agent.genome, senses.inputs);
    applyAction(agent, outputs, senses.nearestAgent, senses.nearestFood, world, rng);

    agent.age += 1 / world.config.tickRate;
    agent.cooldown = Math.max(0, agent.cooldown - 1 / world.config.tickRate);
    agent.attackCooldown = Math.max(0, agent.attackCooldown - 1 / world.config.tickRate);
    agent.recentDamage *= 0.9;

    spendMetabolism(agent, outputs, world);
    maybeReproduce(agent, outputs, world, rng);
    checkDeath(agent, world);
  }

  if (world.agents.length < world.config.minAgents) {
    addLineage(world, rng, world.nextLineageId - 1, 1);
  }

  updateLineagePopulations(world);
}

export function createSnapshot(world: WorldState): WorldSnapshot {
  return {
    timestamp: new Date().toISOString(),
    tick: world.tick,
    seed: world.seed,
    agents: world.agents,
    food: world.food,
    lineages: Object.values(world.lineages),
  };
}

function createFoodPatches(rng: Rng, config: WorldConfig, parameters: SimulationParameters): FoodPatch[] {
  const food = parameters.food;
  return Array.from({ length: food.patchCount }, (_, index) => ({
    id: index + 1,
    center: {
      x: rng.range(food.patchMargin, config.width - food.patchMargin),
      y: rng.range(food.patchMargin, config.height - food.patchMargin),
    },
    radius: rng.range(food.patchRadius.min, food.patchRadius.max),
    richness: rng.range(food.patchRichness.min, food.patchRichness.max),
  }));
}

function addFood(world: WorldState, rng: Rng) {
  const foodParameters = world.parameters.food;
  const patch = weightedPatch(world.foodPatches, rng);
  const angle = rng.range(0, Math.PI * 2);
  const radius = Math.sqrt(rng.next()) * patch.radius;
  const position = wrapPosition(
    {
      x: patch.center.x + Math.cos(angle) * radius,
      y: patch.center.y + Math.sin(angle) * radius,
    },
    world.config.width,
    world.config.height,
  );

  world.food.push({
    id: world.nextFoodId,
    patchId: patch.id,
    position,
    energy: rng.range(foodParameters.foodEnergy.min, foodParameters.foodEnergy.max) * patch.richness,
    radius: rng.range(foodParameters.foodRadius.min, foodParameters.foodRadius.max),
  });
  world.nextFoodId += 1;
}

function weightedPatch(patches: FoodPatch[], rng: Rng) {
  const total = patches.reduce((sum, patch) => sum + patch.richness, 0);
  let roll = rng.range(0, total);
  for (const patch of patches) {
    roll -= patch.richness;
    if (roll <= 0) return patch;
  }
  return patches[patches.length - 1] as FoodPatch;
}

function addLineage(world: WorldState, rng: Rng, familyIndex: number, agentCount: number) {
  if (agentCount <= 0) return;
  const founder = world.parameters.founder;
  const founderAgentId = world.nextAgentId;
  const lineageId = world.nextLineageId;
  const neural = getFamilyNeural(world, familyIndex);
  const color = lineageColor(lineageId, world.parameters);
  world.nextLineageId += 1;
  world.lineages[lineageId] = {
    id: lineageId,
    founderAgentId,
    color,
    birthTick: world.tick,
    currentPopulation: agentCount,
    maxPopulation: agentCount,
    maxGeneration: 0,
    totalBorn: agentCount,
    totalKilled: 0,
    totalFoodConsumed: 0,
  };

  for (let i = 0; i < agentCount; i += 1) {
    const id = world.nextAgentId;
    world.nextAgentId += 1;
    world.agents.push({
      id,
      lineageId,
      parentId: null,
      generation: 0,
      position: { x: rng.range(0, world.config.width), y: rng.range(0, world.config.height) },
      velocity: { x: rng.range(founder.initialVelocity.min, founder.initialVelocity.max), y: rng.range(founder.initialVelocity.min, founder.initialVelocity.max) },
      energy: rng.range(founder.initialEnergy.min, founder.initialEnergy.max),
      age: 0,
      health: founder.initialHealth,
      genome: createGenome(rng, world.parameters, neural),
      color,
      radius: founder.radius,
      cooldown: rng.range(founder.reproductionCooldownOffset.min, founder.reproductionCooldownOffset.max),
      attackCooldown: rng.range(founder.attackCooldownOffset.min, founder.attackCooldownOffset.max),
      recentDamage: founder.initialRecentDamage,
      kills: founder.initialKills,
      children: founder.initialChildren,
      lastMutationSummary: "founder genome",
    });
  }
}

function sense(agent: Agent, world: WorldState) {
  const sensing = world.parameters.sensing;
  const nearestFood = findNearest(agent.position, world.food);
  const nearestAgent = findNearestAgent(agent, world.agents);
  const foodVector = nearestFood ? normalize(delta(agent.position, nearestFood.position)) : { x: 0, y: 0 };
  const agentVector = nearestAgent ? normalize(delta(agent.position, nearestAgent.position)) : { x: 0, y: 0 };
  const agentDistance = nearestAgent ? distance(agent.position, nearestAgent.position) : world.config.width;
  const crowding = world.agents.filter((other) => other !== agent && distance(agent.position, other.position) < sensing.crowdingRadius).length;

  return {
    nearestFood,
    nearestAgent,
    inputs: [
      clamp(agent.energy / sensing.energyDivisor, 0, 1),
      clamp(agent.health / sensing.healthDivisor, 0, 1),
      clamp(agent.age / world.config.maxAge, 0, 1),
      foodVector.x * agent.genome.foodSensitivity,
      foodVector.y * agent.genome.foodSensitivity,
      nearestFood ? clamp(1 - distance(agent.position, nearestFood.position) / sensing.foodClosenessDistance, 0, 1) : 0,
      agentVector.x,
      agentVector.y,
      clamp(1 - agentDistance / sensing.agentClosenessDistance, 0, 1),
      nearestAgent ? clamp((nearestAgent.energy - agent.energy) / sensing.relativeEnergyDivisor, -1, 1) : 0,
      clamp(crowding / sensing.crowdingDivisor, 0, 1),
      clamp(agent.recentDamage / sensing.recentDamageDivisor, 0, 1),
      clamp(agent.children / sensing.childrenDivisor, 0, 1),
      agent.genome.aggressionBias,
    ],
  };
}

function applyAction(
  agent: Agent,
  outputs: number[],
  target: Agent | null,
  nearestFood: Food | null,
  world: WorldState,
  rng: Rng,
) {
  const movementParameters = world.parameters.movement;
  const eating = world.parameters.eating;
  const combat = world.parameters.combat;
  const rest = (outputs[5] ?? 0) > movementParameters.restThreshold;
  const movement = rest ? { x: 0, y: 0 } : normalize({ x: outputs[0] ?? 0, y: outputs[1] ?? 0 });
  const speed = agent.genome.speed * (agent.energy > movementParameters.lowEnergyThreshold ? movementParameters.normalSpeedMultiplier : movementParameters.lowEnergySpeedMultiplier);
  agent.velocity.x = agent.velocity.x * movementParameters.velocityInertia + movement.x * speed;
  agent.velocity.y = agent.velocity.y * movementParameters.velocityInertia + movement.y * speed;
  agent.position = wrapPosition(
    {
      x: agent.position.x + agent.velocity.x,
      y: agent.position.y + agent.velocity.y,
    },
    world.config.width,
    world.config.height,
  );

  if (nearestFood && distance(agent.position, nearestFood.position) < agent.radius + nearestFood.radius + eating.eatDistanceBonus) {
    const bite = Math.min(nearestFood.energy, eating.baseBiteSize + Math.max(0, outputs[3] ?? 0) * eating.biteOutputMultiplier);
    nearestFood.energy -= bite;
    agent.energy = clamp(agent.energy + bite, 0, eating.maxAgentEnergy);
    getLineage(world, agent.lineageId).totalFoodConsumed += bite;
    if (nearestFood.energy <= eating.foodDepletionThreshold) {
      world.food = world.food.filter((food) => food !== nearestFood);
    }
  }

  const attackIntent = (outputs[2] ?? 0) + agent.genome.aggressionBias;
  if (
    target &&
    agent.attackCooldown <= 0 &&
    agent.energy > combat.attackEnergyMinimum &&
    attackIntent > combat.attackIntentThreshold &&
    distance(agent.position, target.position) <= agent.genome.attackRange
  ) {
    const damage = agent.genome.attackPower * rng.range(combat.damageMultiplier.min, combat.damageMultiplier.max);
    target.health -= damage;
    target.recentDamage += damage;
    agent.energy -= combat.flatAttackEnergyCost + agent.genome.attackPower * combat.attackPowerCostMultiplier;
    agent.attackCooldown = combat.attackCooldown;

    if (target.health <= 0) {
      killAgent(target, world, { tick: world.tick, agentId: target.id, lineageId: target.lineageId, cause: "attack", killedBy: agent.id });
      agent.kills += 1;
      agent.energy = clamp(agent.energy + combat.killEnergyReward, 0, combat.maxAgentEnergy);
      getLineage(world, agent.lineageId).totalKilled += 1;
    }
  }
}

function spendMetabolism(agent: Agent, outputs: number[], world: WorldState) {
  const metabolism = world.parameters.metabolism;
  const movementCost = Math.hypot(agent.velocity.x, agent.velocity.y) * metabolism.movementCostMultiplier;
  const attackPostureCost = Math.max(0, outputs[2] ?? 0) * metabolism.attackPostureCostMultiplier;
  agent.energy -= agent.genome.metabolism + movementCost + attackPostureCost;
  if (agent.energy < metabolism.lowEnergyHealthThreshold) {
    agent.health -= metabolism.lowEnergyHealthDamagePerTick;
  }
}

function maybeReproduce(agent: Agent, outputs: number[], world: WorldState, rng: Rng) {
  const reproduction = world.parameters.reproduction;
  if (world.agents.length >= world.config.maxAgents) return;
  if ((outputs[4] ?? 0) < reproduction.outputSuppressionThreshold && agent.energy < agent.genome.reproductionThreshold * reproduction.surplusOverrideMultiplier) return;
  if (agent.energy < agent.genome.reproductionThreshold) return;
  if (agent.age < world.config.minReproductionAge || agent.cooldown > 0) return;

  const mutation = mutateGenome(agent.genome, rng, world.parameters);
  const childEnergy = agent.energy * rng.range(reproduction.childEnergyShare.min, reproduction.childEnergyShare.max);
  agent.energy -= childEnergy;
  agent.cooldown = world.config.reproductionCooldown;
  agent.children += 1;

  const offset = normalize({ x: rng.range(-1, 1), y: rng.range(-1, 1) });
  const child: Agent = {
    id: world.nextAgentId,
    lineageId: agent.lineageId,
    parentId: agent.id,
    generation: agent.generation + 1,
    position: wrapPosition(
      {
        x: agent.position.x + offset.x * rng.range(reproduction.childSpawnDistance.min, reproduction.childSpawnDistance.max),
        y: agent.position.y + offset.y * rng.range(reproduction.childSpawnDistance.min, reproduction.childSpawnDistance.max),
      },
      world.config.width,
      world.config.height,
    ),
    velocity: { x: agent.velocity.x * reproduction.childVelocityInheritance, y: agent.velocity.y * reproduction.childVelocityInheritance },
    energy: childEnergy,
    age: 0,
    health: reproduction.childHealth,
    genome: mutation.genome,
    color: agent.color,
    radius: reproduction.childRadius,
    cooldown: world.config.reproductionCooldown,
    attackCooldown: reproduction.childAttackCooldown,
    recentDamage: 0,
    kills: 0,
    children: 0,
    lastMutationSummary: mutation.summary,
  };
  world.nextAgentId += 1;
  world.agents.push(child);

  const lineage = getLineage(world, agent.lineageId);
  lineage.totalBorn += 1;
  lineage.maxGeneration = Math.max(lineage.maxGeneration, child.generation);
  lineage.extinctAt = undefined;

  world.birthEvents.push({
    tick: world.tick,
    parentId: agent.id,
    childId: child.id,
    lineageId: child.lineageId,
    generation: child.generation,
    mutationSummary: mutation.summary,
  });
}

function checkDeath(agent: Agent, world: WorldState) {
  if (agent.health <= 0) {
    killAgent(agent, world, { tick: world.tick, agentId: agent.id, lineageId: agent.lineageId, cause: "starvation" });
  } else if (agent.energy <= 0) {
    killAgent(agent, world, { tick: world.tick, agentId: agent.id, lineageId: agent.lineageId, cause: "starvation" });
  } else if (agent.age > world.config.maxAge) {
    killAgent(agent, world, { tick: world.tick, agentId: agent.id, lineageId: agent.lineageId, cause: "age" });
  }
}

function killAgent(agent: Agent, world: WorldState, event: DeathEvent) {
  if (!world.agents.includes(agent)) return;
  world.agents = world.agents.filter((candidate) => candidate !== agent);
  world.deathEvents.push(event);
  const lineage = getLineage(world, agent.lineageId);
  lineage.currentPopulation = Math.max(0, lineage.currentPopulation - 1);
  if (lineage.currentPopulation === 0) {
    lineage.extinctAt = world.tick;
  }
}

function growFood(world: WorldState, rng: Rng) {
  const food = world.parameters.food;
  const deficit = world.config.maxFood - world.food.length;
  if (deficit <= 0) return;
  const probability = clamp(deficit / world.config.maxFood, food.spawnProbabilityMin, food.spawnProbabilityMax);
  const additions = Math.min(deficit, rng.chance(probability) ? 1 + (rng.chance(food.secondFoodChance) ? 1 : 0) : 0);
  for (let i = 0; i < additions; i += 1) {
    addFood(world, rng);
  }
}

function updateLineagePopulations(world: WorldState) {
  for (const lineage of Object.values(world.lineages)) {
    lineage.currentPopulation = 0;
  }
  for (const agent of world.agents) {
    const lineage = getLineage(world, agent.lineageId);
    lineage.currentPopulation += 1;
    lineage.maxPopulation = Math.max(lineage.maxPopulation, lineage.currentPopulation);
    lineage.maxGeneration = Math.max(lineage.maxGeneration, agent.generation);
  }
  for (const lineage of Object.values(world.lineages)) {
    if (lineage.currentPopulation === 0 && lineage.extinctAt === undefined) {
      lineage.extinctAt = world.tick;
    }
  }
}

function findNearest<T extends { position: Vec2 }>(position: Vec2, items: T[]) {
  let nearest: T | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const candidate = distance(position, item.position);
    if (candidate < best) {
      best = candidate;
      nearest = item;
    }
  }
  return nearest;
}

function getLineage(world: WorldState, lineageId: number) {
  const lineage = world.lineages[lineageId];
  if (!lineage) {
    throw new Error(`Missing lineage ${lineageId}`);
  }
  return lineage;
}

function findNearestAgent(agent: Agent, agents: Agent[]) {
  let nearest: Agent | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const other of agents) {
    if (other === agent) continue;
    const candidate = distance(agent.position, other.position);
    if (candidate < best) {
      best = candidate;
      nearest = other;
    }
  }
  return nearest;
}

function delta(from: Vec2, to: Vec2) {
  return { x: to.x - from.x, y: to.y - from.y };
}

function lineageColor(id: number, parameters: SimulationParameters = DEFAULT_SIMULATION_PARAMETERS) {
  const lineage = parameters.lineage;
  const hue = (id * lineage.hueStep) % 360;
  return `hsl(${hue.toFixed(1)} ${lineage.saturation}% ${lineage.lightness}%)`;
}

function getFamilyNeural(world: WorldState, familyIndex: number) {
  const families = world.parameters.agents.families;
  const fallback = DEFAULT_SIMULATION_PARAMETERS.agents.families[0];
  if (!fallback) {
    throw new Error("Missing default agent family");
  }
  return families[familyIndex % families.length] ?? fallback;
}
