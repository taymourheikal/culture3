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
import { createPacketPostPolicy, type UiPacketKey } from "./packetPostPolicy";
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
  const uiPolicy = createPacketPostPolicy();
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

  const uiPacketSignature = (key: UiPacketKey, state: WorkerPacketPosterState) => {
    const chartRenderTick = Math.max(0, Math.min(state.targetTick, state.simulation.timeline.tick, state.simulation.world.tick));
    const statsRenderTick = Math.min(state.simulation.timeline.tick, state.simulation.world.tick);
    const parts = [
      state.sessionId,
      state.runState,
      state.version,
      state.simulation.world.tick,
      state.simulation.timeline.tick,
      key === "chart" ? chartRenderTick : statsRenderTick,
      state.selectedSpawnerId ?? "none",
      state.backlogTicks,
      state.persistentSessionId ?? "none",
    ];
    if (key === "stats") {
      parts.push(JSON.stringify(getPacketSizes()));
      parts.push(JSON.stringify(persistenceOutbox.diagnostics()));
    }
    return parts.join(":");
  };

  const postChart = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    const state = getState();
    const signature = uiPacketSignature("chart", state);
    if (!shouldPostUiPacket("chart", force, state, signature)) return;
    emitChart(force, signature, getContext ?? (() => createContext(state)));
  };

  const postRoster = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    const state = getState();
    const signature = uiPacketSignature("roster", state);
    if (!shouldPostUiPacket("roster", force, state, signature)) return;
    emitRoster(force, signature, getContext ?? (() => createContext(state)));
  };

  const postStats = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
    const state = getState();
    const signature = uiPacketSignature("stats", state);
    if (!shouldPostUiPacket("stats", force, state, signature)) return;
    emitStats(force, signature, getContext ?? (() => createContext(state)));
  };

  const postPersistencePacket = (force: boolean, getContext?: PacketRuntimeContextProvider) => {
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

  const postUiPackets = (force: boolean) => {
    const state = getState();
    const allowed = {
      chart: shouldPostUiPacket("chart", force, state, uiPacketSignature("chart", state)),
      roster: shouldPostUiPacket("roster", force, state, uiPacketSignature("roster", state)),
      stats: shouldPostUiPacket("stats", force, state, uiPacketSignature("stats", state)),
    };
    if (!allowed.chart && !allowed.roster && !allowed.stats) return;

    let context: PacketRuntimeContext | undefined;
    const getContext = () => {
      context ??= createContext();
      return context;
    };
    getContext().prepareForPacketBatch();
    if (allowed.chart) emitChart(force, uiPacketSignature("chart", state), getContext);
    if (allowed.roster) emitRoster(force, uiPacketSignature("roster", state), getContext);
    if (allowed.stats) emitStats(force, uiPacketSignature("stats", state), getContext);
  };

  const postAllPackets = (force: boolean) => {
    postUiPackets(force);
    postPersistencePacket(force);
  };

  function shouldPostUiPacket(key: UiPacketKey, force: boolean, state: WorkerPacketPosterState, signature: string) {
    if (force) {
      packetScheduler.shouldPost(key, true);
      return true;
    }
    return uiPolicy.shouldPost({
      key,
      force,
      runState: state.runState,
      signature,
      cadenceDue: () => packetScheduler.shouldPost(key, false),
    });
  }

  function emitChart(force: boolean, signature: string, getContext: PacketRuntimeContextProvider) {
    const packetContext = getContext();
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
    uiPolicy.recordPost({ key: "chart", value: signature });
  }

  function emitRoster(force: boolean, signature: string, getContext: PacketRuntimeContextProvider) {
    const packetContext = getContext();
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
    uiPolicy.recordPost({ key: "roster", value: signature });
  }

  function emitStats(force: boolean, signature: string, getContext: PacketRuntimeContextProvider) {
    const packetContext = getContext();
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
      persistenceOutbox: persistenceOutbox.diagnostics(),
      brainEvalMode: state.brainEvalMode,
      renderTick: packetContext.statsRenderTick,
      currentSample: packetContext.statsCurrentSample(),
      foodIndex: packetContext.foodIndex(),
    });
    recordPacketSize("stats", packet, force);
    postMessage({ type: "stats", packet: { ...packet, packetSizesKb: getPacketSizes() } });
    uiPolicy.recordPost({ key: "stats", value: uiPacketSignature("stats", state) || signature });
  }

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
    postUiPackets,
    postChart,
    postRoster,
    postStats,
    postPersistencePacket,
    postArchitecture,
    postInspection,
    postUniquenessDetail,
    postError,
  };
}
