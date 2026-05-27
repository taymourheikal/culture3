import type { SpawnerWorld } from "./types";
import { ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";

export function recordTelemetry(world: SpawnerWorld, plansBySpawnerId: Map<number, CompiledBrainPlan> = new Map()) {
  const recentLosses = world.recentResolvedPayoffs.map((payoff) => Math.max(0, -payoff));
  const rollingLoss = recentLosses.reduce((sum, loss) => sum + loss, 0) / Math.max(1, recentLosses.length);
  const lossRate =
    world.recentResolvedPayoffs.filter((payoff) => payoff < 0).length / Math.max(1, world.recentResolvedPayoffs.length);
  let activeUnitTotal = 0;
  let activeConnectionTotal = 0;
  let activeLayerTotal = 0;
  for (const spawner of world.spawners) {
    const plan = plansBySpawnerId.get(spawner.id) ?? ensureCompiledBrainPlan(spawner.genome);
    activeUnitTotal += plan.activeUnitCount;
    activeConnectionTotal += plan.activeConnectionCount;
    activeLayerTotal += plan.activeLayerCount;
  }
  const population = Math.max(1, world.spawners.length);

  world.telemetry.push({
    tick: world.tick,
    population: world.spawners.length,
    rollingLoss,
    lossRate,
    cumulativeLoss: world.cumulativeLoss,
    cumulativeNetPayoff: world.cumulativeNetPayoff,
    averageActiveUnits: activeUnitTotal / population,
    averageActiveConnections: activeConnectionTotal / population,
    averageActiveLayers: activeLayerTotal / population,
  });

  if (world.telemetry.length > 3000) {
    world.telemetry.splice(0, world.telemetry.length - 3000);
  }
}
