import type { MarketRosterPacket, MarketWorkerSessionId } from "../marketWorkerProtocol";
import { ROSTER_AGENT_LIMIT, selectRosterSpawners } from "./rosterSelection";
import {
  architectureMetrics,
  learnedStateNorm,
  plasticitySummary,
  summarizeSpawnerPerformance,
  summarizeMutationProfile,
  summarizePerception,
  type SpawnerUniquenessScore,
} from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import { createFoodRuntimeIndex } from "../spawner/runtimeIndex";

export { ROSTER_AGENT_LIMIT, selectRosterSpawners };

export function createMarketRosterPacket({
  sessionId,
  simulation,
  version,
  uniquenessScores,
  selectedSpawnerId = null,
}: {
  sessionId: MarketWorkerSessionId;
  simulation: MarketSimulationState;
  version: number;
  uniquenessScores: Map<number, SpawnerUniquenessScore>;
  selectedSpawnerId?: number | null;
}): MarketRosterPacket {
  const foodIndex = createFoodRuntimeIndex(simulation.world.foods);
  const pendingFoodCounts = foodIndex.pendingByCreatorId;
  const rosterSpawners = selectRosterSpawners({
    spawners: simulation.world.spawners,
    pendingFoodCounts,
    selectedSpawnerId,
  });
  return {
    sessionId,
    version,
    tick: simulation.world.tick,
    spawners: rosterSpawners.map((spawner) => {
      const metrics = architectureMetrics(spawner.genome);
      const mutation = summarizeMutationProfile(spawner.genome.mutationProfile);
      const plasticity = plasticitySummary(spawner.genome.plasticityProfile);
      const perception = summarizePerception(spawner.genome.perception);
      const uniquenessScore = uniquenessScores.get(spawner.id) ?? null;
      const pendingFoodCount = pendingFoodCounts.get(spawner.id) ?? 0;
      const learnedDeltaNorm = learnedStateNorm(spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta);
      const performance = summarizeSpawnerPerformance({
        ...spawner,
        learnedDeltaNorm,
        learningUpdateCount: spawner.learnedState.learningUpdateCount,
        reproductionLearningCount: spawner.learnedState.reproductionLearningCount,
        plasticityLearningRateMean: plasticity.learningRateMean,
      });
      return {
        id: spawner.id,
        lineageId: spawner.lineageId,
        generation: spawner.generation,
        birthTick: spawner.birthTick,
        cooldownTicks: spawner.cooldownTicks,
        energy: spawner.energy,
        health: spawner.health,
        pendingFoodCount,
        hitRate: performance.hitRate,
        recentAveragePayoff: performance.recentAveragePayoff,
        lastAction: spawner.lastAction,
        spawnedCount: spawner.spawnedCount,
        resolvedCount: spawner.resolvedCount,
        children: spawner.children,
        averagePayoff: performance.averagePayoff,
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
        learnedDeltaNorm: performance.learnedDeltaNorm,
        recentLearningSignal: spawner.learnedState.recentLearningSignal,
        learningUpdateCount: performance.learningUpdateCount,
        reproductionLearningCount: performance.reproductionLearningCount,
        plasticityLearningRateMean: performance.plasticityLearningRateMean,
        plasticityDecayRate: plasticity.experienceDecayRate,
        plasticityMaxLearnedDelta: plasticity.maxLearnedDelta,
        plasticityMutationStdDev: plasticity.plasticityMutationStdDev,
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
