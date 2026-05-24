import { clamp, distance, normalize } from "./math";
import type { Agent, Vec2, WorldState } from "./types";

export function sense(agent: Agent, world: WorldState) {
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
