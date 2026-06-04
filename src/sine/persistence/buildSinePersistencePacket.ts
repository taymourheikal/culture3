import type { SinePersistencePacket, SineSpawnerUniquenessSnapshot } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { MarketSimulationState } from "../simulationRuntime";
import type { SpawnerAgent, SpawnerConfig, SpawnerEvent, SpawnerUniquenessScore } from "../spawnerSimulation";
import {
  birthSnapshotFromSpawner,
  deathSnapshotFromSpawner,
  foodEventToPersistenceFood,
  genomeSnapshotFromSpawner,
  stateSnapshotFromSpawner,
} from "./sinePersistenceDtos";

export type PendingUniquenessSnapshot = {
  spawnerId: number;
  score: SpawnerUniquenessScore;
};

export function buildSinePersistencePacket({
  sessionId,
  persistentSessionId,
  status = "running",
  simulation,
  settings,
  marketConfig,
  spawnerConfig,
  events,
  includeInitial,
  includeStateSnapshot,
  pendingUniquenessSnapshots,
  uniquenessScores,
  includeFullUniquenessTick,
  initialSpawners,
}: {
  sessionId: MarketWorkerSessionId;
  persistentSessionId: string;
  status?: SinePersistencePacket["status"];
  simulation: MarketSimulationState;
  settings: WaveSettings;
  marketConfig?: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  events: SpawnerEvent[];
  includeInitial: boolean;
  includeStateSnapshot: boolean;
  pendingUniquenessSnapshots: PendingUniquenessSnapshot[];
  uniquenessScores: Map<number, SpawnerUniquenessScore>;
  includeFullUniquenessTick: number | null;
  initialSpawners?: SpawnerAgent[];
}): SinePersistencePacket {
  const births = buildBirthSnapshots(simulation, events, includeInitial, initialSpawners);
  const genomeSnapshots = buildGenomeSnapshots(simulation, events, includeInitial, initialSpawners);
  const deaths = events
    .filter((event) => event.kind === "death" && event.spawnerSnapshot)
    .map((event) => {
      const thresholds = {
        deathEnergy: event.deathEnergyThreshold ?? spawnerConfig.deathEnergy,
        deathHealth: event.deathHealthThreshold ?? spawnerConfig.deathHealth,
      };
      const snapshot = deathSnapshotFromSpawner(event.tick, event.spawnerSnapshot!, thresholds);
      return {
        ...snapshot,
        deathCause: event.deathCause ?? snapshot.deathCause,
        deathEnergyThreshold: event.deathEnergyThreshold ?? snapshot.deathEnergyThreshold,
        deathHealthThreshold: event.deathHealthThreshold ?? snapshot.deathHealthThreshold,
      };
    });
  const foodEvents = buildFoodEventSnapshots(events);
  const stateSnapshots = buildStateSnapshots(simulation, includeStateSnapshot);
  const eventRows = buildEventRows(events);
  const uniquenessSnapshots = buildUniquenessSnapshots(pendingUniquenessSnapshots, uniquenessScores, includeFullUniquenessTick);

  return {
    sessionId,
    persistentSessionId,
    status,
    tick: simulation.world.tick,
    settings,
    marketConfig,
    spawnerConfig,
    births,
    deaths,
    genomeSnapshots,
    stateSnapshots,
    uniquenessSnapshots,
    foodEvents,
    events: eventRows,
  };
}

export function buildBirthSnapshots(
  simulation: MarketSimulationState,
  events: SpawnerEvent[],
  includeInitial: boolean,
  initialSpawners = simulation.world.spawners,
): SinePersistencePacket["births"] {
  const initialBirths = includeInitial
    ? initialSpawners.map((spawner) => birthSnapshotFromSpawner(spawner.birthTick, spawner))
    : [];
  return initialBirths.concat(
    events
      .filter((event) => event.kind === "reproduction" && event.childSpawnerSnapshot)
      .map((event) => birthSnapshotFromSpawner(event.tick, event.childSpawnerSnapshot!, event.spawnerId)),
  );
}

export function buildGenomeSnapshots(
  simulation: MarketSimulationState,
  events: SpawnerEvent[],
  includeInitial: boolean,
  initialSpawners = simulation.world.spawners,
): SinePersistencePacket["genomeSnapshots"] {
  const initialGenomeSnapshots: SinePersistencePacket["genomeSnapshots"] = includeInitial
    ? initialSpawners.map((spawner) => genomeSnapshotFromSpawner(spawner.birthTick, "initial", spawner))
    : [];
  return initialGenomeSnapshots.concat(
    events
      .filter((event) => event.kind === "reproduction" && event.childSpawnerSnapshot)
      .map((event) => genomeSnapshotFromSpawner(event.tick, "birth", event.childSpawnerSnapshot!)),
  );
}

export function buildStateSnapshots(simulation: MarketSimulationState, includeStateSnapshot: boolean): SinePersistencePacket["stateSnapshots"] {
  if (!includeStateSnapshot) return [];
  return simulation.world.spawners.map((spawner) => stateSnapshotFromSpawner(simulation, spawner));
}

export function buildFoodEventSnapshots(events: SpawnerEvent[]): SinePersistencePacket["foodEvents"] {
  return events
    .filter((event) => (event.kind === "spawn" || event.kind === "resolve") && event.foodEvent)
    .map((event) => ({
      tick: event.tick,
      kind: event.kind as "spawn" | "resolve",
      food: foodEventToPersistenceFood(event),
    }));
}

export function buildEventRows(events: SpawnerEvent[]): SinePersistencePacket["events"] {
  return events.map((event) => ({
    id: event.id,
    kind: event.kind,
    tick: event.tick,
    spawnerId: event.spawnerId,
    lineageId: event.lineageId,
    foodId: event.foodId,
    childSpawnerId: event.childSpawnerId,
    status: event.status,
    payoff: event.payoff,
  }));
}

function buildUniquenessSnapshots(
  pendingUniquenessSnapshots: PendingUniquenessSnapshot[],
  uniquenessScores: Map<number, SpawnerUniquenessScore>,
  includeFullUniquenessTick: number | null,
) {
  const pendingUniqueness = pendingUniquenessSnapshots.map(({ spawnerId, score }) => ({ spawnerId, ...cloneUniquenessScore(score) }));
  const fullUniqueness =
    includeFullUniquenessTick !== null
      ? [...uniquenessScores.entries()]
          .filter(([, score]) => score.comparisonTick === includeFullUniquenessTick)
          .map(([spawnerId, score]) => ({ spawnerId, ...cloneUniquenessScore(score) }))
      : [];
  return dedupeUniquenessSnapshots(pendingUniqueness.concat(fullUniqueness));
}

function cloneUniquenessScore(score: SpawnerUniquenessScore): SpawnerUniquenessScore {
  return {
    ...score,
    nearestNeighborIds: [...score.nearestNeighborIds],
    mostSimilarFeatures: score.mostSimilarFeatures.map((feature) => ({ ...feature })),
    mostDissimilarFeatures: score.mostDissimilarFeatures.map((feature) => ({ ...feature })),
  };
}

export function dedupeUniquenessSnapshots(snapshots: SineSpawnerUniquenessSnapshot[]) {
  const byKey = new Map<string, SineSpawnerUniquenessSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.spawnerId}:${snapshot.comparisonTick}:${snapshot.version}:${snapshot.vectorVersion}`;
    byKey.set(key, snapshot);
  }
  return [...byKey.values()];
}
