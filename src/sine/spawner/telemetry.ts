import type { SpawnerWorld } from "./types";
import { ensureCompiledBrainPlan } from "./brainPlan";
import { planForAlignedSpawner, spawnerRuntimeContextMatches, type SpawnerRuntimeContext } from "./spawnerRuntimeContext";

export function recordTelemetry(world: SpawnerWorld, runtimeContext?: SpawnerRuntimeContext) {
  const population = Math.max(1, world.spawners.length);
  const recentResolvedCount = world.recentResolvedPayoffs.length;
  let recentLossSum = 0;
  let recentHitCount = 0;
  let recentLossCount = 0;
  let recentPayoffSum = 0;
  for (const payoff of world.recentResolvedPayoffs) {
    recentPayoffSum += payoff;
    if (payoff > 0) recentHitCount += 1;
    if (payoff < 0) {
      recentLossCount += 1;
      recentLossSum += -payoff;
    }
  }
  const rollingLoss = recentLossSum / Math.max(1, recentResolvedCount);
  const rollingHitRate = recentHitCount / Math.max(1, recentResolvedCount);
  const rollingTradeAveragePayoff = recentPayoffSum / Math.max(1, recentResolvedCount);
  const rollingAveragePayoff = rollingTradeAveragePayoff * Math.min(1, recentResolvedCount / population);
  const lossRate = recentLossCount / Math.max(1, recentResolvedCount);
  const previousTotalResolved = world.telemetry.at(-1)?.totalResolved ?? 0;
  const resolvedVolume = Math.max(0, world.totalResolved - previousTotalResolved);
  let activeUnitTotal = 0;
  let activeConnectionTotal = 0;
  let activeLayerTotal = 0;
  const alignedContext = runtimeContext && spawnerRuntimeContextMatches(runtimeContext, world.spawners) ? runtimeContext : undefined;
  for (let index = 0; index < world.spawners.length; index += 1) {
    const spawner = world.spawners[index];
    if (!spawner) continue;
    const plan = planForAlignedSpawner(alignedContext, spawner, index) ?? ensureCompiledBrainPlan(spawner.genome);
    activeUnitTotal += plan.activeUnitCount;
    activeConnectionTotal += plan.activeConnectionCount;
    activeLayerTotal += plan.activeLayerCount;
  }

  world.telemetry.push({
    tick: world.tick,
    population: world.spawners.length,
    rollingLoss,
    rollingHitRate,
    rollingAveragePayoff,
    resolvedVolume,
    totalResolved: world.totalResolved,
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
