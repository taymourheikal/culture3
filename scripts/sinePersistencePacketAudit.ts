import { INITIAL_SETTINGS } from "../src/sine/marketSignal";
import { createSimulationState, advanceSimulationToTarget } from "../src/sine/simulationRuntime";
import { createPersistenceOutbox } from "../src/sine/persistence/persistenceOutbox";
import { DEFAULT_SPAWNER_CONFIG, computeSpawnerUniqueness, type SpawnerEvent } from "../src/sine/spawnerSimulation";
import type { SinePersistencePacket } from "../src/sine/marketWorkerProtocol";

type PacketAudit = {
  label: string;
  tick: number;
  totalKb: number;
  overheadKb: number;
  families: Record<string, { count: number; kb: number }>;
};

const STATE_SNAPSHOT_INTERVAL_TICKS = 50;

function main() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 250,
    maxSpawners: 250,
  });
  const outbox = createPersistenceOutbox();
  outbox.captureInitialSpawners(simulation);

  const initialScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const initial = outbox.createDelivery({
    force: true,
    sessionId: 1,
    persistentSessionId: "audit-run",
    status: "running",
    simulation,
    settings: INITIAL_SETTINGS,
    marketConfig: simulation.marketConfig,
    spawnerConfig: simulation.world.config,
    uniquenessScores: initialScores,
    lastUniquenessTick: simulation.world.tick,
    stateSnapshotIntervalTicks: STATE_SNAPSHOT_INTERVAL_TICKS,
  });
  if (!initial) throw new Error("Initial persistence packet was not created");
  outbox.acknowledge(initial.id, true);

  const events: SpawnerEvent[] = [];
  simulation.world.eventSink = (event) => {
    events.push(event);
    outbox.enqueueEvent(event);
  };
  advanceSimulationToTarget(simulation, simulation.world.tick + STATE_SNAPSHOT_INTERVAL_TICKS, STATE_SNAPSHOT_INTERVAL_TICKS);
  const steadyScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  const steady = outbox.createDelivery({
    force: true,
    sessionId: 1,
    persistentSessionId: "audit-run",
    status: "running",
    simulation,
    settings: INITIAL_SETTINGS,
    marketConfig: simulation.marketConfig,
    spawnerConfig: simulation.world.config,
    uniquenessScores: steadyScores,
    lastUniquenessTick: simulation.world.tick,
    stateSnapshotIntervalTicks: STATE_SNAPSHOT_INTERVAL_TICKS,
  });
  if (!steady) throw new Error("Steady-state persistence packet was not created");

  const audits = [auditPacket("initial", initial.packet), auditPacket("steadyState50Ticks", steady.packet)];
  console.log(JSON.stringify({ stateSnapshotIntervalTicks: STATE_SNAPSHOT_INTERVAL_TICKS, eventsCaptured: events.length, audits }, null, 2));
}

function auditPacket(label: string, packet: SinePersistencePacket): PacketAudit {
  const families = {
    births: family(packet.births),
    deaths: family(packet.deaths),
    genomeSnapshots: family(packet.genomeSnapshots),
    stateSnapshots: family(packet.stateSnapshots),
    foodEvents: family(packet.foodEvents),
    events: family(packet.events),
    uniquenessSnapshots: family(packet.uniquenessSnapshots),
  };
  const totalKb = kb(packet);
  const familyKb = Object.values(families).reduce((sum, row) => sum + row.kb, 0);
  return {
    label,
    tick: packet.tick,
    totalKb,
    overheadKb: roundKb(totalKb - familyKb),
    families,
  };
}

function family(rows: unknown[]) {
  return {
    count: rows.length,
    kb: kb(rows),
  };
}

function kb(value: unknown) {
  return roundKb(JSON.stringify(value).length / 1024);
}

function roundKb(value: number) {
  return Math.round(Math.max(0, value) * 10) / 10;
}

main();
