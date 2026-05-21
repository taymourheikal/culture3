import { forwardBrain } from "./brain";
import { DEFAULT_SIMULATION_PARAMETERS, sanitizeParameters } from "./parameters";
import { createRng, type Rng } from "./rng";
import type { SimulationParameters, WorldConfig, WorldSnapshot, WorldState } from "./types";
import { applyAction, checkDeath, maybeReproduce, spendMetabolism } from "./worldActions";
import { addFood, createFoodPatches, growFood } from "./worldFood";
import { addLineage, updateLineagePopulations } from "./worldLineages";
import { sense } from "./worldSensing";

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
