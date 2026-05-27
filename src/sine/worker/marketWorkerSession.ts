import { applyTimelineSettings } from "../marketTimeline";
import { sanitizeSettings } from "../settingsStorage";
import { sanitizeSpawnerConfig } from "../spawnerSettingsStorage";
import { createPersistenceOutbox } from "../persistence/persistenceOutbox";
import { createPacketScheduler } from "./packetScheduler";
import { createUniquenessInspectionService } from "./uniquenessInspectionService";
import { createUniquenessTelemetryService } from "./uniquenessTelemetryService";
import { createMarketDataCoordinator } from "./marketDataCoordinator";
import { dispatchMarketWorkerCommand } from "./marketWorkerCommandHandler";
import { createWorkerPacketPoster } from "./workerPacketPoster";
import { createBrainEvaluationCoordinator, isStaleBrainEvaluationError } from "./brainEvaluationCoordinator";
import {
  advanceSimulationToTargetAsync,
  createSimulationState,
  type MarketSimulationState,
} from "../simulationRuntime";
import type { WaveSettings } from "../marketSignal";
import { INITIAL_SETTINGS } from "../marketSignal";
import {
  INITIAL_MARKET_RUNTIME_CONFIG,
  isBtcSource,
  sanitizeMarketRuntimeConfig,
  type MarketRuntimeConfig,
} from "../marketRuntimeConfig";
import type { MarketRunState, MarketStatsPacket, MarketWorkerCommand, MarketWorkerMessage, MarketWorkerSessionId } from "../marketWorkerProtocol";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerConfig } from "../spawnerSimulation";

const WORKER_LOOP_INTERVAL_MS = 16;
const SIMULATION_LOOP_BUDGET_MS = 6;
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
let selectedSpawnerId: number | null = null;
let startAttemptId = 0;
const packetScheduler = createPacketScheduler();
const persistenceOutbox = createPersistenceOutbox();
const brainEvaluation = createBrainEvaluationCoordinator();
const marketData = createMarketDataCoordinator();
const uniquenessInspection = createUniquenessInspectionService({
  onDetailedScore: (spawnerId, score) => persistenceOutbox.enqueueUniqueness(spawnerId, score),
});
const uniquenessTelemetry = createUniquenessTelemetryService();
let packetSizesKb: MarketStatsPacket["packetSizesKb"] = {};
let runGeneration = 1;
let advanceEpoch = 1;
let nextBrainEvalBatchId = 1;

const ctx = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<MarketWorkerCommand>) => void) => void;
  postMessage: (message: MarketWorkerMessage) => void;
};

const packetPoster = createWorkerPacketPoster({
  postMessage: (message) => ctx.postMessage(message),
  getState: () => ({
    sessionId,
    simulation,
    version,
    targetTick,
    settings,
    activeMarketConfig,
    pendingMarketConfig,
    activeSpawnerConfig,
    pendingSpawnerConfig,
    runState,
    persistentSessionId,
    backlogTicks,
    selectedSpawnerId,
    brainEvalMode: currentBrainEvaluationMode(),
  }),
  getPacketSizes: () => packetSizesKb,
  setPacketSizes: (nextPacketSizes) => {
    packetSizesKb = nextPacketSizes;
  },
  packetScheduler,
  persistenceOutbox,
  uniquenessInspection,
  uniquenessTelemetry,
});

ctx.addEventListener("message", (event: MessageEvent<MarketWorkerCommand>) => {
  try {
    handleCommand(event.data);
  } catch (error) {
    packetPoster.postError(error);
  }
});

attachPersistenceEventSink();
computeUniqueness(true);
packetPoster.postAllPackets(true);
setTimeout(loop, WORKER_LOOP_INTERVAL_MS);

async function loop() {
  try {
    const now = performance.now();
    const elapsed = Math.max(0, (now - lastLoopTime) / 1000);
    lastLoopTime = now;

    if (runState === "running") {
      targetTick += elapsed * playbackSpeed();
      void marketData.maybeLoadMoreCandles(activeMarketConfig, simulation);
      const result = await advanceSimulationWithinBudget();
      if (result.stale) return;
      backlogTicks = result.remainingTicks;
      if (result.processedTicks > 0) {
        version += 1;
        computeUniqueness(false);
      }
      if (simulation.timeline.candleEndReached && backlogTicks <= 0) {
        setRunState("stopped");
      }
    }

    packetPoster.postAllPackets(false);
  } catch (error) {
    packetPoster.postError(error);
  } finally {
    setTimeout(loop, WORKER_LOOP_INTERVAL_MS);
  }
}

function handleCommand(command: MarketWorkerCommand) {
  dispatchMarketWorkerCommand(command, sessionId, {
    reset: resetFromCommand,
    start: () => void startRun(),
    pause: () => {
      if (runState === "running") {
        setRunState("paused");
        invalidateInFlightAdvance();
      }
      packetPoster.postAllPackets(true);
    },
    stop: () => {
      if (runState === "running" || runState === "paused") {
        setRunState("stopped");
        invalidateInFlightAdvance();
      }
      packetPoster.postAllPackets(true);
    },
    setSettings: ({ patch }) => {
      settings = sanitizeSettings({ ...settings, ...patch });
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, generated: settings });
      if (runState === "idle" || simulation.timeline.source === "generated") {
        resetAdvanceRuntimeForSession();
        activeMarketConfig = sanitizeMarketRuntimeConfig({ ...activeMarketConfig, generated: settings });
        applyTimelineSettings(simulation.timeline, settings);
      }
      version += 1;
      packetPoster.postAllPackets(true);
    },
    setMarketConfig: ({ patch }) => {
      startAttemptId += 1;
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, ...patch });
      settings = sanitizeSettings(pendingMarketConfig.generated);
      version += 1;
      packetPoster.postStats(true);
    },
    setPlaybackSettings: ({ patch }) => {
      startAttemptId += 1;
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, playback: { ...pendingMarketConfig.playback, ...patch } });
      marketData.invalidateRequests();
      version += 1;
      packetPoster.postStats(true);
    },
    setMarketSource: ({ source }) => {
      startAttemptId += 1;
      pendingMarketConfig = sanitizeMarketRuntimeConfig({ ...pendingMarketConfig, source });
      marketData.invalidateRequests();
      if (runState === "idle") {
        resetAdvanceRuntimeForSession();
        activeMarketConfig = isBtcSource(pendingMarketConfig.source)
          ? { ...pendingMarketConfig, source: "generated" }
          : pendingMarketConfig;
        simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
        attachPersistenceEventSink();
        computeUniqueness(true);
      }
      version += 1;
      packetPoster.postAllPackets(true);
    },
    setSpawnerConfig: ({ patch }) => updatePendingSpawnerConfig(sanitizeSpawnerConfig({ ...pendingSpawnerConfig, ...patch })),
    replaceSpawnerConfig: ({ spawnerConfig }) => updatePendingSpawnerConfig(sanitizeSpawnerConfig(spawnerConfig)),
    requestPackets: () => packetPoster.postAllPackets(true),
    requestSpawnerArchitecture: ({ spawnerId }) => packetPoster.postArchitecture(spawnerId),
    requestSpawnerInspection: ({ requestId, spawnerId }) => packetPoster.postInspection(requestId, spawnerId),
    requestUniquenessDetail: ({ spawnerId }) => packetPoster.postUniquenessDetail(spawnerId),
    setSelectedSpawnerForCharts: ({ spawnerId }) => {
      selectedSpawnerId = spawnerId !== null && Number.isFinite(spawnerId) ? Math.floor(spawnerId) : null;
      uniquenessTelemetry.setSelectedSpawner(selectedSpawnerId);
      const result = uniquenessInspection.ensureSelectedTelemetryScores(simulation, selectedSpawnerId);
      if (result.status === "computed") uniquenessTelemetry.record(result.scores, simulation.world.tick);
      else if (result.status === "skipped") uniquenessTelemetry.markSkipped(result.reason);
      version += 1;
      packetPoster.postChart(true);
      packetPoster.postRoster(true);
    },
    persistenceAck: ({ persistencePacketId, ok }) => handlePersistenceAck(persistencePacketId, ok),
  });
}

function resetFromCommand(command: Extract<MarketWorkerCommand, { type: "reset" }>) {
  sessionId = command.sessionId;
  resetAdvanceRuntimeForSession();
  pendingMarketConfig = sanitizeMarketRuntimeConfig(command.marketConfig);
  activeMarketConfig = isBtcSource(pendingMarketConfig.source)
    ? { ...pendingMarketConfig, source: "generated" }
    : pendingMarketConfig;
  settings = sanitizeSettings(pendingMarketConfig.generated);
  pendingSpawnerConfig = sanitizeSpawnerConfig(command.spawnerConfig);
  activeSpawnerConfig = pendingSpawnerConfig;
  simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
  persistentSessionId = null;
  selectedSpawnerId = null;
  setRunState("idle");
  startAttemptId += 1;
  targetTick = 0;
  backlogTicks = 0;
  marketData.reset();
  resetRunArtifactsForSession();
  version += 1;
  packetSizesKb = {};
  packetPoster.postAllPackets(true);
}

function updatePendingSpawnerConfig(nextConfig: SpawnerConfig) {
  startAttemptId += 1;
  pendingSpawnerConfig = nextConfig;
  if (runState === "idle") {
    resetAdvanceRuntimeForSession();
    activeSpawnerConfig = pendingSpawnerConfig;
    simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
    attachPersistenceEventSink();
    uniquenessInspection.reset();
    uniquenessTelemetry.reset();
    computeUniqueness(true);
  }
  version += 1;
  packetPoster.postAllPackets(true);
}

function handlePersistenceAck(packetId: number, ok: boolean) {
  if (persistenceOutbox.acknowledge(packetId, ok)) packetScheduler.retryNow("persistence");
}

async function startRun() {
  if (marketData.isLoading()) return;
  const attemptId = startAttemptId + 1;
  startAttemptId = attemptId;
  const configForRun = sanitizeMarketRuntimeConfig(pendingMarketConfig);
  const spawnerConfigForRun = sanitizeSpawnerConfig(pendingSpawnerConfig);
  try {
    if (runState === "idle" || runState === "stopped") {
      if (isBtcSource(configForRun.source)) {
        const result = await marketData.initializeCandleSimulation({
          configForRun,
          spawnerConfigForRun,
          attemptId,
          currentAttemptId: () => startAttemptId,
          pendingMarketConfig: () => pendingMarketConfig,
          setActiveMarketConfig: (config) => {
            activeMarketConfig = config;
          },
          setActiveSpawnerConfig: (config) => {
            activeSpawnerConfig = config;
          },
          setSimulation: (nextSimulation) => {
            simulation = nextSimulation;
          },
          setSettings: (nextSettings) => {
            settings = nextSettings;
          },
        });
        if (result.status === "superseded") return;
      } else {
        activeMarketConfig = configForRun;
        activeSpawnerConfig = spawnerConfigForRun;
        simulation = createSimulationState(activeMarketConfig, activeSpawnerConfig);
      }
      if (attemptId !== startAttemptId) return;
      resetRunStateForNewSession();
      persistentSessionId = createPersistentSessionId();
    }
    if (attemptId !== startAttemptId) return;
    setRunState("running");
    lastLoopTime = performance.now();
    packetPoster.postAllPackets(true);
  } catch (error) {
    if (attemptId !== startAttemptId) return;
    setRunState("idle");
    packetPoster.postError(error);
    packetPoster.postAllPackets(true);
  }
}

function resetRunStateForNewSession() {
  resetAdvanceRuntimeForSession();
  targetTick = 0;
  backlogTicks = 0;
  resetRunArtifactsForSession();
}

function playbackSpeed() {
  if (isBtcSource(activeMarketConfig.source)) return activeMarketConfig.playback.barsPerSecond;
  return activeMarketConfig.playback.generatedTicksPerSecond;
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

async function advanceSimulationWithinBudget() {
  const started = performance.now();
  let processedTicks = 0;
  let remainingTicks = 0;
  const generation = runGeneration;
  const epoch = advanceEpoch;
  const activeSessionId = sessionId;
  const activeSimulation = simulation;

  try {
    do {
      const result = await advanceSimulationToTargetAsync(activeSimulation, targetTick, 1, {
        brainEvaluationRunner: brainEvaluation.guardedRunner({
          activeSessionId,
          generation,
          epoch,
          population: activeSimulation.world.spawners.length,
          isFresh: isAdvanceFresh,
        }),
        sessionId: activeSessionId,
        runGeneration: generation,
        advanceEpoch: epoch,
        batchId: nextBrainEvalBatchId,
      });
      nextBrainEvalBatchId += 1;
      if (activeSimulation !== simulation || generation !== runGeneration || epoch !== advanceEpoch || activeSessionId !== sessionId) return { processedTicks, remainingTicks, stale: true };
      processedTicks += result.processedTicks;
      remainingTicks = result.remainingTicks;
      if (result.processedTicks === 0 || result.remainingTicks <= 0) break;
    } while (performance.now() - started < SIMULATION_LOOP_BUDGET_MS);
  } catch (error) {
    if (isStaleBrainEvaluationError(error)) return { processedTicks, remainingTicks, stale: true };
    throw error;
  }

  return { processedTicks, remainingTicks, stale: false };
}

function currentBrainEvaluationMode() {
  return brainEvaluation.currentMode(simulation.world.spawners.length);
}

function isAdvanceFresh(activeSessionId: number, generation: number, epoch: number) {
  return activeSessionId === sessionId && generation === runGeneration && epoch === advanceEpoch;
}

function setRunState(nextState: MarketRunState) {
  if (runState === nextState) return;
  runState = nextState;
  version += 1;
}

function invalidateInFlightAdvance() {
  advanceEpoch += 1;
}

function resetAdvanceRuntimeForSession() {
  runGeneration += 1;
  invalidateInFlightAdvance();
  brainEvaluation.reset();
}

function resetRunArtifactsForSession() {
  persistenceOutbox.reset();
  packetScheduler.reset();
  attachPersistenceEventSink();
  persistenceOutbox.captureInitialSpawners(simulation);
  uniquenessInspection.reset();
  uniquenessTelemetry.reset();
  computeUniqueness(true);
}

function createPersistentSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sine-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}
