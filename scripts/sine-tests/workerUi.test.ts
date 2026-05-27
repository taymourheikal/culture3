import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../../src/sine/marketRuntimeConfig";
import { MARKET_WORKER_COMMAND_TYPES, type MarketWorkerMessage } from "../../src/sine/marketWorkerProtocol";
import { connectionDetailRows, connectionRowClass, connectionRowParts, graphConnectionStyle } from "../../src/sine/architectureConnectionPresentation";
import { createInspectionRequestStore } from "../../src/sine/hooks/inspectionRequestStore";
import { DEFAULT_SPAWNER_CONFIG, type ConnectionGene } from "../../src/sine/spawnerSimulation";
import { workerCommands } from "../../src/sine/worker/workerCommands";
import { dispatchMarketWorkerCommand } from "../../src/sine/worker/marketWorkerCommandHandler";
import { routeMarketWorkerMessage } from "../../src/sine/worker/workerMessageRouter";
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
  assert.equal(graphConnectionStyle(positive).color, "#69d7d0");
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

export const tests: SineTest[] = [
  { name: "Worker Commands Build Exact Payloads", run: testWorkerCommandsBuildExactPayloads },
  { name: "Worker Command Builders Cover Protocol Commands", run: testWorkerCommandBuildersCoverProtocolCommands },
  { name: "Worker Message Router Routes Matching Sessions", run: testWorkerMessageRouterRoutesMatchingSessions },
  { name: "Worker Message Router Ignores Stale Sessions", run: testWorkerMessageRouterIgnoresStaleSessions },
  { name: "Worker Command Dispatch Preserves Session Rules", run: testWorkerCommandDispatchPreservesSessionRules },
  { name: "Worker Session Pause Stop Invalidate In Flight Advance", run: testWorkerSessionPauseStopInvalidateInFlightAdvance },
  { name: "Inspection Request Store Rejects Pending Requests", run: testInspectionRequestStoreRejectsPendingRequests },
  { name: "Architecture Connection Presentation Matches Current Formatting", run: testArchitectureConnectionPresentationMatchesCurrentFormatting },
];
