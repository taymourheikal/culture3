import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../../src/sine/marketRuntimeConfig";
import { MARKET_WORKER_COMMAND_TYPES, type MarketRunState, type MarketWorkerMessage } from "../../src/sine/marketWorkerProtocol";
import { connectionDetailRows, connectionRowClass, connectionRowParts, graphConnectionStyle } from "../../src/sine/architectureConnectionPresentation";
import { createInspectionRequestStore } from "../../src/sine/hooks/inspectionRequestStore";
import { DEFAULT_SPAWNER_CONFIG, type ConnectionGene } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import { createPersistenceOutbox } from "../../src/sine/persistence/persistenceOutbox";
import { createPacketScheduler } from "../../src/sine/worker/packetScheduler";
import { createSelectedSpawnerTimelineService } from "../../src/sine/worker/selectedSpawnerTimelineService";
import { createStrategyMapService } from "../../src/sine/worker/strategyMapService";
import { createUniquenessRuntimeService } from "../../src/sine/worker/uniquenessRuntimeService";
import { workerCommands } from "../../src/sine/worker/workerCommands";
import { dispatchMarketWorkerCommand } from "../../src/sine/worker/marketWorkerCommandHandler";
import { createWorkerPacketPoster } from "../../src/sine/worker/workerPacketPoster";
import { routeMarketWorkerMessage } from "../../src/sine/worker/workerMessageRouter";
import { reproductionRequirementMeterPercent } from "../../src/sine/SineWorkbenchMetrics";
import { createVisiblePopulationComposition, viewRosterSpawners } from "../../src/sine/rosterView";
import type { RosterSpawnerSummary } from "../../src/sine/marketWorkerProtocol";
import type { SineTest } from "./helpers";

function testWorkerCommandsBuildExactPayloads() {
  assert.deepEqual(workerCommands.start(4), { type: "start", sessionId: 4 });
  assert.deepEqual(workerCommands.pause(4), { type: "pause", sessionId: 4 });
  assert.deepEqual(workerCommands.stop(4), { type: "stop", sessionId: 4 });
  assert.deepEqual(workerCommands.reset(4, INITIAL_MARKET_RUNTIME_CONFIG, DEFAULT_SPAWNER_CONFIG), {
    type: "reset",
    sessionId: 4,
    marketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
  });
  assert.deepEqual(workerCommands.setSettings(4, { amplitude: 2 }), { type: "setSettings", sessionId: 4, patch: { amplitude: 2 } });
  assert.deepEqual(workerCommands.setPlaybackSettings(4, { barsPerSecond: 30 }), {
    type: "setPlaybackSettings",
    sessionId: 4,
    patch: { barsPerSecond: 30 },
  });
  assert.deepEqual(workerCommands.setMarketSource(4, "btcusd_5m"), { type: "setMarketSource", sessionId: 4, source: "btcusd_5m" });
  assert.deepEqual(workerCommands.setMarketConfig(4, { generated: INITIAL_SETTINGS }), {
    type: "setMarketConfig",
    sessionId: 4,
    patch: { generated: INITIAL_SETTINGS },
  });
  assert.deepEqual(workerCommands.setSpawnerConfig(4, { initialSpawners: 12 }), {
    type: "setSpawnerConfig",
    sessionId: 4,
    patch: { initialSpawners: 12 },
  });
  assert.deepEqual(workerCommands.replaceSpawnerConfig(4, DEFAULT_SPAWNER_CONFIG), {
    type: "replaceSpawnerConfig",
    sessionId: 4,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
  });
  assert.deepEqual(workerCommands.requestPackets(4), { type: "requestPackets", sessionId: 4 });
  assert.deepEqual(workerCommands.requestSpawnerArchitecture(4, 20), { type: "requestSpawnerArchitecture", sessionId: 4, spawnerId: 20 });
  assert.deepEqual(workerCommands.requestSpawnerInspection(4, 9, 20), {
    type: "requestSpawnerInspection",
    sessionId: 4,
    requestId: 9,
    spawnerId: 20,
  });
  assert.deepEqual(workerCommands.requestUniquenessDetail(4, 20), { type: "requestUniquenessDetail", sessionId: 4, spawnerId: 20 });
  assert.deepEqual(workerCommands.setSelectedSpawnerForCharts(4, null), {
    type: "setSelectedSpawnerForCharts",
    sessionId: 4,
    spawnerId: null,
  });
  assert.deepEqual(workerCommands.persistenceAck(4, 11, false), { type: "persistenceAck", sessionId: 4, persistencePacketId: 11, ok: false });
}

function testWorkerCommandBuildersCoverProtocolCommands() {
  assert.deepEqual(
    Object.keys(workerCommands).sort(),
    [...MARKET_WORKER_COMMAND_TYPES].sort(),
  );
}

function testWorkerMessageRouterRoutesMatchingSessions() {
  const called: string[] = [];
  const handlers = {
    chart: () => called.push("chart"),
    stats: () => called.push("stats"),
    roster: () => called.push("roster"),
    architecture: () => called.push("architecture"),
    spawnerInspection: () => called.push("spawnerInspection"),
    uniquenessDetail: () => called.push("uniquenessDetail"),
    persistence: (id: number) => called.push(`persistence:${id}`),
    error: (message: string) => called.push(`error:${message}`),
  };
  const packet = { sessionId: 7 };
  const messages = [
    { type: "chart", packet },
    { type: "stats", packet },
    { type: "roster", packet },
    { type: "architecture", packet },
    { type: "spawnerInspection", packet },
    { type: "uniquenessDetail", packet },
    { type: "persistence", persistencePacketId: 12, packet },
    { type: "error", sessionId: 7, message: "boom" },
  ] as MarketWorkerMessage[];

  for (const message of messages) assert.equal(routeMarketWorkerMessage(message, 7, handlers), true);

  assert.deepEqual(called, ["chart", "stats", "roster", "architecture", "spawnerInspection", "uniquenessDetail", "persistence:12", "error:boom"]);
}

function testWorkerMessageRouterIgnoresStaleSessions() {
  const called: string[] = [];
  const handlers = {
    chart: () => called.push("chart"),
    stats: () => called.push("stats"),
    roster: () => called.push("roster"),
    architecture: () => called.push("architecture"),
    spawnerInspection: () => called.push("spawnerInspection"),
    uniquenessDetail: () => called.push("uniquenessDetail"),
    persistence: () => called.push("persistence"),
    error: () => called.push("error"),
  };

  assert.equal(routeMarketWorkerMessage({ type: "chart", packet: { sessionId: 1 } } as MarketWorkerMessage, 2, handlers), false);
  assert.equal(
    routeMarketWorkerMessage(
      { type: "persistence", persistencePacketId: 3, packet: { sessionId: 1 } } as MarketWorkerMessage,
      2,
      handlers,
    ),
    false,
  );
  assert.equal(routeMarketWorkerMessage({ type: "error", sessionId: 1, message: "old" }, 2, handlers), false);
  assert.deepEqual(called, []);
}

function testWorkerCommandDispatchPreservesSessionRules() {
  const called: string[] = [];
  const handlers = {
    reset: () => called.push("reset"),
    start: () => called.push("start"),
    pause: () => called.push("pause"),
    stop: () => called.push("stop"),
    setSettings: () => called.push("setSettings"),
    setMarketConfig: () => called.push("setMarketConfig"),
    setPlaybackSettings: () => called.push("setPlaybackSettings"),
    setMarketSource: () => called.push("setMarketSource"),
    setSpawnerConfig: () => called.push("setSpawnerConfig"),
    replaceSpawnerConfig: () => called.push("replaceSpawnerConfig"),
    requestPackets: () => called.push("requestPackets"),
    requestSpawnerArchitecture: () => called.push("requestSpawnerArchitecture"),
    requestSpawnerInspection: () => called.push("requestSpawnerInspection"),
    requestUniquenessDetail: () => called.push("requestUniquenessDetail"),
    setSelectedSpawnerForCharts: () => called.push("setSelectedSpawnerForCharts"),
    persistenceAck: () => called.push("persistenceAck"),
  };

  dispatchMarketWorkerCommand(workerCommands.start(1), 2, handlers);
  dispatchMarketWorkerCommand(workerCommands.reset(1, INITIAL_MARKET_RUNTIME_CONFIG, DEFAULT_SPAWNER_CONFIG), 2, handlers);
  dispatchMarketWorkerCommand(workerCommands.requestPackets(2), 2, handlers);

  assert.deepEqual(called, ["reset", "requestPackets"]);
}

function testWorkerSessionPauseStopInvalidateInFlightAdvance() {
  const source = readFileSync("src/sine/worker/marketWorkerSession.ts", "utf8");
  assert.match(source, /pause:[\s\S]*?setRunState\("paused"\);[\s\S]*?invalidateInFlightAdvance\(\);[\s\S]*?packetPoster\.postAllPackets\(true\);/);
  assert.match(source, /stop:[\s\S]*?setRunState\("stopped"\);[\s\S]*?invalidateInFlightAdvance\(\);[\s\S]*?packetPoster\.postAllPackets\(true\);/);
}

function testWorkerSessionPlaybackEndUsesExistingStopPath() {
  const source = readFileSync("src/sine/worker/marketWorkerSession.ts", "utf8");
  assert.match(source, /targetTick = cappedTargetTickForPlaybackEnd\(targetTick\);/);
  assert.match(source, /\(simulation\.timeline\.candleEndReached \|\| result\.playbackEndReached\)[\s\S]*?setRunState\("stopped"\);/);
  assert.match(source, /runStartTick = simulation\.world\.tick;/);
  assert.match(source, /function playbackEndReachedForActiveRun\(\)[\s\S]*?playbackEndReached\(/);
}

function testInspectionRequestStoreRejectsPendingRequests() {
  const store = createInspectionRequestStore();
  const resolved: unknown[] = [];
  const timeout = setTimeout(() => undefined, 60_000);
  store.set(2, {
    timeout,
    updateState: true,
    resolve: (packet) => resolved.push(packet),
  });

  store.rejectAll(9, "cancelled");

  assert.deepEqual(resolved, [
    {
      sessionId: 9,
      requestId: 2,
      spawnerId: -1,
      ok: false,
      payload: null,
      error: "cancelled",
    },
  ]);
  assert.equal(store.resolve({ sessionId: 9, requestId: 2, spawnerId: 2, ok: true, payload: null }), null);
}

function testArchitectureConnectionPresentationMatchesCurrentFormatting() {
  const positive = connectionFixture({ innovationId: 7, weight: 1.25, enabled: true });
  const negative = connectionFixture({ innovationId: 8, weight: -0.5, enabled: true });
  const disabled = connectionFixture({ innovationId: 9, weight: 0.4, enabled: false });
  const previous = connectionFixture({
    innovationId: 10,
    weight: 0.4,
    enabled: true,
    source: { kind: "hidden", unitId: 2, mode: "previous" },
  });

  assert.deepEqual(connectionRowParts(positive), { source: "I1: Relative ROC", weight: "1.250", target: "O1: Long" });
  assert.equal(connectionRowClass(disabled, true), "connection-row selected disabled");
  assert.equal(graphConnectionStyle(positive).color, "var(--sine-accent)");
  assert.equal(graphConnectionStyle(negative).marker, "url(#architecture-arrow-negative)");
  assert.equal(graphConnectionStyle(disabled).opacity, 0.28);
  assert.equal(graphConnectionStyle(disabled).dash, "3 5");
  assert.equal(graphConnectionStyle(previous).dash, "5 4");
  assert.equal(graphConnectionStyle(positive).label, "1.25");
  assert.deepEqual(connectionDetailRows(positive, null).map((row) => `${row.label}:${row.value}`), [
    "Innovation:7",
    "Source:I1: Relative ROC",
    "Target:O1: Long",
    "Base weight:1.25000",
    "Learned delta:0.00000",
    "Effective weight:1.25000",
    "State:enabled",
  ]);
}

function testReproductionRequirementMeterUsesConfiguredMaximumPressure() {
  const activeSpawnerConfig = {
    ...DEFAULT_SPAWNER_CONFIG,
    reproductionEnergy: 20,
    reproductionCost: 10,
    reproductionCostMinMultiplier: 1,
    reproductionCostMaxMultiplier: 5,
  };

  assert.equal(
    reproductionRequirementMeterPercent({
      activeSpawnerConfig,
      currentReproductionEnergyRequirement: 50,
    }),
    100,
  );
  assert.equal(
    reproductionRequirementMeterPercent({
      activeSpawnerConfig,
      currentReproductionEnergyRequirement: 25,
    }),
    50,
  );
  assert.equal(
    reproductionRequirementMeterPercent({
      activeSpawnerConfig: { ...activeSpawnerConfig, reproductionEnergy: 0, reproductionCost: 0, reproductionCostMaxMultiplier: 0 },
      currentReproductionEnergyRequirement: 0,
    }),
    0,
  );
}

function testRosterViewSortsAndFiltersVisiblePacketWithoutMutation() {
  const roster = [
    rosterFixture({ id: 3, lineageId: 2, generation: 0, energy: 10, pendingFoodCount: 0, lastAction: "wait", uniqueness: null, birthTick: 190, resolvedCount: 25 }),
    rosterFixture({ id: 1, lineageId: 1, generation: 2, energy: 24, pendingFoodCount: 2, lastAction: "long", uniqueness: 0.7, birthTick: 120, resolvedCount: 30 }),
    rosterFixture({ id: 2, lineageId: 1, generation: 1, energy: 18, pendingFoodCount: 1, lastAction: "short", uniqueness: 0.2, birthTick: 180, resolvedCount: 10 }),
  ];
  const originalOrder = roster.map((spawner) => spawner.id);
  const noMinimumFilters = { minResolvedTrades: "", minAgeTicks: "" };

  assert.deepEqual(
    viewRosterSpawners(roster, {
      sortKey: "energy",
      sortDirection: "desc",
      filters: { search: "l1", action: "all", ...noMinimumFilters },
      tick: 200,
    }).map((spawner) => spawner.id),
    [1, 2],
  );
  assert.deepEqual(roster.map((spawner) => spawner.id), originalOrder);
  assert.deepEqual(
    viewRosterSpawners(roster, {
      sortKey: "id",
      sortDirection: "asc",
      filters: { search: "", action: "short", ...noMinimumFilters },
      tick: 200,
    }).map((spawner) => spawner.id),
    [2],
  );
  assert.deepEqual(
    viewRosterSpawners(roster, {
      sortKey: "uniqueness",
      sortDirection: "desc",
      filters: { search: "", action: "all", ...noMinimumFilters },
      tick: 200,
    }).map((spawner) => spawner.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    viewRosterSpawners(roster, {
      sortKey: "id",
      sortDirection: "asc",
      filters: { search: "", action: "all", minResolvedTrades: "20", minAgeTicks: "" },
      tick: 200,
    }).map((spawner) => spawner.id),
    [1, 3],
  );
  assert.deepEqual(
    viewRosterSpawners(roster, {
      sortKey: "id",
      sortDirection: "asc",
      filters: { search: "", action: "all", minResolvedTrades: "", minAgeTicks: "50" },
      tick: 200,
    }).map((spawner) => spawner.id),
    [1],
  );
  assert.deepEqual(
    viewRosterSpawners(roster, {
      sortKey: "id",
      sortDirection: "asc",
      filters: { search: "", action: "all", minResolvedTrades: "20", minAgeTicks: "15" },
      tick: 200,
    }).map((spawner) => spawner.id),
    [1],
  );
}

function testVisiblePopulationCompositionUsesVisibleRosterOnly() {
  const composition = createVisiblePopulationComposition(
    [
      rosterFixture({ id: 1, lineageId: 1, generation: 0, birthTick: 94, pendingFoodCount: 1, lastAction: "long", uniqueness: 0.4 }),
      rosterFixture({ id: 2, lineageId: 1, generation: 3, birthTick: 40, pendingFoodCount: 0, lastAction: "wait", uniqueness: null }),
      rosterFixture({ id: 3, lineageId: 2, generation: 7, birthTick: 99, pendingFoodCount: 2, lastAction: "short", uniqueness: 0.8 }),
    ],
    100,
  );

  assert.equal(composition.totalVisible, 3);
  assert.deepEqual(composition.actionCounts, { long: 1, short: 1, wait: 1 });
  assert.equal(composition.lineageCount, 2);
  assert.equal(composition.pendingFoodAgents, 2);
  assert.equal(composition.newbornAgents, 2);
  assert.equal(composition.uniquenessSampled, 2);
  assert.equal(composition.uniquenessMissing, 1);
  assert.deepEqual(composition.generationBuckets.map((bucket) => `${bucket.label}:${bucket.count}`), [
    "gen 0:1",
    "gen 1:0",
    "gen 2:0",
    "gen 3-5:1",
    "gen 6+:1",
  ]);
}

function testPacketBatchPreparesUniquenessBeforeChartWindow() {
  const simulation = createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 1, maxSpawners: 10 });
  const parent = simulation.world.spawners[0];
  assert.ok(parent);
  const child = structuredClone(parent);
  child.id = 999;
  child.generation = parent.generation + 1;
  child.birthTick = 100;
  simulation.world.tick = 100;
  simulation.world.spawners.push(child);

  const messages: MarketWorkerMessage[] = [];
  let packetSizes = {};
  const packetPoster = createWorkerPacketPoster({
    postMessage: (message) => messages.push(message),
    getState: () => ({
      sessionId: 4,
      simulation,
      version: 2,
      targetTick: 100,
      settings: INITIAL_SETTINGS,
      activeMarketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      pendingMarketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      activeSpawnerConfig: simulation.world.config,
      pendingSpawnerConfig: simulation.world.config,
      runState: "running",
      persistentSessionId: null,
      backlogTicks: 0,
      selectedSpawnerId: null,
      brainEvalMode: "sync",
    }),
    getPacketSizes: () => packetSizes,
    setPacketSizes: (nextPacketSizes) => {
      packetSizes = nextPacketSizes;
    },
    packetScheduler: createPacketScheduler(),
    persistenceOutbox: createPersistenceOutbox(),
    uniquenessRuntime: createUniquenessRuntimeService({ onDetailedScore: () => undefined }),
    strategyMap: createStrategyMapService(),
    selectedSpawnerTimeline: createSelectedSpawnerTimelineService(),
  });

  packetPoster.postAllPackets(true);

  const chart = messages.find((message): message is Extract<MarketWorkerMessage, { type: "chart" }> => message.type === "chart")?.packet;
  const roster = messages.find((message): message is Extract<MarketWorkerMessage, { type: "roster" }> => message.type === "roster")?.packet;
  assert.ok(chart);
  assert.ok(roster);
  assert.equal(chart.uniquenessSamples.at(-1)?.tick, 100);
  assert.equal(roster.spawners.find((spawner) => spawner.id === child.id)?.uniquenessComparisonTick, 100);
}

function testPausedUiPacketsDoNotRepeatWhenUnchanged() {
  const fixture = createPacketPosterFixture("paused");
  fixture.packetPoster.postUiPackets(true);
  const initialCounts = messageCounts(fixture.messages);
  assert.equal(initialCounts.chart, 1);
  assert.equal(initialCounts.roster, 1);
  assert.equal(initialCounts.stats, 1);
  assert.equal(fixture.prepareCount(), 1);

  fixture.packetPoster.postUiPackets(false);
  fixture.packetPoster.postUiPackets(false);

  const counts = messageCounts(fixture.messages);
  assert.equal(counts.chart, 1);
  assert.equal(counts.roster, 1);
  assert.equal(counts.stats, 1);
  assert.equal(fixture.prepareCount(), 1);
}

function testRunningUiPacketsPreserveSchedulerCadence() {
  const fixture = createPacketPosterFixture("running");
  fixture.packetPoster.postUiPackets(true);
  fixture.messages.length = 0;
  fixture.packetScheduler.retryNow("chart");

  fixture.packetPoster.postUiPackets(false);

  const counts = messageCounts(fixture.messages);
  assert.equal(counts.chart, 1);
  assert.equal(counts.roster ?? 0, 0);
  assert.equal(counts.stats ?? 0, 0);
}

function testForcedUiPacketsStillPostAllUiFamilies() {
  const fixture = createPacketPosterFixture("paused");
  fixture.packetPoster.postUiPackets(true);
  fixture.messages.length = 0;

  fixture.packetPoster.postUiPackets(true);

  const counts = messageCounts(fixture.messages);
  assert.equal(counts.chart, 1);
  assert.equal(counts.roster, 1);
  assert.equal(counts.stats, 1);
}

function testPersistenceCanPostWhilePausedUiIsSuppressed() {
  const fixture = createPacketPosterFixture("paused", { persistentSessionId: "paused-persist-test" });
  fixture.persistenceOutbox.captureInitialSpawners(fixture.simulation);
  fixture.packetPoster.postUiPackets(true);
  fixture.messages.length = 0;

  fixture.packetPoster.postUiPackets(false);
  fixture.packetPoster.postPersistencePacket(true);

  const counts = messageCounts(fixture.messages);
  assert.equal(counts.chart ?? 0, 0);
  assert.equal(counts.roster ?? 0, 0);
  assert.equal(counts.stats ?? 0, 0);
  assert.equal(counts.persistence, 1);
}

function testPausedStatsUpdateWhenOutboxDiagnosticsChange() {
  const fixture = createPacketPosterFixture("paused");
  fixture.packetPoster.postUiPackets(true);
  fixture.messages.length = 0;
  const spawner = fixture.simulation.world.spawners[0];
  assert.ok(spawner);

  fixture.persistenceOutbox.enqueueEvent({ id: 9001, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId });
  fixture.packetPoster.postUiPackets(false);

  const counts = messageCounts(fixture.messages);
  assert.equal(counts.chart ?? 0, 0);
  assert.equal(counts.roster ?? 0, 0);
  assert.equal(counts.stats, 1);
  const stats = fixture.messages.find((message): message is Extract<MarketWorkerMessage, { type: "stats" }> => message.type === "stats")?.packet;
  assert.equal(stats?.persistenceOutbox.pendingEvents, 1);
}

function connectionFixture(patch: Partial<ConnectionGene>): ConnectionGene {
  return {
    innovationId: 1,
    source: { kind: "input", index: 0 },
    target: { kind: "output", index: 0 },
    weight: 0,
    enabled: true,
    ...patch,
  } as ConnectionGene;
}

function rosterFixture(patch: Partial<RosterSpawnerSummary>): RosterSpawnerSummary {
  return {
    id: 1,
    lineageId: 1,
    generation: 0,
    birthTick: 0,
    cooldownTicks: 0,
    energy: 10,
    health: 100,
    pendingFoodCount: 0,
    hitRate: 0,
    recentAveragePayoff: 0,
    lastAction: "wait",
    spawnedCount: 0,
    resolvedCount: 0,
    children: 0,
    averagePayoff: 0,
    activeUnits: 1,
    activeLayers: 1,
    activeConnections: 1,
    disabledUnits: 0,
    disabledConnections: 0,
    recurrentConnections: 0,
    skipConnections: 0,
    averagePerceptionLag: 0,
    longestPerceptionWindow: 0,
    pendingDensityScale: 0,
    topologyMutationRate: 0,
    weightMutationActivity: 0,
    biasMutationActivity: 0,
    perceptionMutationRate: 0,
    mutationProfileDrift: 0,
    learnedDeltaNorm: 0,
    recentLearningSignal: 0,
    learningUpdateCount: 0,
    reproductionLearningCount: 0,
    plasticityLearningRateMean: 0,
    plasticityDecayRate: 0,
    plasticityMaxLearnedDelta: 0,
    plasticityMutationStdDev: 0,
    uniqueness: null,
    uniquenessComparisonTick: null,
    ...patch,
  };
}

function createPacketPosterFixture(
  runState: MarketRunState,
  options: { persistentSessionId?: string | null } = {},
) {
  const simulation = createSimulationState(INITIAL_MARKET_RUNTIME_CONFIG, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 1,
    maxSpawners: 10,
  });
  const messages: MarketWorkerMessage[] = [];
  let packetSizes = {};
  let prepareCount = 0;
  const packetScheduler = createPacketScheduler();
  const persistenceOutbox = createPersistenceOutbox();
  const strategyMap = createStrategyMapService();
  const originalPrepare = strategyMap.prepare;
  strategyMap.prepare = (nextSimulation, force) => {
    prepareCount += 1;
    return originalPrepare(nextSimulation, force);
  };
  const packetPoster = createWorkerPacketPoster({
    postMessage: (message) => messages.push(message),
    getState: () => ({
      sessionId: 41,
      simulation,
      version: 7,
      targetTick: simulation.world.tick,
      settings: INITIAL_SETTINGS,
      activeMarketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      pendingMarketConfig: INITIAL_MARKET_RUNTIME_CONFIG,
      activeSpawnerConfig: simulation.world.config,
      pendingSpawnerConfig: simulation.world.config,
      runState,
      persistentSessionId: options.persistentSessionId ?? null,
      backlogTicks: 0,
      selectedSpawnerId: null,
      brainEvalMode: "sync",
    }),
    getPacketSizes: () => packetSizes,
    setPacketSizes: (nextPacketSizes) => {
      packetSizes = nextPacketSizes;
    },
    packetScheduler,
    persistenceOutbox,
    uniquenessRuntime: createUniquenessRuntimeService({ onDetailedScore: () => undefined }),
    strategyMap,
    selectedSpawnerTimeline: createSelectedSpawnerTimelineService(),
  });

  return {
    simulation,
    messages,
    packetScheduler,
    persistenceOutbox,
    packetPoster,
    prepareCount: () => prepareCount,
  };
}

function messageCounts(messages: MarketWorkerMessage[]) {
  return messages.reduce((counts, message) => {
    counts[message.type] = (counts[message.type] ?? 0) + 1;
    return counts;
  }, {} as Partial<Record<MarketWorkerMessage["type"], number>>);
}

export const tests: SineTest[] = [
  { name: "Worker Commands Build Exact Payloads", run: testWorkerCommandsBuildExactPayloads },
  { name: "Worker Command Builders Cover Protocol Commands", run: testWorkerCommandBuildersCoverProtocolCommands },
  { name: "Worker Message Router Routes Matching Sessions", run: testWorkerMessageRouterRoutesMatchingSessions },
  { name: "Worker Message Router Ignores Stale Sessions", run: testWorkerMessageRouterIgnoresStaleSessions },
  { name: "Worker Command Dispatch Preserves Session Rules", run: testWorkerCommandDispatchPreservesSessionRules },
  { name: "Worker Session Pause Stop Invalidate In Flight Advance", run: testWorkerSessionPauseStopInvalidateInFlightAdvance },
  { name: "Worker Session Playback End Uses Existing Stop Path", run: testWorkerSessionPlaybackEndUsesExistingStopPath },
  { name: "Inspection Request Store Rejects Pending Requests", run: testInspectionRequestStoreRejectsPendingRequests },
  { name: "Architecture Connection Presentation Matches Current Formatting", run: testArchitectureConnectionPresentationMatchesCurrentFormatting },
  { name: "Reproduction Requirement Meter Uses Configured Maximum Pressure", run: testReproductionRequirementMeterUsesConfiguredMaximumPressure },
  { name: "Roster View Sorts And Filters Visible Packet Without Mutation", run: testRosterViewSortsAndFiltersVisiblePacketWithoutMutation },
  { name: "Visible Population Composition Uses Visible Roster Only", run: testVisiblePopulationCompositionUsesVisibleRosterOnly },
  { name: "Packet Batch Prepares Uniqueness Before Chart Window", run: testPacketBatchPreparesUniquenessBeforeChartWindow },
  { name: "Paused UI Packets Do Not Repeat When Unchanged", run: testPausedUiPacketsDoNotRepeatWhenUnchanged },
  { name: "Running UI Packets Preserve Scheduler Cadence", run: testRunningUiPacketsPreserveSchedulerCadence },
  { name: "Forced UI Packets Still Post All UI Families", run: testForcedUiPacketsStillPostAllUiFamilies },
  { name: "Persistence Can Post While Paused UI Is Suppressed", run: testPersistenceCanPostWhilePausedUiIsSuppressed },
  { name: "Paused Stats Update When Outbox Diagnostics Change", run: testPausedStatsUpdateWhenOutboxDiagnosticsChange },
];
