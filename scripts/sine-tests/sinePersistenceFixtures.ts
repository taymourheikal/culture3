import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerAgent, type SpawnerUniquenessScore } from "../../src/sine/spawnerSimulation";
import type { createSimulationState } from "../../src/sine/simulationRuntime";

export function stateSnapshotFor(spawner: SpawnerAgent, tick: number) {
  return {
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    generation: spawner.generation,
    tick,
    energy: spawner.energy,
    health: spawner.health,
    age: spawner.ageTicks,
    cooldown: spawner.cooldownTicks,
    hiddenState: spawner.hiddenState,
    lastAction: spawner.lastAction,
    spawnedCount: spawner.spawnedCount,
    resolvedCount: spawner.resolvedCount,
    wins: spawner.wins,
    losses: spawner.losses,
    totalPayoff: spawner.totalPayoff,
    children: spawner.children,
    recentPayoffs: spawner.recentPayoffs,
  };
}

export function resolvedFoodEvent(kind: "spawn" | "resolve", tick: number, spawner: SpawnerAgent, id: number, payoff: number) {
  return {
    kind,
    tick,
    time: tick,
    food: {
      id,
      creatorSpawnerId: spawner.id,
      creatorLineageId: spawner.lineageId,
      spawnTick: Math.max(0, tick - 1),
      resolveTick: kind === "resolve" ? tick : undefined,
      payoff: kind === "resolve" ? payoff : undefined,
      status: kind === "resolve" ? (payoff > 0 ? "win" : "loss") : "pending",
      direction: "long",
      strength: 1,
      horizonTicks: 1,
    },
  };
}

export function tradeEventsForAgent(spawner: SpawnerAgent, startId: number, count: number, tick: number, payoffForIndex: (index: number) => number) {
  return Array.from({ length: count }, (_, index) => resolvedFoodEvent("resolve", tick, spawner, startId + index, payoffForIndex(index)));
}

export function persistenceBatchForSpawner(
  sessionId: string,
  simulation: ReturnType<typeof createSimulationState>,
  spawner: SpawnerAgent,
  uniqueness: SpawnerUniquenessScore,
  includeSpawnerRows = true,
) {
  return {
    persistentSessionId: sessionId,
    tick: simulation.world.tick,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    births: includeSpawnerRows ? [{ tick: spawner.birthTick, spawner }] : [],
    deaths: [],
    genomeSnapshots: includeSpawnerRows ? [{ tick: spawner.birthTick, reason: "initial", spawner }] : [],
    stateSnapshots: includeSpawnerRows ? [stateSnapshotFor(spawner, simulation.world.tick)] : [],
    uniquenessSnapshots: [{ spawnerId: spawner.id, ...uniqueness }],
    foodEvents: [],
    events: [],
  };
}
