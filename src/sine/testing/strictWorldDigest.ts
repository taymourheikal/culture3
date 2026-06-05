import type { SpawnerWorld } from "../spawner/types";
import { materializeDecisionTrace } from "../spawner/plasticity";

type NumericRecord = Record<string, number> | Record<number, number>;

export function strictWorldDigest(world: SpawnerWorld | any) {
  return {
    tick: world.tick,
    nextSpawnerId: world.nextSpawnerId,
    nextFoodId: world.nextFoodId,
    nextEventId: world.nextEventId,
    population: world.spawners.length,
    totalResolved: world.totalResolved,
    totalLosses: world.totalLosses,
    cumulativeNetPayoff: world.cumulativeNetPayoff,
    cumulativeLoss: world.cumulativeLoss,
    recentResolvedPayoffs: [...world.recentResolvedPayoffs],
    lineages: Object.values(world.lineages)
      .map((lineage: any) => ({
        id: lineage.id,
        totalBorn: lineage.totalBorn,
        totalDeaths: lineage.totalDeaths,
        founderSpawnerId: lineage.founderSpawnerId,
      }))
      .sort((left, right) => left.id - right.id),
    foods: world.foods.map((food: any) => ({
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
    })),
    spawners: world.spawners.map((spawner: any) => ({
      id: spawner.id,
      lineageId: spawner.lineageId,
      generation: spawner.generation,
      parentId: spawner.parentId,
      birthTick: spawner.birthTick,
      ageTicks: spawner.ageTicks,
      energy: spawner.energy,
      health: spawner.health,
      cooldownTicks: spawner.cooldownTicks,
      spawnedCount: spawner.spawnedCount,
      resolvedCount: spawner.resolvedCount,
      wins: spawner.wins,
      losses: spawner.losses,
      totalPayoff: spawner.totalPayoff,
      recentPayoffs: [...spawner.recentPayoffs],
      lastAction: spawner.lastAction,
      hiddenState: sortedNumericRecord(spawner.hiddenState),
      learnedState: {
        connectionDeltas: sortedNumericRecord(spawner.learnedState.connectionDeltas),
        outputBiasDeltas: sortedNumericRecord(spawner.learnedState.outputBiasDeltas),
        gateBiasDeltas: sortedNumericRecord(spawner.learnedState.gateBiasDeltas),
        recentLearningSignal: spawner.learnedState.recentLearningSignal,
        learningUpdateCount: spawner.learnedState.learningUpdateCount,
        reproductionLearningCount: spawner.learnedState.reproductionLearningCount,
      },
      traces: Object.values(spawner.traceStore.traces).map(strictTraceDigest),
    })),
    recentEvents: world.recentEvents.map((event: any) => ({
      id: event.id,
      kind: event.kind,
      tick: event.tick,
      spawnerId: event.spawnerId,
      lineageId: event.lineageId,
      foodId: event.foodId,
      childSpawnerId: event.childSpawnerId,
      status: event.status,
      payoff: event.payoff,
      deathCause: event.deathCause,
    })),
  };
}

function strictTraceDigest(trace: any) {
  const publicTrace = materializeDecisionTrace(trace);
  return {
    id: publicTrace.id,
    tick: publicTrace.tick,
    action: publicTrace.action,
    strength: publicTrace.strength,
    activeConnectionIds: [...publicTrace.activeConnectionIds],
    connectionActivations: Object.fromEntries(
      Object.entries(publicTrace.connectionActivations)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]: [string, any]) => [key, { source: value.source, target: value.target }]),
    ),
  };
}

function sortedNumericRecord(record: NumericRecord) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}
