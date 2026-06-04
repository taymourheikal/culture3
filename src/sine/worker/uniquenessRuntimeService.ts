import {
  createSpawnerInspectionPacket,
  createSpawnerUniquenessDetailPacket,
} from "../marketWorkerSnapshot";
import type { MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { FoodRuntimeIndex } from "../spawner/runtimeIndex";
import type { SpawnerUniquenessScore } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import {
  createUniquenessInspectionService,
  type UniquenessComputeResult,
} from "./uniquenessInspectionService";
import { createUniquenessTelemetryService } from "./uniquenessTelemetryService";

export function createUniquenessRuntimeService({
  onDetailedScore,
}: {
  onDetailedScore: (spawnerId: number, score: SpawnerUniquenessScore) => void;
}) {
  const inspection = createUniquenessInspectionService({ onDetailedScore });
  const telemetry = createUniquenessTelemetryService();

  const recordResult = (result: UniquenessComputeResult, simulation: MarketSimulationState) => {
    if (result.status === "computed") telemetry.record(result.scores, simulation.world.tick);
    else if (result.status === "skipped") telemetry.markSkipped(result.reason);
    return result;
  };

  return {
    reset() {
      inspection.reset();
      telemetry.reset();
    },

    computeIfNeeded(simulation: MarketSimulationState, force: boolean) {
      return recordResult(inspection.computeIfNeeded(simulation, force), simulation);
    },

    ensureRosterScores(
      simulation: MarketSimulationState,
      selectedSpawnerId: number | null = null,
      pendingFoodCounts?: FoodRuntimeIndex["pendingByCreatorId"],
    ) {
      return recordResult(inspection.ensureRosterScores(simulation, selectedSpawnerId, pendingFoodCounts), simulation);
    },

    ensureSelectedTelemetryScores(simulation: MarketSimulationState, spawnerId: number | null) {
      return recordResult(inspection.ensureSelectedTelemetryScores(simulation, spawnerId), simulation);
    },

    setSelectedSpawner(spawnerId: number | null) {
      telemetry.setSelectedSpawner(spawnerId);
    },

    selectedSpawnerId() {
      return telemetry.selectedSpawnerId();
    },

    scores() {
      return inspection.scores();
    },

    lastTick() {
      return inspection.lastTick();
    },

    window(renderTick: number) {
      return telemetry.window(renderTick);
    },

    sampleCount() {
      return telemetry.sampleCount();
    },

    architecturePacket(sessionId: MarketWorkerSessionId, simulation: MarketSimulationState, spawnerId: number) {
      return inspection.architecturePacket(sessionId, simulation, spawnerId);
    },

    inspectionPacket(sessionId: MarketWorkerSessionId, requestId: number, simulation: MarketSimulationState, spawnerId: number) {
      const result = inspection.computeOnDemand(simulation, spawnerId);
      if (result.result) recordResult(result.result, simulation);
      return createSpawnerInspectionPacket({
        sessionId,
        requestId,
        simulation,
        spawnerId,
        uniquenessScore: result.score,
      });
    },

    uniquenessDetailPacket(sessionId: MarketWorkerSessionId, simulation: MarketSimulationState, spawnerId: number) {
      const result = inspection.computeOnDemand(simulation, spawnerId);
      if (result.result) recordResult(result.result, simulation);
      return createSpawnerUniquenessDetailPacket({
        sessionId,
        spawnerId,
        score: result.score,
        skippedReason: result.skippedReason,
      });
    },
  };
}
