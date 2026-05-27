import { createMarketChartPacket, createMarketRosterPacket, createMarketStatsPacket, estimatePacketKb } from "../marketWorkerSnapshot";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketSimulationState } from "../simulationRuntime";
import type { SpawnerConfig } from "../spawnerSimulation";
import type { BrainEvaluationMode } from "../protocol/brainEvalProtocol";
import type { MarketRunState, MarketStatsPacket, MarketWorkerMessage, MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { createPersistenceOutbox } from "../persistence/persistenceOutbox";
import type { createPacketScheduler, ScheduledPacketKey } from "./packetScheduler";
import type { createUniquenessInspectionService } from "./uniquenessInspectionService";
import type { createUniquenessTelemetryService } from "./uniquenessTelemetryService";

const PERSISTENCE_STATE_INTERVAL_TICKS = 50;

export type WorkerPacketPosterState = {
  sessionId: MarketWorkerSessionId;
  simulation: MarketSimulationState;
  version: number;
  targetTick: number;
  settings: WaveSettings;
  activeMarketConfig: MarketRuntimeConfig;
  pendingMarketConfig: MarketRuntimeConfig;
  activeSpawnerConfig: SpawnerConfig;
  pendingSpawnerConfig: SpawnerConfig;
  runState: MarketRunState;
  persistentSessionId: string | null;
  backlogTicks: number;
  selectedSpawnerId: number | null;
  brainEvalMode: BrainEvaluationMode;
};

export function createWorkerPacketPoster({
  postMessage,
  getState,
  getPacketSizes,
  setPacketSizes,
  packetScheduler,
  persistenceOutbox,
  uniquenessInspection,
  uniquenessTelemetry,
}: {
  postMessage: (message: MarketWorkerMessage) => void;
  getState: () => WorkerPacketPosterState;
  getPacketSizes: () => MarketStatsPacket["packetSizesKb"];
  setPacketSizes: (packetSizes: MarketStatsPacket["packetSizesKb"]) => void;
  packetScheduler: ReturnType<typeof createPacketScheduler>;
  persistenceOutbox: ReturnType<typeof createPersistenceOutbox>;
  uniquenessInspection: ReturnType<typeof createUniquenessInspectionService>;
  uniquenessTelemetry: ReturnType<typeof createUniquenessTelemetryService>;
}) {
  const recordPacketSize = (key: ScheduledPacketKey, packet: unknown, force: boolean) => {
    if (!packetScheduler.shouldMeasureSize(key, force)) return;
    setPacketSizes({ ...getPacketSizes(), [key]: estimatePacketKb(packet) });
  };

  const postChart = (force: boolean) => {
    if (!packetScheduler.shouldPost("chart", force)) return;
    const state = getState();
    const packet = createMarketChartPacket({
      sessionId: state.sessionId,
      simulation: state.simulation,
      version: state.version,
      centerTick: state.targetTick,
      uniquenessWindow: uniquenessTelemetry.window(state.simulation.world.tick),
    });
    recordPacketSize("chart", packet, force);
    postMessage({ type: "chart", packet });
  };

  const postRoster = (force: boolean) => {
    if (!packetScheduler.shouldPost("roster", force)) return;
    const state = getState();
    uniquenessInspection.ensureRosterScores(state.simulation, state.selectedSpawnerId);
    const packet = createMarketRosterPacket({
      sessionId: state.sessionId,
      simulation: state.simulation,
      version: state.version,
      uniquenessScores: uniquenessInspection.scores(),
      selectedSpawnerId: state.selectedSpawnerId,
    });
    recordPacketSize("roster", packet, force);
    postMessage({ type: "roster", packet });
  };

  const postStats = (force: boolean) => {
    if (!packetScheduler.shouldPost("stats", force)) return;
    const state = getState();
    const packet = createMarketStatsPacket({
      sessionId: state.sessionId,
      simulation: state.simulation,
      settings: state.settings,
      marketConfig: state.activeMarketConfig,
      pendingMarketConfig: state.pendingMarketConfig,
      spawnerConfig: state.activeSpawnerConfig,
      pendingSpawnerConfig: state.pendingSpawnerConfig,
      playing: state.runState === "running",
      runState: state.runState,
      persistentSessionId: state.persistentSessionId,
      version: state.version,
      backlogTicks: state.backlogTicks,
      packetSizesKb: getPacketSizes(),
      brainEvalMode: state.brainEvalMode,
    });
    recordPacketSize("stats", packet, force);
    postMessage({ type: "stats", packet: { ...packet, packetSizesKb: getPacketSizes() } });
  };

  const postPersistence = (force: boolean) => {
    const state = getState();
    if (!state.persistentSessionId || state.runState === "idle") return;
    if (!packetScheduler.shouldPost("persistence", force)) return;
    const delivery = persistenceOutbox.createDelivery({
      force,
      sessionId: state.sessionId,
      persistentSessionId: state.persistentSessionId,
      status: state.runState,
      simulation: state.simulation,
      settings: state.settings,
      marketConfig: state.activeMarketConfig,
      spawnerConfig: state.activeSpawnerConfig,
      uniquenessScores: uniquenessInspection.scores(),
      lastUniquenessTick: uniquenessInspection.lastTick(),
      stateSnapshotIntervalTicks: PERSISTENCE_STATE_INTERVAL_TICKS,
    });
    if (!delivery) return;
    recordPacketSize("persistence", delivery.packet, force);
    postMessage({ type: "persistence", persistencePacketId: delivery.id, packet: delivery.packet });
  };

  const postAllPackets = (force: boolean) => {
    postChart(force);
    postRoster(force);
    postStats(force);
    postPersistence(force);
  };

  const postArchitecture = (spawnerId: number) => {
    const state = getState();
    const packet = uniquenessInspection.architecturePacket(state.sessionId, state.simulation, spawnerId);
    const packetSizeKb = estimatePacketKb(packet);
    setPacketSizes({ ...getPacketSizes(), architecture: packetSizeKb });
    postMessage({ type: "architecture", packet: { ...packet, packetSizeKb } });
    postStats(true);
  };

  const postInspection = (requestId: number, spawnerId: number) => {
    const state = getState();
    const packet = uniquenessInspection.inspectionPacket(state.sessionId, requestId, state.simulation, spawnerId);
    const packetSizeKb = estimatePacketKb(packet);
    setPacketSizes({ ...getPacketSizes(), inspection: packetSizeKb });
    postMessage({ type: "spawnerInspection", packet: { ...packet, packetSizeKb } });
    postStats(true);
  };

  const postUniquenessDetail = (spawnerId: number) => {
    const state = getState();
    const packet = uniquenessInspection.uniquenessDetailPacket(state.sessionId, state.simulation, spawnerId);
    const packetSizeKb = estimatePacketKb(packet);
    setPacketSizes({ ...getPacketSizes(), uniqueness: packetSizeKb });
    postMessage({ type: "uniquenessDetail", packet: { ...packet, packetSizeKb } });
    postStats(true);
  };

  const postError = (error: unknown) => {
    const state = getState();
    postMessage({
      type: "error",
      sessionId: state.sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
  };

  return {
    postAllPackets,
    postChart,
    postRoster,
    postStats,
    postPersistence,
    postArchitecture,
    postInspection,
    postUniquenessDetail,
    postError,
  };
}
