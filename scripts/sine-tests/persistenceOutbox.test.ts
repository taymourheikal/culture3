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

function makeArgs({ simulation, outboxForce }: { simulation: ReturnType<typeof createSimulationState>; outboxForce: boolean }) {
  return {
    force: outboxForce,
    sessionId: 1,
    persistentSessionId: "outbox-test",
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
];
