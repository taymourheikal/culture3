import { mutateGenome } from "./genome";
import { clamp, distance, normalize, wrapPosition } from "./math";
import { createChildAgent, getLineage, killAgent } from "./worldLineages";
import type { Agent, Food, WorldState } from "./types";
import type { Rng } from "./rng";

export function applyAction(
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

export function spendMetabolism(agent: Agent, outputs: number[], world: WorldState) {
  const metabolism = world.parameters.metabolism;
  const movementCost = Math.hypot(agent.velocity.x, agent.velocity.y) * metabolism.movementCostMultiplier;
  const attackPostureCost = Math.max(0, outputs[2] ?? 0) * metabolism.attackPostureCostMultiplier;
  agent.energy -= agent.genome.metabolism + movementCost + attackPostureCost;
  if (agent.energy < metabolism.lowEnergyHealthThreshold) {
    agent.health -= metabolism.lowEnergyHealthDamagePerTick;
  }
}

export function maybeReproduce(agent: Agent, outputs: number[], world: WorldState, rng: Rng) {
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

  const child = createChildAgent(agent, childEnergy, mutation.summary, world, rng);
  child.genome = mutation.genome;
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

export function checkDeath(agent: Agent, world: WorldState) {
  if (agent.health <= 0) {
    killAgent(agent, world, { tick: world.tick, agentId: agent.id, lineageId: agent.lineageId, cause: "starvation" });
  } else if (agent.energy <= 0) {
    killAgent(agent, world, { tick: world.tick, agentId: agent.id, lineageId: agent.lineageId, cause: "starvation" });
  } else if (agent.age > world.config.maxAge) {
    killAgent(agent, world, { tick: world.tick, agentId: agent.id, lineageId: agent.lineageId, cause: "age" });
  }
}
