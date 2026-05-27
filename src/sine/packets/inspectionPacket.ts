import type {
  SpawnerArchitecturePacket,
  SpawnerInspectionPayload,
  SpawnerInspectionPacket,
  SpawnerUniquenessDetailPacket,
  MarketWorkerSessionId,
} from "../marketWorkerProtocol";
import { createLiveSpawnerInspectionPayload } from "../spawnerInspectionPayload";
import { normalizeSpawnerGenomeForCurrentContract, type SpawnerAgent, type SpawnerUniquenessScore } from "../spawnerSimulation";
import { createSpawnerSnapshot } from "../spawner/snapshots";
import type { MarketSimulationState } from "../simulationRuntime";

export function createSpawnerArchitecturePacket({
  sessionId,
  spawnerId,
  spawner,
}: {
  sessionId: MarketWorkerSessionId;
  spawnerId: number;
  spawner: SpawnerAgent | null;
}): SpawnerArchitecturePacket {
  return {
    sessionId,
    spawnerId,
    spawner: spawner ? createSpawnerSnapshot({ ...spawner, genome: normalizeSpawnerGenomeForCurrentContract(spawner.genome) }) : null,
  };
}

export function createSpawnerInspectionPacket({
  sessionId,
  requestId,
  simulation,
  spawnerId,
  uniquenessScore,
}: {
  sessionId: MarketWorkerSessionId;
  requestId: number;
  simulation: MarketSimulationState;
  spawnerId: number;
  uniquenessScore: SpawnerUniquenessScore | null;
}): SpawnerInspectionPacket {
  const spawner = simulation.world.spawners.find((candidate) => candidate.id === spawnerId) ?? null;
  const payload = spawner ? createSpawnerInspectionPayload({ sessionId, simulation, spawner, uniquenessScore }) : null;
  return {
    sessionId,
    requestId,
    spawnerId,
    ok: payload !== null,
    payload,
    error: payload === null ? "not_found" : undefined,
  };
}

export function createSpawnerInspectionPayload({
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
  return createLiveSpawnerInspectionPayload({ sessionId, simulation, spawner, uniquenessScore, sourceSessionId });
}

export function createSpawnerUniquenessDetailPacket({
  sessionId,
  spawnerId,
  score,
  skippedReason,
}: {
  sessionId: MarketWorkerSessionId;
  spawnerId: number;
  score: SpawnerUniquenessScore | null;
  skippedReason?: SpawnerUniquenessDetailPacket["skippedReason"];
}): SpawnerUniquenessDetailPacket {
  return {
    sessionId,
    spawnerId,
    score,
    skippedReason,
  };
}
