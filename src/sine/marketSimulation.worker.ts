import { appendMarketCandles, applyTimelineSettings, candleBufferRemaining, latestLoadedCandle } from "./marketTimeline";
import {
  createMarketChartPacket,
  createMarketRosterPacket,
  createMarketStatsPacket,
  estimatePacketKb,
} from "./marketWorkerSnapshot";
import { sanitizeSettings } from "./settingsStorage";
import { sanitizeSpawnerConfig } from "./spawnerSettingsStorage";
import { createPersistenceOutbox } from "./persistence/persistenceOutbox";
import { createPacketScheduler } from "./worker/packetScheduler";
import { createUniquenessInspectionService } from "./worker/uniquenessInspectionService";
import { createUniquenessTelemetryService } from "./worker/uniquenessTelemetryService";
import { fetchMarketCandles } from "./worker/marketDataLoader";
import { dispatchMarketWorkerCommand } from "./worker/marketWorkerCommandHandler";
import {
  advanceSimulationToTarget,
  createCandleSimulationState,
  createSimulationState,
  type MarketSimulationState,
} from "./simulationRuntime";
import type { WaveSettings } from "./marketSignal";
import { INITIAL_SETTINGS } from "./marketSignal";
import {
  INITIAL_MARKET_RUNTIME_CONFIG,
  isBtcSource,
  sameMarketRuntimeConfig,
  sanitizeMarketRuntimeConfig,
  type MarketRuntimeConfig,
} from "./marketRuntimeConfig";
import type {
  MarketRunState,
  MarketStatsPacket,
  MarketWorkerCommand,
  MarketWorkerMessage,
  MarketWorkerSessionId,
} from "./marketWorkerProtocol";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig } from "./spawnerSimulation";

const WORKER_LOOP_INTERVAL_MS = 16;
const SIMULATION_LOOP_BUDGET_MS = 6;
const PERSISTENCE_STATE_INTERVAL_TICKS = 50;

let sessionId: MarketWorkerSessionId = 1;
let pendingMarketConfig: MarketRuntimeConfig = sanitizeMarketRuntimeConfig(INITIAL_MARKET_RUNTIME_CONFIG);
let activeMarketConfig: MarketRuntimeConfig = sanitizeMarketRuntimeConfig(INITIAL_MARKET_RUNTIME_CONFIG);
let settings: WaveSettings = sanitizeSettings(INITIAL_SETTINGS);
let pendingSpawnerConfig: SpawnerConfig = sanitizeSpawnerConfig(DEFAULT_SPAWNER_CONFIG);
let activeSpawnerConfig: SpawnerConfig = sanitizeSpawnerConfig(DEFAULT_SPAWNER_CONFIG);
let simulation: MarketSimulationState = createSimulationState(activeMarketConfig, activeSpawnerConfig);
let runState: MarketRunState = "idle";
let version = 0;
let backlogTicks = 0;
let targetTick = 0;
let lastLoopTime = performance.now();
let persistentSessionId: string | null = null;
const packetScheduler = createPacketScheduler();
const persistenceOutbox = createPersistenceOutbox();
const uniquenessInspection = createUniquenessInspectionService({
  onDetailedScore: (spawnerId, score) => persistenceOutbox.enqueueUniqueness(spawnerId, score),
});
const uniquenessTelemetry = createUniquenessTelemetryService();
let packetSizesKb: MarketStatsPacket["packetSizesKb"] = {};
let marketDataLoading = false;
let marketDataRequestId = 0;

const ctx = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<MarketWorkerCommand>) => void) => void;
  postMessage: (message: MarketWorkerMessage) => void;
};

ctx.addEventListener("message", (event: MessageEvent<MarketWorkerCommand>) => {
  try {
    handleCommand(event.data);
  } catch (error) {
    postError(error);
  }
});

attachPersistenceEventSink();
computeUniqueness(true);
postAllPackets(true);
setTimeout(loop, WORKER_LOOP_INTERVAL_MS);

function loop() {
  try {
    const now = performance.now();
    const elapsed = Math.max(0, (now - lastLoopTime) / 1000);
    lastLoopTime = now;

    if (runState === "running") {
      targetTick += elapsed * playbackSpeed();
      void maybeLoadMoreCandles();
      const result = advanceSimulationWithinBudget();
      backlogTicks = result.remainingTicks;
      if (result.processedTicks > 0) {
        version += 1;
        computeUniqueness(false);
      }
      if (simulation.timeline.candleEndReached && backlogTicks <= 0) {
        setRunState("stopped");
      }
    }

    postAllPackets(false);
  } catch (error) {
    postError(error);
  } finally {
    setTimeout(loop, WORKER_LOOP_INTERVAL_MS);
  }
}

function handleCommand(command: MarketWorkerCommand) {
  dispatchMarketWorkerCommand(command, sessionId, {
    reset: resetFromCommand,
    start: () => void startRun(),
    pause: () => {
      if (runState === "running") setRunState("paused");
      postAllPackets(true);
    },
    stop: () => {
      if (runState === "running" || runState === "paused") setRunState("stopped");
      postAllPackets(true);
    },
    setSettings: ({ patch }) => {
      settings = sanitizeSettings({ ...settings, ...patch });
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, generated: settings });
      if (runState === "idle" || simulation.timeline.source === "generated") {
        activeMarketConfig = sanitizeMarketRuntimeConfig({ ...activeMarketConfig, generated: settings });
        applyTimelineSettings(simulation.timeline, settings);
      }
      version += 1;
      postAllPackets(true);
    },
    setMarketConfig: ({ patch }) => {
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, ...patch });
      settings = sanitizeSettings(pendingMarketConfig.generated);
      version += 1;
      postStats(true);
    },
    setPlaybackSettings: ({ patch }) => {
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, playback: { ...pendingMarketConfig.playback, ...patch } });
      marketDataRequestId += 1;
      version += 1;
      postStats(true);
    },
    setMarketSource: ({ source }) => {
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, source });
      marketDataRequestId += 1;
      if (runState === "idle") {
        activeMarketConfig = isBtcSource(pendingMarketConfig.source)
          ? { ...pendingMarketConfig, source: "generated" }
          : pendingMarketConfig;
        simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
        attachPersistenceEventSink();
        computeUniqueness(true);
      }
      version += 1;
      postAllPackets(true);
    },
    setSpawnerConfig: ({ patch }) => updatePendingSpawnerConfig(sanitizeSpawnerConfig({ ...pendingSpawnerConfig, ...patch })),
    replaceSpawnerConfig: ({ spawnerConfig }) => updatePendingSpawnerConfig(sanitizeSpawnerConfig(spawnerConfig)),
    requestPackets: () => postAllPackets(true),
    requestSpawnerArchitecture: ({ spawnerId }) => postArchitecture(spawnerId),
    requestSpawnerInspection: ({ requestId, spawnerId }) => postInspection(requestId, spawnerId),
    requestUniquenessDetail: ({ spawnerId }) => postUniquenessDetail(spawnerId),
    setSelectedSpawnerForCharts: ({ spawnerId }) => {
      uniquenessTelemetry.setSelectedSpawner(spawnerId);
      version += 1;
      postChart(true);
    },
    persistenceAck: ({ persistencePacketId, ok }) => handlePersistenceAck(persistencePacketId, ok),
  });
}

function resetFromCommand(command: Extract<MarketWorkerCommand, { type: "reset" }>) {
  sessionId = command.sessionId;
  pendingMarketConfig = sanitizeMarketRuntimeConfig(command.marketConfig);
  activeMarketConfig = isBtcSource(pendingMarketConfig.source)
    ? { ...pendingMarketConfig, source: "generated" }
    : pendingMarketConfig;
  settings = sanitizeSettings(pendingMarketConfig.generated);
  pendingSpawnerConfig = sanitizeSpawnerConfig(command.spawnerConfig);
  activeSpawnerConfig = pendingSpawnerConfig;
  simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
  persistentSessionId = null;
  setRunState("idle");
  targetTick = 0;
  backlogTicks = 0;
  persistenceOutbox.reset();
  packetScheduler.reset();
  marketDataRequestId += 1;
  marketDataLoading = false;
  attachPersistenceEventSink();
  version += 1;
  uniquenessInspection.reset();
  uniquenessTelemetry.reset();
  packetSizesKb = {};
  computeUniqueness(true);
  postAllPackets(true);
}

function updatePendingSpawnerConfig(nextConfig: SpawnerConfig) {
  pendingSpawnerConfig = nextConfig;
  if (runState === "idle") {
    activeSpawnerConfig = pendingSpawnerConfig;
    simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
    attachPersistenceEventSink();
    uniquenessInspection.reset();
    uniquenessTelemetry.reset();
    computeUniqueness(true);
  }
  version += 1;
  postAllPackets(true);
}

function postAllPackets(force: boolean) {
  postChart(force);
  postRoster(force);
  postStats(force);
  postPersistence(force);
}

function postChart(force: boolean) {
  if (!packetScheduler.shouldPost("chart", force)) return;
  const packet = createMarketChartPacket({
    sessionId,
    simulation,
    version,
    centerTick: targetTick,
    uniquenessWindow: uniquenessTelemetry.window(simulation.world.tick),
  });
  recordPacketSize("chart", packet, force);
  ctx.postMessage({ type: "chart", packet } satisfies MarketWorkerMessage);
}

function postRoster(force: boolean) {
  if (!packetScheduler.shouldPost("roster", force)) return;
  uniquenessInspection.ensureRosterScores(simulation);
  const packet = createMarketRosterPacket({ sessionId, simulation, version, uniquenessScores: uniquenessInspection.scores() });
  recordPacketSize("roster", packet, force);
  ctx.postMessage({ type: "roster", packet } satisfies MarketWorkerMessage);
}

function postStats(force: boolean) {
  if (!packetScheduler.shouldPost("stats", force)) return;
  const packet = createMarketStatsPacket({
    sessionId,
    simulation,
    settings,
    marketConfig: activeMarketConfig,
    pendingMarketConfig,
    spawnerConfig: activeSpawnerConfig,
    pendingSpawnerConfig,
    playing: runState === "running",
    runState,
    persistentSessionId,
    version,
    backlogTicks,
    packetSizesKb,
  });
  recordPacketSize("stats", packet, force);
  ctx.postMessage({ type: "stats", packet: { ...packet, packetSizesKb } } satisfies MarketWorkerMessage);
}

function postPersistence(force: boolean) {
  if (!persistentSessionId || runState === "idle") return;
  if (!packetScheduler.shouldPost("persistence", force)) return;
  const delivery = persistenceOutbox.createDelivery({
    force,
    sessionId,
    persistentSessionId,
    status: runState,
    simulation,
    settings,
    marketConfig: activeMarketConfig,
    spawnerConfig: activeSpawnerConfig,
    uniquenessScores: uniquenessInspection.scores(),
    lastUniquenessTick: uniquenessInspection.lastTick(),
    stateSnapshotIntervalTicks: PERSISTENCE_STATE_INTERVAL_TICKS,
  });
  if (!delivery) return;
  recordPacketSize("persistence", delivery.packet, force);
  ctx.postMessage({ type: "persistence", persistencePacketId: delivery.id, packet: delivery.packet } satisfies MarketWorkerMessage);
}

function handlePersistenceAck(packetId: number, ok: boolean) {
  if (persistenceOutbox.acknowledge(packetId, ok)) packetScheduler.retryNow("persistence");
}

async function startRun() {
  if (marketDataLoading) return;
  const configForRun = sanitizeMarketRuntimeConfig(pendingMarketConfig);
  const spawnerConfigForRun = sanitizeSpawnerConfig(pendingSpawnerConfig);
  try {
    if (runState === "idle" || runState === "stopped") {
      if (isBtcSource(configForRun.source)) {
        await initializeCandleSimulation(configForRun, spawnerConfigForRun);
      } else {
        activeMarketConfig = configForRun;
        activeSpawnerConfig = spawnerConfigForRun;
        simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
      }
      resetRunStateForNewSession();
      persistentSessionId = createPersistentSessionId();
    }
    setRunState("running");
    lastLoopTime = performance.now();
    postAllPackets(true);
  } catch (error) {
    setRunState("idle");
    postError(error);
    postAllPackets(true);
  }
}

function resetRunStateForNewSession() {
  targetTick = 0;
  backlogTicks = 0;
  persistenceOutbox.reset();
  packetScheduler.reset();
  attachPersistenceEventSink();
  uniquenessInspection.reset();
  uniquenessTelemetry.reset();
  computeUniqueness(true);
}

async function initializeCandleSimulation(configForRun: MarketRuntimeConfig, spawnerConfigForRun: SpawnerConfig) {
  const requestId = marketDataRequestId + 1;
  marketDataRequestId = requestId;
  marketDataLoading = true;
  try {
    const response = await fetchMarketCandles(configForRun, configForRun.playback.startDateTime, 5000);
    if (requestId !== marketDataRequestId || !sameMarketConfig(configForRun, pendingMarketConfig)) {
      throw new Error("BTC data request was superseded");
    }
    activeMarketConfig = {
      ...configForRun,
      playback: {
        ...configForRun.playback,
        startDateTime: response.snappedStartDatetime,
      },
    };
    activeSpawnerConfig = spawnerConfigForRun;
    simulation = createCandleSimulationState({
      marketConfig: activeMarketConfig,
      spawnerConfig: spawnerConfigForRun,
      candles: response.candles,
      snappedStartTimestamp: response.snappedStartTimestamp,
      snappedStartDatetime: response.snappedStartDatetime,
    });
    settings = activeMarketConfig.generated;
  } finally {
    if (requestId === marketDataRequestId) marketDataLoading = false;
  }
}

async function maybeLoadMoreCandles() {
  if (!isBtcSource(activeMarketConfig.source) || marketDataLoading || simulation.timeline.candleEndReached) return;
  if (candleBufferRemaining(simulation.timeline) > 1000) return;
  const latest = latestLoadedCandle(simulation.timeline);
  if (!latest?.timestamp) return;
  const requestId = marketDataRequestId + 1;
  marketDataRequestId = requestId;
  marketDataLoading = true;
  try {
    const response = await fetchMarketCandles(activeMarketConfig, String(latest.timestamp + 1), 5000);
    if (requestId !== marketDataRequestId) return;
    appendMarketCandles(simulation.timeline, response.candles);
  } finally {
    if (requestId === marketDataRequestId) marketDataLoading = false;
  }
}

function playbackSpeed() {
  if (isBtcSource(activeMarketConfig.source)) return activeMarketConfig.playback.barsPerSecond;
  return activeMarketConfig.playback.generatedTicksPerSecond;
}

function sameMarketConfig(left: MarketRuntimeConfig, right: MarketRuntimeConfig) {
  return sameMarketRuntimeConfig(left, right);
}

function postArchitecture(spawnerId: number) {
  const packet = uniquenessInspection.architecturePacket(sessionId, simulation, spawnerId);
  const packetSizeKb = estimatePacketKb(packet);
  packetSizesKb = { ...packetSizesKb, architecture: packetSizeKb };
  ctx.postMessage({ type: "architecture", packet: { ...packet, packetSizeKb } } satisfies MarketWorkerMessage);
  postStats(true);
}

function postInspection(requestId: number, spawnerId: number) {
  const packet = uniquenessInspection.inspectionPacket(sessionId, requestId, simulation, spawnerId);
  const packetSizeKb = estimatePacketKb(packet);
  packetSizesKb = { ...packetSizesKb, inspection: packetSizeKb };
  ctx.postMessage({ type: "spawnerInspection", packet: { ...packet, packetSizeKb } } satisfies MarketWorkerMessage);
  postStats(true);
}

function postUniquenessDetail(spawnerId: number) {
  const packet = uniquenessInspection.uniquenessDetailPacket(sessionId, simulation, spawnerId);
  const packetSizeKb = estimatePacketKb(packet);
  packetSizesKb = { ...packetSizesKb, uniqueness: packetSizeKb };
  ctx.postMessage({ type: "uniquenessDetail", packet: { ...packet, packetSizeKb } } satisfies MarketWorkerMessage);
  postStats(true);
}

function attachPersistenceEventSink() {
  simulation.world.eventSink = (event) => {
    persistenceOutbox.enqueueEvent(event);
  };
}

function computeUniqueness(force: boolean) {
  const result = uniquenessInspection.computeIfNeeded(simulation, force);
  if (result.status === "computed") uniquenessTelemetry.record(result.scores, simulation.world.tick);
  else if (result.status === "skipped") uniquenessTelemetry.markSkipped(result.reason);
}

function advanceSimulationWithinBudget() {
  const started = performance.now();
  let processedTicks = 0;
  let remainingTicks = 0;

  do {
    const result = advanceSimulationToTarget(simulation, targetTick, 1);
    processedTicks += result.processedTicks;
    remainingTicks = result.remainingTicks;
    if (result.processedTicks === 0 || result.remainingTicks <= 0) break;
  } while (performance.now() - started < SIMULATION_LOOP_BUDGET_MS);

  return { processedTicks, remainingTicks };
}

function recordPacketSize(key: "chart" | "roster" | "stats" | "persistence", packet: unknown, force: boolean) {
  if (!packetScheduler.shouldMeasureSize(key, force)) return;
  packetSizesKb = { ...packetSizesKb, [key]: estimatePacketKb(packet) };
}

function setRunState(nextState: MarketRunState) {
  if (runState === nextState) return;
  runState = nextState;
  version += 1;
}

function postError(error: unknown) {
  ctx.postMessage({
    type: "error",
    sessionId,
    message: error instanceof Error ? error.message : String(error),
  } satisfies MarketWorkerMessage);
}

function createPersistentSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sine-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}
