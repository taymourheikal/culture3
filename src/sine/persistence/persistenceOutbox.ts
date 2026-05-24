import type { MarketWorkerSessionId, SinePersistencePacket } from "../marketWorkerProtocol";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketSimulationState } from "../simulationRuntime";
import type { SpawnerConfig, SpawnerEvent, SpawnerUniquenessScore } from "../spawnerSimulation";
import { buildSinePersistencePacket, type PendingUniquenessSnapshot } from "./buildSinePersistencePacket";

type InFlightPersistence = {
  id: number;
  packet: SinePersistencePacket;
  eventIds: number[];
  stateTick: number | null;
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
  let inFlight: InFlightPersistence | null = null;

  return {
    reset() {
      nextPacketId = 1;
      pendingInitial = true;
      pendingEvents = [];
      pendingUniquenessSnapshots = [];
      lastPersistedStateTick = Number.NEGATIVE_INFINITY;
      lastPersistedUniquenessTick = Number.NEGATIVE_INFINITY;
      inFlight = null;
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
        if (!inFlight.needsRetry) return null;
        inFlight.needsRetry = false;
        return { id: inFlight.id, packet: inFlight.packet };
      }

      const shouldSnapshotState =
        force || simulation.world.tick - lastPersistedStateTick >= stateSnapshotIntervalTicks || pendingInitial;
      const shouldSnapshotUniqueness = lastUniquenessTick > lastPersistedUniquenessTick;
      if (
        !pendingInitial &&
        pendingEvents.length === 0 &&
        !shouldSnapshotState &&
        pendingUniquenessSnapshots.length === 0 &&
        !shouldSnapshotUniqueness
      ) {
        return null;
      }

      const pendingUniquenessCount = pendingUniquenessSnapshots.length;
      const packet = buildSinePersistencePacket({
        sessionId,
        persistentSessionId,
        status,
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
      });
      const id = nextPacketId;
      nextPacketId += 1;
      inFlight = {
        id,
        packet,
        eventIds: pendingEvents.map((event) => event.id),
        stateTick: shouldSnapshotState ? simulation.world.tick : null,
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
