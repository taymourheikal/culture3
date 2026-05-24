import {
  createSpawnerArchitecturePacket,
  createSpawnerInspectionPacket,
  createSpawnerUniquenessDetailPacket,
  ROSTER_AGENT_LIMIT,
} from "../marketWorkerSnapshot";
import type { MarketWorkerSessionId } from "../marketWorkerProtocol";
import { computeSpawnerUniqueness, type SpawnerUniquenessScore } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";

export const UNIQUENESS_INTERVAL_TICKS = 250;
type UniquenessOnDemandResult = { score: SpawnerUniquenessScore | null; skippedReason?: "population_limit" };

export type UniquenessComputeResult =
  | { status: "unchanged"; scores: Map<number, SpawnerUniquenessScore> }
  | { status: "computed"; scores: Map<number, SpawnerUniquenessScore> }
  | { status: "skipped"; reason: "population_limit"; scores: Map<number, SpawnerUniquenessScore> };

export function createUniquenessInspectionService({
  onDetailedScore,
}: {
  onDetailedScore: (spawnerId: number, score: SpawnerUniquenessScore) => void;
}) {
  let scores = new Map<number, SpawnerUniquenessScore>();
  let lastTick = Number.NEGATIVE_INFINITY;
  let lastSkippedReason: "population_limit" | undefined;

  function isAbovePopulationLimit(simulation: MarketSimulationState) {
    return simulation.world.spawners.length > simulation.world.config.uniquenessPopulationLimit;
  }

  function computeIfNeeded(simulation: MarketSimulationState, force: boolean) {
    if (isAbovePopulationLimit(simulation)) {
      scores = new Map();
      lastTick = simulation.world.tick;
      lastSkippedReason = "population_limit";
      return { status: "skipped", reason: "population_limit", scores } satisfies UniquenessComputeResult;
    }
    const shouldRecoverFromSkip = lastSkippedReason !== undefined;
    if (!force && !shouldRecoverFromSkip && simulation.world.tick - lastTick < UNIQUENESS_INTERVAL_TICKS) {
      return { status: "unchanged", scores } satisfies UniquenessComputeResult;
    }
    scores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
    lastTick = simulation.world.tick;
    lastSkippedReason = undefined;
    return { status: "computed", scores } satisfies UniquenessComputeResult;
  }

  function ensureRosterScores(simulation: MarketSimulationState) {
    const rosterSpawners = simulation.world.spawners.slice(0, ROSTER_AGENT_LIMIT);
    if (rosterSpawners.some((spawner) => !scores.has(spawner.id))) {
      if (isAbovePopulationLimit(simulation)) {
        scores = new Map();
        lastSkippedReason = "population_limit";
      } else {
        scores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
        lastSkippedReason = undefined;
      }
      lastTick = simulation.world.tick;
    }
  }

  function computeOnDemand(simulation: MarketSimulationState, spawnerId: number): UniquenessOnDemandResult {
    const target = simulation.world.spawners.find((spawner) => spawner.id === spawnerId);
    if (!target) return { score: null };
    if (isAbovePopulationLimit(simulation)) {
      scores = new Map();
      lastTick = simulation.world.tick;
      lastSkippedReason = "population_limit";
      return { score: null, skippedReason: "population_limit" };
    }
    const fullScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick, { detailSpawnerId: spawnerId });
    scores = new Map([...scores, ...fullScores]);
    lastTick = simulation.world.tick;
    lastSkippedReason = undefined;
    const score = fullScores.get(spawnerId) ?? null;
    if (score) onDetailedScore(spawnerId, score);
    return { score };
  }

  return {
    reset() {
      scores = new Map();
      lastTick = Number.NEGATIVE_INFINITY;
      lastSkippedReason = undefined;
    },

    computeIfNeeded,
    ensureRosterScores,

    scores() {
      return scores;
    },

    lastTick() {
      return lastTick;
    },

    architecturePacket(sessionId: MarketWorkerSessionId, simulation: MarketSimulationState, spawnerId: number) {
      return createSpawnerArchitecturePacket({
        sessionId,
        spawnerId,
        spawner: simulation.world.spawners.find((spawner) => spawner.id === spawnerId) ?? null,
      });
    },

    inspectionPacket(sessionId: MarketWorkerSessionId, requestId: number, simulation: MarketSimulationState, spawnerId: number) {
      const result = computeOnDemand(simulation, spawnerId);
      return createSpawnerInspectionPacket({
        sessionId,
        requestId,
        simulation,
        spawnerId,
        uniquenessScore: result.score,
      });
    },

    uniquenessDetailPacket(sessionId: MarketWorkerSessionId, simulation: MarketSimulationState, spawnerId: number) {
      const result = computeOnDemand(simulation, spawnerId);
      return createSpawnerUniquenessDetailPacket({
        sessionId,
        spawnerId,
        score: result.score,
        skippedReason: result.skippedReason,
      });
    },
  };
}
