import type { MarketWorkerSessionId, SpawnerInspectionPayload } from "./marketWorkerProtocol";
import type { MarketSimulationState } from "./simulationRuntime";
import {
  architectureMetrics,
  normalizeSpawnerGenomeForCurrentContract,
  type SpawnerAgent,
  type SpawnerEvent,
  type SpawnerFood,
  type SpawnerUniquenessScore,
} from "./spawnerSimulation";

export function createLiveSpawnerInspectionPayload({
  sessionId,
  simulation,
  spawner,
  uniquenessScore,
  sourceSessionId = `live-${sessionId}`,
}: {
  sessionId: MarketWorkerSessionId;
  simulation: MarketSimulationState;
  spawner: SpawnerAgent;
  uniquenessScore: SpawnerUniquenessScore | null;
  sourceSessionId?: string;
}): SpawnerInspectionPayload {
  const recentFoods = simulation.world.foods
    .filter((food) => food.creatorSpawnerId === spawner.id)
    .slice(-20)
    .map((food) => ({ ...food }));
  const recentEvents = simulation.world.recentEvents
    .filter((event) => event.spawnerId === spawner.id || event.childSpawnerId === spawner.id)
    .slice(-30)
    .map((event) => ({ ...event }));

  return createSpawnerInspectionPayload({
    source: "live",
    sessionId: sourceSessionId,
    workerSessionId: sessionId,
    spawner,
    tick: simulation.world.tick,
    stateSnapshotTick: simulation.world.tick,
    genomeSnapshotTick: simulation.world.tick,
    exact: true,
    status: "alive",
    uniqueness: uniquenessScore,
    recentFoods,
    recentEvents,
  });
}

export function createSpawnerInspectionPayload({
  source,
  sessionId,
  workerSessionId,
  spawner,
  tick,
  requestedTick,
  stateSnapshotTick,
  genomeSnapshotTick,
  exact,
  status,
  uniqueness,
  recentFoods,
  recentEvents,
}: {
  source: "live" | "historical";
  sessionId: string;
  workerSessionId?: MarketWorkerSessionId;
  spawner: SpawnerAgent;
  tick: number;
  requestedTick?: number;
  stateSnapshotTick?: number | null;
  genomeSnapshotTick?: number | null;
  exact: boolean;
  status: "alive" | "dead" | "historical";
  uniqueness: SpawnerUniquenessScore | null;
  recentFoods: SpawnerFood[];
  recentEvents: SpawnerEvent[];
}): SpawnerInspectionPayload {
  const spawnerSnapshot = structuredClone(spawner);
  spawnerSnapshot.genome = normalizeSpawnerGenomeForCurrentContract(spawnerSnapshot.genome);
  return {
    source,
    sessionId,
    workerSessionId,
    spawnerId: spawnerSnapshot.id,
    tick,
    requestedTick,
    stateSnapshotTick: stateSnapshotTick ?? undefined,
    genomeSnapshotTick: genomeSnapshotTick ?? undefined,
    exact,
    status,
    spawner: spawnerSnapshot,
    genome: spawnerSnapshot.genome,
    hiddenState: spawnerSnapshot.hiddenState,
    metrics: architectureMetrics(spawnerSnapshot.genome),
    uniqueness,
    recentPayoffs: [...(spawnerSnapshot.recentPayoffs ?? [])],
    recentFoods,
    recentEvents,
  };
}
