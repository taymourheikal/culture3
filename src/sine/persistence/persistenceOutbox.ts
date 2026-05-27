import type { MarketWorkerSessionId, SinePersistencePacket } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketSimulationState } from "../simulationRuntime";
import type { SpawnerAgent, SpawnerConfig, SpawnerEvent, SpawnerUniquenessScore } from "../spawnerSimulation";
import { buildSinePersistencePacket, type PendingUniquenessSnapshot } from "./buildSinePersistencePacket";

type InFlightPersistence = {
  id: number;
  packet: SinePersistencePacket;
  eventIds: number[];
  stateTick: number | null;
  status: SinePersistencePacket["status"];
  initialIncluded: boolean;
  pendingUniquenessCount: number;
  fullUniquenessTick: number | null;
  needsRetry: boolean;
};

export type PersistenceDelivery = {
  id: number;
  packet: SinePersistencePacket;
};

export function createPersistenceOutbox() {
  let nextPacketId = 1;
  let pendingInitial = true;
  let pendingEvents: SpawnerEvent[] = [];
  let pendingUniquenessSnapshots: PendingUniquenessSnapshot[] = [];
  let lastPersistedStateTick = Number.NEGATIVE_INFINITY;
  let lastPersistedUniquenessTick = Number.NEGATIVE_INFINITY;
  let pendingStatus: SinePersistencePacket["status"] | null = null;
  let inFlight: InFlightPersistence | null = null;
  let initialSpawners: SpawnerAgent[] | null = null;

  return {
    reset() {
      nextPacketId = 1;
      pendingInitial = true;
      pendingEvents = [];
      pendingUniquenessSnapshots = [];
      lastPersistedStateTick = Number.NEGATIVE_INFINITY;
      lastPersistedUniquenessTick = Number.NEGATIVE_INFINITY;
      pendingStatus = null;
      inFlight = null;
      initialSpawners = null;
    },

    captureInitialSpawners(simulation: MarketSimulationState) {
      initialSpawners = simulation.world.spawners.map((spawner) => structuredClone(spawner));
    },

    enqueueEvent(event: SpawnerEvent) {
      pendingEvents.push(structuredClone(event));
    },

    enqueueUniqueness(spawnerId: number, score: SpawnerUniquenessScore) {
      pendingUniquenessSnapshots.push({ spawnerId, score });
    },

    createDelivery({
      force,
      sessionId,
      persistentSessionId,
      status = "running",
      simulation,
      settings,
      marketConfig,
      spawnerConfig,
      uniquenessScores,
      lastUniquenessTick,
      stateSnapshotIntervalTicks,
    }: {
      force: boolean;
      sessionId: MarketWorkerSessionId;
      persistentSessionId: string;
      status?: SinePersistencePacket["status"];
      simulation: MarketSimulationState;
      settings: WaveSettings;
      marketConfig?: MarketRuntimeConfig;
      spawnerConfig: SpawnerConfig;
      uniquenessScores: Map<number, SpawnerUniquenessScore>;
      lastUniquenessTick: number;
      stateSnapshotIntervalTicks: number;
    }): PersistenceDelivery | null {
      if (inFlight) {
        if (force || status !== "running" || pendingStatus !== null) pendingStatus = mergePendingStatus(pendingStatus, status);
        if (!inFlight.needsRetry) return null;
        inFlight.needsRetry = false;
        return { id: inFlight.id, packet: inFlight.packet };
      }

      const statusToSend = pendingStatus ?? status;
      const shouldSnapshotState =
        force || simulation.world.tick - lastPersistedStateTick >= stateSnapshotIntervalTicks || pendingInitial;
      const shouldSnapshotUniqueness = lastUniquenessTick > lastPersistedUniquenessTick;
      if (
        pendingStatus === null &&
        !pendingInitial &&
        pendingEvents.length === 0 &&
        !shouldSnapshotState &&
        pendingUniquenessSnapshots.length === 0 &&
        !shouldSnapshotUniqueness
      ) {
        return null;
      }

      const pendingUniquenessCount = pendingUniquenessSnapshots.length;
      if (pendingInitial && initialSpawners === null) {
        initialSpawners = simulation.world.spawners.map((spawner) => structuredClone(spawner));
      }
      const packet = buildSinePersistencePacket({
        sessionId,
        persistentSessionId,
        status: statusToSend,
        simulation,
        settings,
        marketConfig,
        spawnerConfig,
        events: pendingEvents,
        includeInitial: pendingInitial,
        includeStateSnapshot: shouldSnapshotState,
        pendingUniquenessSnapshots,
        uniquenessScores,
        includeFullUniquenessTick: shouldSnapshotUniqueness ? lastUniquenessTick : null,
        initialSpawners: initialSpawners ?? undefined,
      });
      const id = nextPacketId;
      nextPacketId += 1;
      inFlight = {
        id,
        packet,
        eventIds: pendingEvents.map((event) => event.id),
        stateTick: shouldSnapshotState ? simulation.world.tick : null,
        status: statusToSend,
        initialIncluded: pendingInitial,
        pendingUniquenessCount,
        fullUniquenessTick: shouldSnapshotUniqueness ? lastUniquenessTick : null,
        needsRetry: false,
      };
      return { id, packet };
    },

    acknowledge(packetId: number, ok: boolean) {
      if (!inFlight || inFlight.id !== packetId) return false;
      if (ok) {
        const sentEventIds = new Set(inFlight.eventIds);
        pendingEvents = pendingEvents.filter((event) => !sentEventIds.has(event.id));
        if (inFlight.stateTick !== null) lastPersistedStateTick = Math.max(lastPersistedStateTick, inFlight.stateTick);
        if (inFlight.initialIncluded) pendingInitial = false;
        if (pendingStatus === inFlight.status) pendingStatus = null;
        if (inFlight.pendingUniquenessCount > 0) pendingUniquenessSnapshots.splice(0, inFlight.pendingUniquenessCount);
        if (inFlight.fullUniquenessTick !== null) {
          lastPersistedUniquenessTick = Math.max(lastPersistedUniquenessTick, inFlight.fullUniquenessTick);
        }
        inFlight = null;
      } else {
        inFlight.needsRetry = true;
      }
      return true;
    },
  };
}

function mergePendingStatus(
  current: SinePersistencePacket["status"] | null,
  next: SinePersistencePacket["status"],
): SinePersistencePacket["status"] {
  if (current === "stopped" || next === "stopped") return "stopped";
  return next;
}
