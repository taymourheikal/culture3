import type { SinePersistencePacket, SineSpawnerUniquenessSnapshot } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { MarketSimulationState } from "../simulationRuntime";
import type { SpawnerConfig, SpawnerEvent, SpawnerUniquenessScore } from "../spawnerSimulation";

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
}): SinePersistencePacket {
  const initialBirths = includeInitial
    ? simulation.world.spawners.map((spawner) => ({
        tick: spawner.birthTick,
        spawner: structuredClone(spawner),
      }))
    : [];
  const initialGenomeSnapshots: SinePersistencePacket["genomeSnapshots"] = initialBirths.map((birth) => ({
    tick: birth.tick,
    reason: "initial" as const,
    spawner: structuredClone(birth.spawner),
  }));

  const birthEvents = events.filter((event) => event.kind === "reproduction" && event.childSpawnerSnapshot);
  const births = initialBirths.concat(
    birthEvents.map((event) => ({
      tick: event.tick,
      spawner: structuredClone(event.childSpawnerSnapshot!),
      parentSpawnerId: event.spawnerId,
    })),
  );
  const genomeSnapshots = initialGenomeSnapshots.concat(
    birthEvents.map((event) => ({
      tick: event.tick,
      reason: "birth" as const,
      spawner: structuredClone(event.childSpawnerSnapshot!),
    })),
  );
  const deaths = events
    .filter((event) => event.kind === "death" && event.spawnerSnapshot)
    .map((event) => ({
      tick: event.tick,
      spawner: structuredClone(event.spawnerSnapshot!),
    }));
  const foodEvents = events
    .filter((event) => (event.kind === "spawn" || event.kind === "resolve") && event.foodSnapshot)
    .map((event) => ({
      tick: event.tick,
      kind: event.kind as "spawn" | "resolve",
      food: structuredClone(event.foodSnapshot!),
    }));
  const stateSnapshots = includeStateSnapshot
    ? simulation.world.spawners.map((spawner) => ({
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
      }))
    : [];
  const pendingUniqueness = pendingUniquenessSnapshots.map(({ spawnerId, score }) => ({ spawnerId, ...structuredClone(score) }));
  const fullUniqueness =
    includeFullUniquenessTick !== null
      ? [...uniquenessScores.entries()]
          .filter(([, score]) => score.comparisonTick === includeFullUniquenessTick)
          .map(([spawnerId, score]) => ({ spawnerId, ...structuredClone(score) }))
      : [];

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
    uniquenessSnapshots: dedupeUniquenessSnapshots(pendingUniqueness.concat(fullUniqueness)),
    foodEvents,
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      tick: event.tick,
      spawnerId: event.spawnerId,
      lineageId: event.lineageId,
      foodId: event.foodId,
      childSpawnerId: event.childSpawnerId,
      status: event.status,
      payoff: event.payoff,
    })),
  };
}

function dedupeUniquenessSnapshots(snapshots: SineSpawnerUniquenessSnapshot[]) {
  const byKey = new Map<string, SineSpawnerUniquenessSnapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.spawnerId}:${snapshot.comparisonTick}:${snapshot.version}:${snapshot.vectorVersion}`;
    byKey.set(key, snapshot);
  }
  return [...byKey.values()];
}
