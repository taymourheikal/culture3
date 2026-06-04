import {
  createSpawnerArchitecturePacket,
  createSpawnerInspectionPacket,
  createSpawnerUniquenessDetailPacket,
  selectRosterSpawners,
} from "../marketWorkerSnapshot";
import type { MarketWorkerSessionId } from "../marketWorkerProtocol";
import { computeSpawnerUniqueness, type SpawnerUniquenessScore } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import type { FoodRuntimeIndex } from "../spawner/runtimeIndex";

export const UNIQUENESS_INTERVAL_TICKS = 250;
export type UniquenessOnDemandResult = {
  score: SpawnerUniquenessScore | null;
  skippedReason?: "population_limit";
  result?: UniquenessComputeResult;
};

export type UniquenessComputeResult =
  | { status: "unchanged"; scores: Map<number, SpawnerUniquenessScore> }
  | { status: "computed"; scores: Map<number, SpawnerUniquenessScore> }
  | { status: "skipped"; reason: "population_limit"; scores: Map<number, SpawnerUniquenessScore> };

type EnsureScoresOptions = {
  force?: boolean;
  requiredSpawnerIds?: number[];
  detailSpawnerId?: number;
  allowIntervalReuse?: boolean;
};

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

  function ensureScores(simulation: MarketSimulationState, options: EnsureScoresOptions = {}): UniquenessComputeResult {
    if (isAbovePopulationLimit(simulation)) {
      scores = new Map();
      lastTick = simulation.world.tick;
      lastSkippedReason = "population_limit";
      return { status: "skipped", reason: "population_limit", scores } satisfies UniquenessComputeResult;
    }

    const requiredSpawnerIds = options.requiredSpawnerIds ?? [];
    const requiredScoreMissing = requiredSpawnerIds.some((spawnerId) => !scores.has(spawnerId));
    const shouldRecoverFromSkip = lastSkippedReason !== undefined;
    const shouldWaitForInterval = options.allowIntervalReuse === true && simulation.world.tick - lastTick < UNIQUENESS_INTERVAL_TICKS;
    const canReuse =
      options.force !== true &&
      !shouldRecoverFromSkip &&
      !requiredScoreMissing &&
      (options.allowIntervalReuse === true ? shouldWaitForInterval : true);
    if (canReuse) {
      return { status: "unchanged", scores } satisfies UniquenessComputeResult;
    }

    scores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick, {
      detailSpawnerId: options.detailSpawnerId,
    });
    lastTick = simulation.world.tick;
    lastSkippedReason = undefined;
    return { status: "computed", scores } satisfies UniquenessComputeResult;
  }

  function computeIfNeeded(simulation: MarketSimulationState, force: boolean) {
    return ensureScores(simulation, { force, allowIntervalReuse: true });
  }

  function ensureRosterScores(simulation: MarketSimulationState, selectedSpawnerId: number | null = null, pendingFoodCounts?: FoodRuntimeIndex["pendingByCreatorId"]) {
    const rosterSpawners = selectRosterSpawners({
      spawners: simulation.world.spawners,
      foods: simulation.world.foods,
      pendingFoodCounts,
      selectedSpawnerId,
    });
    return ensureScores(simulation, { requiredSpawnerIds: rosterSpawners.map((spawner) => spawner.id) });
  }

  function ensureSelectedTelemetryScores(simulation: MarketSimulationState, spawnerId: number | null): UniquenessComputeResult {
    if (spawnerId === null || !simulation.world.spawners.some((spawner) => spawner.id === spawnerId)) {
      return { status: "unchanged", scores } satisfies UniquenessComputeResult;
    }
    return ensureScores(simulation, { force: true, requiredSpawnerIds: [spawnerId] });
  }

  function computeOnDemand(simulation: MarketSimulationState, spawnerId: number): UniquenessOnDemandResult {
    const target = simulation.world.spawners.find((spawner) => spawner.id === spawnerId);
    if (!target) return { score: null };
    const result = ensureScores(simulation, { force: true, requiredSpawnerIds: [spawnerId], detailSpawnerId: spawnerId });
    if (result.status === "skipped") {
      return { score: null, skippedReason: "population_limit", result };
    }
    const score = result.scores.get(spawnerId) ?? null;
    if (score) onDetailedScore(spawnerId, score);
    return { score, result };
  }

  return {
    reset() {
      scores = new Map();
      lastTick = Number.NEGATIVE_INFINITY;
      lastSkippedReason = undefined;
    },

    computeIfNeeded,
    ensureRosterScores,
    ensureSelectedTelemetryScores,
    computeOnDemand,

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
