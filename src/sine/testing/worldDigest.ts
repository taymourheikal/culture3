import type { SpawnerWorld } from "../spawner/types";
import { materializeDecisionTrace } from "../spawner/plasticity";

type NumericRecord = Record<string, number> | Record<number, number>;

export function worldDigest(world: SpawnerWorld | any) {
  return {
    tick: world.tick,
    nextSpawnerId: world.nextSpawnerId,
    nextFoodId: world.nextFoodId,
    nextEventId: world.nextEventId,
    population: world.spawners.length,
    totalResolved: world.totalResolved,
    totalLosses: world.totalLosses,
    cumulativeNetPayoff: roundDigestNumber(world.cumulativeNetPayoff),
    cumulativeLoss: roundDigestNumber(world.cumulativeLoss),
    lineages: Object.values(world.lineages)
      .map((lineage: any): [number, number, number] => [lineage.id, lineage.totalBorn, lineage.totalDeaths])
      .sort((left: [number, number, number], right: [number, number, number]) => left[0] - right[0]),
    foods: world.foods.map((food: any) => [
      food.id,
      food.creatorSpawnerId,
      food.spawnTick,
      food.resolveTick,
      food.status,
      roundDigestNumber(food.payoff ?? 0),
    ]),
    spawners: world.spawners.map((spawner: any) => ({
      id: spawner.id,
      lineageId: spawner.lineageId,
      generation: spawner.generation,
      energy: roundDigestNumber(spawner.energy),
      health: roundDigestNumber(spawner.health),
      hidden: roundedDigestRecord(spawner.hiddenState),
      learned: {
        connectionDeltas: roundedDigestRecord(spawner.learnedState.connectionDeltas),
        outputBiasDeltas: roundedDigestRecord(spawner.learnedState.outputBiasDeltas),
        gateBiasDeltas: roundedDigestRecord(spawner.learnedState.gateBiasDeltas),
        learningUpdateCount: spawner.learnedState.learningUpdateCount,
        reproductionLearningCount: spawner.learnedState.reproductionLearningCount,
      },
      traces: Object.values(spawner.traceStore.traces).map(traceDigest),
    })),
    events: world.recentEvents.map((event: any) => ({
      id: event.id,
      kind: event.kind,
      tick: event.tick,
      spawnerId: event.spawnerId,
      lineageId: event.lineageId,
      foodId: event.foodId,
      childSpawnerId: event.childSpawnerId,
      status: event.status,
      payoff: roundDigestNumber(event.payoff ?? 0),
    })),
  };
}

export function roundedDigestRecord(record: NumericRecord) {
  const entries: Array<[string, number]> = Object.entries(record).map(([key, value]) => [key, roundDigestNumber(value)]);
  entries.sort((left, right) => left[0].localeCompare(right[0]));
  return Object.fromEntries(entries);
}

export function roundDigestNumber(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function traceDigest(trace: any) {
  const publicTrace = materializeDecisionTrace(trace);
  return {
    id: publicTrace.id,
    tick: publicTrace.tick,
    action: publicTrace.action,
    activeConnectionIds: publicTrace.activeConnectionIds,
    connectionActivations: Object.fromEntries(
      Object.entries(publicTrace.connectionActivations).map(([key, value]: [string, any]) => [
        key,
        { source: roundDigestNumber(value.source), target: roundDigestNumber(value.target) },
      ]),
    ),
  };
}
