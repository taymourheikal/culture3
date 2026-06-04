import type { MarketSimulationState } from "../simulationRuntime";
import { classifySpawnerDeath } from "../spawner/runtimeIndex";
import type { SpawnerAgent, SpawnerConfig, SpawnerEvent, SpawnerFood, SpawnerPlasticityProfile } from "../spawnerSimulation";
import { cloneLearnedState, learnedStateNorm, plasticitySummary } from "../spawner/plasticity";
import { createSpawnerSnapshot } from "../spawner/snapshots";
import { finiteOr, nonNegative, nonNegativeInteger, positive, probability } from "../numeric";
import type { SinePersistencePacket, SineSpawnerStateSnapshot } from "../protocol/persistenceProtocol";

export function birthSnapshotFromSpawner(tick: number, spawner: SpawnerAgent, parentSpawnerId?: number): SinePersistencePacket["births"][number] {
  return {
    tick,
    spawner: createSpawnerSnapshot(spawner, { includeLearnedState: false }),
    ...(parentSpawnerId !== undefined ? { parentSpawnerId } : {}),
  };
}

export function deathSnapshotFromSpawner(
  tick: number,
  spawner: SpawnerAgent,
  config?: Pick<SpawnerConfig, "deathEnergy" | "deathHealth">,
): SinePersistencePacket["deaths"][number] {
  return {
    tick,
    spawner: createSpawnerSnapshot(spawner),
    ...(config
      ? {
          deathCause: classifySpawnerDeath(spawner, config),
          deathEnergyThreshold: config.deathEnergy,
          deathHealthThreshold: config.deathHealth,
        }
      : {}),
  };
}

export function genomeSnapshotFromSpawner(
  tick: number,
  reason: SinePersistencePacket["genomeSnapshots"][number]["reason"],
  spawner: SpawnerAgent,
): SinePersistencePacket["genomeSnapshots"][number] {
  return {
    tick,
    reason,
    spawner: createSpawnerSnapshot(spawner, { includeLearnedState: false }),
  };
}

export function stateSnapshotFromSpawner(simulation: MarketSimulationState, spawner: SpawnerAgent): SineSpawnerStateSnapshot {
  const learnedState = cloneLearnedState(spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta);
  const plasticity = plasticitySummary(spawner.genome.plasticityProfile);
  return {
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    generation: spawner.generation,
    tick: simulation.world.tick,
    energy: spawner.energy,
    health: spawner.health,
    age: spawner.ageTicks,
    cooldown: spawner.cooldownTicks,
    hiddenState: { ...spawner.hiddenState },
    lastAction: spawner.lastAction,
    spawnedCount: spawner.spawnedCount,
    resolvedCount: spawner.resolvedCount,
    wins: spawner.wins,
    losses: spawner.losses,
    totalPayoff: spawner.totalPayoff,
    children: spawner.children,
    recentPayoffs: [...spawner.recentPayoffs],
    learnedState,
    learnedDeltaNorm: learnedStateNorm(learnedState, spawner.genome.plasticityProfile.maxLearnedDelta),
    recentLearningSignal: learnedState.recentLearningSignal,
    learningUpdateCount: learnedState.learningUpdateCount,
    reproductionLearningCount: learnedState.reproductionLearningCount,
    plasticityLearningRateMean: plasticity.learningRateMean,
    plasticityDecayRate: plasticity.experienceDecayRate,
    plasticityMaxLearnedDelta: plasticity.maxLearnedDelta,
    plasticityProfile: { ...spawner.genome.plasticityProfile },
  };
}

export function foodEventToPersistenceFood(event: SpawnerEvent): SpawnerFood {
  const food = event.foodEvent;
  if (!food) throw new Error("Missing food event snapshot");
  return {
    id: food.id,
    creatorSpawnerId: food.creatorSpawnerId,
    creatorLineageId: food.creatorLineageId,
    spawnTick: food.spawnTick,
    resolveTick: food.resolveTick,
    direction: food.direction,
    strength: food.strength,
    horizonTicks: food.horizonTicks,
    entrySignal: food.entrySignal,
    exitSignal: food.exitSignal,
    entryPayoffScale: food.entryPayoffScale,
    payoffScaleWindowTicks: food.payoffScaleWindowTicks,
    payoffScaleSampleStepTicks: food.payoffScaleSampleStepTicks,
    entryPrice: food.entryPrice,
    exitPrice: food.exitPrice,
    sourceTimestamp: food.sourceTimestamp,
    exitSourceTimestamp: food.exitSourceTimestamp,
    traceId: food.traceId,
    payoff: food.payoff,
    status: food.status,
  };
}

export function normalizePersistenceLearnedState(value: unknown) {
  const state = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    connectionDeltas: state.connectionDeltas && typeof state.connectionDeltas === "object" ? (state.connectionDeltas as Record<string, number>) : {},
    outputBiasDeltas: state.outputBiasDeltas && typeof state.outputBiasDeltas === "object" ? (state.outputBiasDeltas as Record<string, number>) : {},
    gateBiasDeltas: state.gateBiasDeltas && typeof state.gateBiasDeltas === "object" ? (state.gateBiasDeltas as Record<string, number>) : {},
    recentLearningSignal: finiteOr(state.recentLearningSignal, 0),
    learningUpdateCount: nonNegativeInteger(state.learningUpdateCount, 0),
    reproductionLearningCount: nonNegativeInteger(state.reproductionLearningCount, 0),
  };
}

export function normalizePersistencePlasticityProfile(profile: unknown): SpawnerPlasticityProfile {
  const source = profile && typeof profile === "object" ? (profile as Partial<SpawnerPlasticityProfile>) : {};
  return {
    weightLearningRate: probability(source.weightLearningRate, 0),
    biasLearningRate: probability(source.biasLearningRate, 0),
    positiveRewardMultiplier: nonNegative(source.positiveRewardMultiplier, 1),
    negativeRewardMultiplier: nonNegative(source.negativeRewardMultiplier, 1),
    reproductionRewardStrength: probability(source.reproductionRewardStrength, 0),
    experienceDecayRate: probability(source.experienceDecayRate, 0),
    maxLearnedDelta: positive(source.maxLearnedDelta, 5),
    eligibilityTraceStrength: probability(source.eligibilityTraceStrength, 1),
    plasticityMutationStdDev: probability(source.plasticityMutationStdDev, 0),
  };
}

export function plasticitySnapshotFromProfile(profile: unknown) {
  const normalized = normalizePersistencePlasticityProfile(profile);
  return {
    profile: normalized,
    learningRateMean: (normalized.weightLearningRate + normalized.biasLearningRate) / 2,
    decayRate: normalized.experienceDecayRate,
    maxLearnedDelta: normalized.maxLearnedDelta,
  };
}
