import type { MarketRosterPacket, MarketWorkerSessionId } from "../marketWorkerProtocol";
import {
  architectureMetrics,
  spawnerAveragePayoff,
  spawnerHitRate,
  summarizeMutationProfile,
  summarizePerception,
  type SpawnerUniquenessScore,
} from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";

export const ROSTER_AGENT_LIMIT = 160;

export function createMarketRosterPacket({
  sessionId,
  simulation,
  version,
  uniquenessScores,
}: {
  sessionId: MarketWorkerSessionId;
  simulation: MarketSimulationState;
  version: number;
  uniquenessScores: Map<number, SpawnerUniquenessScore>;
}): MarketRosterPacket {
  return {
    sessionId,
    version,
    tick: simulation.world.tick,
    spawners: simulation.world.spawners.slice(0, ROSTER_AGENT_LIMIT).map((spawner) => {
      const metrics = architectureMetrics(spawner.genome);
      const mutation = summarizeMutationProfile(spawner.genome.mutationProfile);
      const perception = summarizePerception(spawner.genome.perception);
      const uniquenessScore = uniquenessScores.get(spawner.id) ?? null;
      const pendingFoodCount = simulation.world.foods.filter((food) => food.creatorSpawnerId === spawner.id && food.status === "pending").length;
      const recentAveragePayoff = spawner.recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / Math.max(1, spawner.recentPayoffs.length);
      return {
        id: spawner.id,
        lineageId: spawner.lineageId,
        generation: spawner.generation,
        birthTick: spawner.birthTick,
        cooldownTicks: spawner.cooldownTicks,
        energy: spawner.energy,
        health: spawner.health,
        pendingFoodCount,
        hitRate: spawnerHitRate(spawner),
        recentAveragePayoff,
        lastAction: spawner.lastAction,
        spawnedCount: spawner.spawnedCount,
        resolvedCount: spawner.resolvedCount,
        children: spawner.children,
        averagePayoff: spawnerAveragePayoff(spawner),
        activeUnits: metrics.activeUnits,
        activeLayers: metrics.activeLayers,
        activeConnections: metrics.activeConnections,
        disabledUnits: metrics.disabledUnits,
        disabledConnections: metrics.disabledConnections,
        recurrentConnections: metrics.recurrentConnections,
        skipConnections: metrics.skipConnections,
        averagePerceptionLag: perception.averageLag,
        longestPerceptionWindow: perception.longestWindow,
        pendingDensityScale: perception.pendingDensityScale,
        topologyMutationRate: mutation.topologyRate,
        weightMutationActivity: mutation.weightActivity,
        biasMutationActivity: mutation.biasActivity,
        perceptionMutationRate: mutation.perceptionMutationRate,
        mutationProfileDrift: mutation.mutationProfileMutationStdDev,
        uniqueness: uniquenessScore?.score ?? null,
        uniquenessComparisonTick: uniquenessScore?.comparisonTick ?? null,
      };
    }),
    recentDeathEvents: simulation.world.recentEvents
      .filter((event) => event.kind === "death")
      .slice(-4)
      .map((event) => ({ id: event.id, spawnerId: event.spawnerId })),
  };
}
