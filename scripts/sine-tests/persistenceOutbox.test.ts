import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { createPersistenceOutbox } from "../../src/sine/persistence/persistenceOutbox";
import { DEFAULT_SPAWNER_CONFIG, type SpawnerEvent } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import type { SineTest } from "./helpers";

function testPersistenceOutboxRetriesSamePacketAfterFailure() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const outbox = createPersistenceOutbox();
  const first = outbox.createDelivery(makeArgs({ simulation, outboxForce: true }));
  assert.ok(first);

  simulation.world.tick = 999;
  simulation.world.tick = 999;
  assert.equal(outbox.createDelivery(makeArgs({ simulation, outboxForce: true })), null);
  assert.equal(outbox.acknowledge(first.id, false), true);
  const retry = outbox.createDelivery(makeArgs({ simulation, outboxForce: true }));

  assert.ok(retry);
  assert.equal(retry.id, first.id);
  assert.equal(retry.packet.tick, first.packet.tick);
}

function testPersistenceOutboxClearsOnlyAfterSuccessAck() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const outbox = createPersistenceOutbox();
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const event: SpawnerEvent = {
    id: 10,
    kind: "spawn",
    tick: 1,
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
  };
  outbox.enqueueEvent(event);
  const first = outbox.createDelivery(makeArgs({ simulation, outboxForce: false }));
  assert.ok(first);
  assert.equal(first.packet.events.length, 1);
  assert.equal(outbox.acknowledge(first.id, true), true);
  const afterAck = outbox.createDelivery(makeArgs({ simulation, outboxForce: false }));

  assert.equal(afterAck, null);
}

function testPersistenceOutboxPersistsStopAfterInFlightAck() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const outbox = createPersistenceOutbox();
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  outbox.enqueueEvent({ id: 50, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId });
  const first = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" }));
  assert.ok(first);
  assert.equal(first.packet.events.length, 1);

  const blockedStop = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "stopped" }));
  assert.equal(blockedStop, null);
  assert.equal(outbox.acknowledge(first.id, true), true);
  const stopDelivery = outbox.createDelivery(makeArgs({ simulation, outboxForce: false, status: "stopped" }));

  assert.ok(stopDelivery);
  assert.equal(stopDelivery.packet.status, "stopped");
  assert.equal(stopDelivery.packet.events.length, 0);
  assert.equal(stopDelivery.packet.stateSnapshots.length, 0);
}

function testPersistenceOutboxPersistsPauseAfterInFlightAck() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const outbox = createPersistenceOutbox();
  const first = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" }));
  assert.ok(first);

  const blockedPause = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "paused" }));
  assert.equal(blockedPause, null);
  assert.equal(outbox.acknowledge(first.id, true), true);
  const pauseDelivery = outbox.createDelivery(makeArgs({ simulation, outboxForce: false, status: "paused" }));

  assert.ok(pauseDelivery);
  assert.equal(pauseDelivery.packet.status, "paused");
}

function testPersistenceOutboxKeepsStoppedStatusStickyWhileInFlight() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const outbox = createPersistenceOutbox();
  const first = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" }));
  assert.ok(first);

  assert.equal(outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "stopped" })), null);
  assert.equal(outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" })), null);
  assert.equal(outbox.acknowledge(first.id, true), true);
  const stopDelivery = outbox.createDelivery(makeArgs({ simulation, outboxForce: false, status: "running" }));

  assert.ok(stopDelivery);
  assert.equal(stopDelivery.packet.status, "stopped");
}

function testPersistenceOutboxKeepsInitialFoundersThatDieBeforeFirstDelivery() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 2 });
  const outbox = createPersistenceOutbox();
  outbox.captureInitialSpawners(simulation);
  const [deadFounder, survivor] = simulation.world.spawners;
  assert.ok(deadFounder);
  assert.ok(survivor);
  const capturedEnergy = deadFounder.energy;
  deadFounder.energy = -999;
  simulation.world.spawners = [survivor];
  outbox.enqueueEvent({
    id: 77,
    kind: "death",
    tick: 1,
    spawnerId: deadFounder.id,
    lineageId: deadFounder.lineageId,
    spawnerSnapshot: deadFounder,
  });

  const delivery = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" }));

  assert.ok(delivery);
  assert.equal(delivery.packet.births.length, 2);
  assert.equal(delivery.packet.genomeSnapshots.length, 2);
  assert.equal(delivery.packet.deaths.length, 1);
  assert.equal(delivery.packet.births.find((birth) => birth.spawner.id === deadFounder.id)?.spawner.energy, capturedEnergy);
  assert.equal(outbox.acknowledge(delivery.id, true), true);
  const next = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" }));
  assert.ok(next);
  assert.equal(next.packet.births.length, 0);
  assert.equal(next.packet.genomeSnapshots.length, 0);
}

function testPersistenceOutboxDiagnosticsTrackDeliveryLifecycle() {
  const simulation = createSimulationState(INITIAL_SETTINGS, DEFAULT_SPAWNER_CONFIG);
  const outbox = createPersistenceOutbox();
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);

  assert.deepEqual(outbox.diagnostics(), {
    pendingEvents: 0,
    pendingUniquenessSnapshots: 0,
    hasInFlight: false,
    inFlightPacketKb: null,
    pendingStatus: null,
    retryPending: false,
  });

  outbox.enqueueEvent({ id: 200, kind: "spawn", tick: 1, spawnerId: spawner.id, lineageId: spawner.lineageId });
  assert.equal(outbox.diagnostics().pendingEvents, 1);

  const delivery = outbox.createDelivery(makeArgs({ simulation, outboxForce: true, status: "running" }));
  assert.ok(delivery);
  let diagnostics = outbox.diagnostics();
  assert.equal(diagnostics.pendingEvents, 1);
  assert.equal(diagnostics.hasInFlight, true);
  assert.equal(typeof diagnostics.inFlightPacketKb, "number");
  assert.equal(diagnostics.retryPending, false);

  assert.equal(outbox.acknowledge(delivery.id, false), true);
  diagnostics = outbox.diagnostics();
  assert.equal(diagnostics.pendingEvents, 1);
  assert.equal(diagnostics.hasInFlight, true);
  assert.equal(diagnostics.retryPending, true);

  const retry = outbox.createDelivery(makeArgs({ simulation, outboxForce: false, status: "running" }));
  assert.ok(retry);
  assert.equal(retry.id, delivery.id);
  assert.equal(outbox.diagnostics().retryPending, false);

  assert.equal(outbox.acknowledge(retry.id, true), true);
  diagnostics = outbox.diagnostics();
  assert.equal(diagnostics.pendingEvents, 0);
  assert.equal(diagnostics.hasInFlight, false);
  assert.equal(diagnostics.inFlightPacketKb, null);

  outbox.enqueueEvent({ id: 201, kind: "spawn", tick: 2, spawnerId: spawner.id, lineageId: spawner.lineageId });
  assert.equal(outbox.diagnostics().pendingEvents, 1);
  outbox.reset();
  assert.equal(outbox.diagnostics().pendingEvents, 0);
}

function makeArgs({
  simulation,
  outboxForce,
  status = "running",
}: {
  simulation: ReturnType<typeof createSimulationState>;
  outboxForce: boolean;
  status?: "running" | "paused" | "stopped";
}) {
  return {
    force: outboxForce,
    sessionId: 1,
    persistentSessionId: "outbox-test",
    status,
    simulation,
    settings: INITIAL_SETTINGS,
    spawnerConfig: DEFAULT_SPAWNER_CONFIG,
    uniquenessScores: new Map(),
    lastUniquenessTick: Number.NEGATIVE_INFINITY,
    stateSnapshotIntervalTicks: 50,
  };
}

export const tests: SineTest[] = [
  { name: "Persistence Outbox Retries Same Packet After Failure", run: testPersistenceOutboxRetriesSamePacketAfterFailure },
  { name: "Persistence Outbox Clears Only After Success Ack", run: testPersistenceOutboxClearsOnlyAfterSuccessAck },
  { name: "Persistence Outbox Persists Stop After In Flight Ack", run: testPersistenceOutboxPersistsStopAfterInFlightAck },
  { name: "Persistence Outbox Persists Pause After In Flight Ack", run: testPersistenceOutboxPersistsPauseAfterInFlightAck },
  { name: "Persistence Outbox Keeps Stopped Status Sticky While In Flight", run: testPersistenceOutboxKeepsStoppedStatusStickyWhileInFlight },
  { name: "Persistence Outbox Keeps Initial Founders That Die Before First Delivery", run: testPersistenceOutboxKeepsInitialFoundersThatDieBeforeFirstDelivery },
  { name: "Persistence Outbox Diagnostics Track Delivery Lifecycle", run: testPersistenceOutboxDiagnosticsTrackDeliveryLifecycle },
];
