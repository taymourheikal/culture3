import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { INITIAL_SETTINGS } from "../src/sine/marketSignal";
import { createSimulationState, advanceSimulationToTarget } from "../src/sine/simulationRuntime";
import { createPersistenceOutbox } from "../src/sine/persistence/persistenceOutbox";
import { DEFAULT_SPAWNER_CONFIG, computeSpawnerUniqueness, type SpawnerConfig, type SpawnerEvent } from "../src/sine/spawnerSimulation";
import type { SinePersistencePacket } from "../src/sine/marketWorkerProtocol";

type CliOptions = {
  population: number;
  intervals: number;
  intervalTicks: number;
  seed: number;
  db?: string;
};

const options = parseArgs(process.argv.slice(2));
const tempDir = options.db ? null : mkdtempSync(join(tmpdir(), "sine-lab-write-benchmark-"));
const dbPath = options.db ?? join(tempDir!, "toy-market.sqlite");
process.env.SINE_DB_PATH = dbPath;

const [{ saveSinePersistenceBatch }, { sineDb }] = await Promise.all([
  import(new URL("../server/sineRepository.mjs", import.meta.url).href),
  import(new URL("../server/sineDb.mjs", import.meta.url).href),
]);

try {
  const result = runBenchmark();
  console.log(JSON.stringify(result, null, 2));
} finally {
  sineDb.close();
}

function runBenchmark() {
  const sessionId = `lab-write-benchmark-${Date.now()}`;
  const simulation = createSimulationState(
    INITIAL_SETTINGS,
    {
      ...DEFAULT_SPAWNER_CONFIG,
      initialSpawners: options.population,
      maxSpawners: options.population,
      uniquenessPopulationLimit: 1000,
    } satisfies Partial<SpawnerConfig>,
    { seed: options.seed },
  );
  const outbox = createPersistenceOutbox();
  outbox.captureInitialSpawners(simulation);
  const writes: Array<{
    label: string;
    tick: number;
    ms: number;
    packetKb: number;
    packetRows: ReturnType<typeof packetRows>;
    saveResult: unknown;
  }> = [];

  const initialScores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
  writeDelivery("initial", initialScores, simulation.world.tick, true);

  const eventBuffer: SpawnerEvent[] = [];
  simulation.world.eventSink = (event) => {
    eventBuffer.push(event);
    outbox.enqueueEvent(event);
  };

  for (let index = 0; index < options.intervals; index += 1) {
    const target = simulation.world.tick + options.intervalTicks;
    advanceSimulationToTarget(simulation, target, options.intervalTicks);
    const scores = computeSpawnerUniqueness(simulation.world.spawners, simulation.world.tick);
    writeDelivery(`steady-${index + 1}`, scores, simulation.world.tick, true);
  }

  return {
    ok: true,
    dbPath,
    tempDb: tempDir !== null,
    settings: {
      seed: options.seed,
      population: options.population,
      intervals: options.intervals,
      intervalTicks: options.intervalTicks,
      finalTick: simulation.world.tick,
      capturedEvents: eventBuffer.length,
    },
    writes,
    summary: summarizeWrites(writes),
    tableCounts: tableCounts(sessionId),
    dbSizeKb: roundKb(dbSizeBytes(dbPath) / 1024),
  };

  function writeDelivery(label: string, uniquenessScores: ReturnType<typeof computeSpawnerUniqueness>, lastUniquenessTick: number, force: boolean) {
    const delivery = outbox.createDelivery({
      force,
      sessionId: 1,
      persistentSessionId: sessionId,
      status: "running",
      simulation,
      settings: INITIAL_SETTINGS,
      marketConfig: simulation.marketConfig,
      spawnerConfig: simulation.world.config,
      uniquenessScores,
      lastUniquenessTick,
      stateSnapshotIntervalTicks: options.intervalTicks,
    });
    if (!delivery) throw new Error(`No persistence delivery for ${label}`);
    const started = performance.now();
    const saveResult = saveSinePersistenceBatch(delivery.packet);
    const ms = performance.now() - started;
    outbox.acknowledge(delivery.id, true);
    writes.push({
      label,
      tick: delivery.packet.tick,
      ms: round(ms),
      packetKb: roundKb(JSON.stringify(delivery.packet).length / 1024),
      packetRows: packetRows(delivery.packet),
      saveResult,
    });
  }
}

function packetRows(packet: SinePersistencePacket) {
  return {
    births: packet.births.length,
    deaths: packet.deaths.length,
    genomeSnapshots: packet.genomeSnapshots.length,
    stateSnapshots: packet.stateSnapshots.length,
    foodEvents: packet.foodEvents.length,
    events: packet.events.length,
    uniquenessSnapshots: packet.uniquenessSnapshots.length,
  };
}

function summarizeWrites(writes: Array<{ label: string; ms: number }>) {
  const initial = writes.find((write) => write.label === "initial") ?? null;
  const steady = writes.filter((write) => write.label !== "initial");
  const steadyMs = steady.map((write) => write.ms);
  return {
    initialMs: initial?.ms ?? null,
    steadyCount: steady.length,
    steadyAverageMs: average(steadyMs),
    steadyMinMs: min(steadyMs),
    steadyMaxMs: max(steadyMs),
  };
}

function tableCounts(sessionId: string) {
  const tables = [
    "sine_sessions",
    "sine_spawner_births",
    "sine_spawner_deaths",
    "sine_spawner_genome_snapshots",
    "sine_spawner_state_snapshots",
    "sine_food_events",
    "sine_events",
    "sine_spawner_uniqueness_snapshots",
  ];
  return Object.fromEntries(
    tables.map((table) => [
      table,
      sineDb.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === "sine_sessions" ? "id" : "session_id"} = ?`).get(sessionId)?.count ?? 0,
    ]),
  );
}

function dbSizeBytes(dbPath: string) {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].reduce((sum, path) => sum + (existsSync(path) ? statSync(path).size : 0), 0);
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}`);
    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values.set(key, next);
    index += 1;
  }
  return {
    population: readInteger(values.get("population") ?? "250", "--population", 1),
    intervals: readInteger(values.get("intervals") ?? "10", "--intervals", 1),
    intervalTicks: readInteger(values.get("interval-ticks") ?? "50", "--interval-ticks", 1),
    seed: readInteger(values.get("seed") ?? "101", "--seed", 0),
    db: values.get("db"),
  };
}

function readInteger(value: string, label: string, min: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.floor(parsed) < min) throw new Error(`${label} must be an integer >= ${min}`);
  return Math.floor(parsed);
}

function average(values: number[]) {
  return values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function min(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function max(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function roundKb(value: number) {
  return Number(value.toFixed(1));
}
