import { createMarketChartPacket, createMarketRosterPacket, createMarketStatsPacket, estimatePacketKb } from "../marketWorkerSnapshot";
import type { WaveSettings } from "../marketSignal";
import type { MarketRuntimeConfig } from "../marketRuntimeConfig";
import type { MarketSimulationState } from "../simulationRuntime";
import type { SpawnerConfig } from "../spawnerSimulation";
import type { BrainEvaluationMode } from "../protocol/brainEvalProtocol";
import type { MarketRunState, MarketStatsPacket, MarketWorkerMessage, MarketWorkerSessionId } from "../marketWorkerProtocol";
import type { createPersistenceOutbox } from "../persistence/persistenceOutbox";
import type { createPacketScheduler, ScheduledPacketKey } from "./packetScheduler";
import { createPacketRuntimeContext, type PacketRuntimeContext } from "./packetRuntimeContext";
import type { createSelectedSpawnerTimelineService } from "./selectedSpawnerTimelineService";
import type { createStrategyMapService } from "./strategyMapService";
import type { createUniquenessRuntimeService } from "./uniquenessRuntimeService";

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
  uniquenessRuntime,
  strategyMap,
  selectedSpawnerTimeline,
}: {
  postMessage: (message: MarketWorkerMessage) => void;
  getState: () => WorkerPacketPosterState;
  getPacketSizes: () => MarketStatsPacket["packetSizesKb"];
  setPacketSizes: (packetSizes: MarketStatsPacket["packetSizesKb"]) => void;
  packetScheduler: ReturnType<typeof createPacketScheduler>;
  persistenceOutbox: ReturnType<typeof createPersistenceOutbox>;
  uniquenessRuntime: ReturnType<typeof createUniquenessRuntimeService>;
  strategyMap: ReturnType<typeof createStrategyMapService>;
  selectedSpawnerTimeline: ReturnType<typeof createSelectedSpawnerTimelineService>;
}) {
  const recordPacketSize = (key: ScheduledPacketKey, packet: unknown, force: boolean) => {
    if (!packetScheduler.shouldMeasureSize(key, force)) return;
    setPacketSizes({ ...getPacketSizes(), [key]: estimatePacketKb(packet) });
  };

  type PacketRuntimeContextProvider = () => PacketRuntimeContext;

  const createContext = (state = getState()) =>
    createPacketRuntimeContext({
      state,
      uniquenessRuntime,
      strategyMap,
      selectedSpawnerTimeline,
    });

  const postChart = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    if (!packetScheduler.shouldPost("chart", force)) return;
    const packetContext = getContext?.() ?? createContext();
    const state = packetContext.state;
    const packet = createMarketChartPacket({
      sessionId: state.sessionId,
      simulation: state.simulation,
      version: state.version,
      centerTick: state.targetTick,
      renderTick: packetContext.chartRenderTick,
      currentSample: packetContext.chartCurrentSample(),
      uniquenessWindow: packetContext.uniquenessWindow(),
      selectedSpawnerTimeline: packetContext.selectedSpawnerTimeline(),
      strategyMap: packetContext.strategyMapWindow(),
    });
    recordPacketSize("chart", packet, force);
    postMessage({ type: "chart", packet });
  };

  const postRoster = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    if (!packetScheduler.shouldPost("roster", force)) return;
    const packetContext = getContext?.() ?? createContext();
    const state = packetContext.state;
    const uniquenessScores = packetContext.ensureRosterUniquenessScores();
    const packet = createMarketRosterPacket({
      sessionId: state.sessionId,
      simulation: state.simulation,
      version: state.version,
      uniquenessScores,
      selectedSpawnerId: state.selectedSpawnerId,
      foodIndex: packetContext.foodIndex(),
    });
    recordPacketSize("roster", packet, force);
    postMessage({ type: "roster", packet });
  };

  const postStats = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    if (!packetScheduler.shouldPost("stats", force)) return;
    const packetContext = getContext?.() ?? createContext();
    const state = packetContext.state;
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
      renderTick: packetContext.statsRenderTick,
      currentSample: packetContext.statsCurrentSample(),
      foodIndex: packetContext.foodIndex(),
    });
    recordPacketSize("stats", packet, force);
    postMessage({ type: "stats", packet: { ...packet, packetSizesKb: getPacketSizes() } });
  };

  const postPersistence = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    const initialState = getState();
    if (!initialState.persistentSessionId || initialState.runState === "idle") return;
    if (!packetScheduler.shouldPost("persistence", force)) return;
    const packetContext = getContext?.() ?? createContext(initialState);
    const state = packetContext.state;
    const persistentSessionId = state.persistentSessionId;
    const status = state.runState;
    if (!persistentSessionId || status === "idle") return;
    const delivery = persistenceOutbox.createDelivery({
      force,
      sessionId: state.sessionId,
      persistentSessionId,
      status,
      simulation: state.simulation,
      settings: state.settings,
      marketConfig: state.activeMarketConfig,
      spawnerConfig: state.activeSpawnerConfig,
      uniquenessScores: packetContext.uniquenessScores(),
      lastUniquenessTick: packetContext.lastUniquenessTick(),
      stateSnapshotIntervalTicks: PERSISTENCE_STATE_INTERVAL_TICKS,
    });
    if (!delivery) return;
    recordPacketSize("persistence", delivery.packet, force);
    postMessage({ type: "persistence", persistencePacketId: delivery.id, packet: delivery.packet });
  };

  const postAllPackets = (force: boolean) => {
    let context: PacketRuntimeContext | undefined;
    const getContext = () => {
      context ??= createContext();
      return context;
    };
    getContext().prepareForPacketBatch();
    postChart(force, getContext);
    postRoster(force, getContext);
    postStats(force, getContext);
    postPersistence(force, getContext);
  };

  const postArchitecture = (spawnerId: number) => {
    const state = getState();
    const packet = uniquenessRuntime.architecturePacket(state.sessionId, state.simulation, spawnerId);
    const packetSizeKb = estimatePacketKb(packet);
    setPacketSizes({ ...getPacketSizes(), architecture: packetSizeKb });
    postMessage({ type: "architecture", packet: { ...packet, packetSizeKb } });
    postStats(true);
  };

  const postInspection = (requestId: number, spawnerId: number) => {
    const state = getState();
    const packet = uniquenessRuntime.inspectionPacket(state.sessionId, requestId, state.simulation, spawnerId);
    const packetSizeKb = estimatePacketKb(packet);
    setPacketSizes({ ...getPacketSizes(), inspection: packetSizeKb });
    postMessage({ type: "spawnerInspection", packet: { ...packet, packetSizeKb } });
    postStats(true);
  };

  const postUniquenessDetail = (spawnerId: number) => {
    const state = getState();
    const packet = uniquenessRuntime.uniquenessDetailPacket(state.sessionId, state.simulation, spawnerId);
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
