import { createGenome } from "./genome";
import { normalize, wrapPosition } from "./math";
import { DEFAULT_SIMULATION_PARAMETERS } from "./parameters";
import type { Agent, DeathEvent, SimulationParameters, WorldState } from "./types";
import type { Rng } from "./rng";

export function addLineage(world: WorldState, rng: Rng, familyIndex: number, agentCount: number) {
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

export function createChildAgent(agent: Agent, childEnergy: number, mutationSummary: string, world: WorldState, rng: Rng): Agent {
  const reproduction = world.parameters.reproduction;
  const offset = normalize({ x: rng.range(-1, 1), y: rng.range(-1, 1) });
  return {
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
    genome: agent.genome,
    color: agent.color,
    radius: reproduction.childRadius,
    cooldown: world.config.reproductionCooldown,
    attackCooldown: reproduction.childAttackCooldown,
    recentDamage: 0,
    kills: 0,
    children: 0,
    lastMutationSummary: mutationSummary,
  };
}

export function killAgent(agent: Agent, world: WorldState, event: DeathEvent) {
  if (!world.agents.includes(agent)) return;
  world.agents = world.agents.filter((candidate) => candidate !== agent);
  world.deathEvents.push(event);
  const lineage = getLineage(world, agent.lineageId);
  lineage.currentPopulation = Math.max(0, lineage.currentPopulation - 1);
  if (lineage.currentPopulation === 0) {
    lineage.extinctAt = world.tick;
  }
}

export function updateLineagePopulations(world: WorldState) {
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

export function getLineage(world: WorldState, lineageId: number) {
  const lineage = world.lineages[lineageId];
  if (!lineage) {
    throw new Error(`Missing lineage ${lineageId}`);
  }
  return lineage;
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
