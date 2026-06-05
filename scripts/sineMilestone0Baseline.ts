import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../src/sine/marketRuntimeConfig";
import { INITIAL_SETTINGS } from "../src/sine/marketSignal";
import {
  createMarketChartPacket,
  createMarketRosterPacket,
  createMarketStatsPacket,
  createSpawnerArchitecturePacket,
  createSpawnerInspectionPacket,
  createSpawnerUniquenessDetailPacket,
  estimatePacketKb,
} from "../src/sine/marketWorkerSnapshot";
import { buildSinePersistencePacket } from "../src/sine/persistence/buildSinePersistencePacket";
import { advanceSimulationToTarget, createSimulationState } from "../src/sine/simulationRuntime";
import { computeSpawnerUniqueness, DEFAULT_SPAWNER_CONFIG } from "../src/sine/spawnerSimulation";
import { runHeadlessSineExperiment } from "../src/sine/headless/runner";

const PACKET_POPULATION = 250;
const PACKET_TICK = 50;
const HEADLESS_POPULATION = 100;
const HEADLESS_TICKS = 500;
const HEADLESS_CHUNK_TICKS = 100;
const HEADLESS_CHECKPOINT_INTERVAL_TICKS = 100;

const headlessDbDir = mkdtempSync(join(tmpdir(), "sine-headless-baseline-"));
process.env.SINE_DB_PATH = join(headlessDbDir, "toy-market.sqlite");
const repositoryModule = await import(new URL("../server/sineHeadlessRepository.mjs", import.meta.url).href);

const packetSimulation = createSimulationState(
  INITIAL_MARKET_RUNTIME_CONFIG,
  {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: PACKET_POPULATION,
    maxSpawners: PACKET_POPULATION,
    uniquenessPopulationLimit: 1000,
  },
  { seed: 101 },
);
advanceSimulationToTarget(packetSimulation, PACKET_TICK, PACKET_TICK);
const uniquenessScores = computeSpawnerUniqueness(packetSimulation.world.spawners, packetSimulation.world.tick);
const spawner = packetSimulation.world.spawners[0] ?? null;
const packets = {
  chart: createMarketChartPacket({ sessionId: 1, simulation: packetSimulation, version: 1, centerTick: packetSimulation.world.tick }),
  roster: createMarketRosterPacket({ sessionId: 1, simulation: packetSimulation, version: 1, uniquenessScores }),
  stats: createMarketStatsPacket({
    sessionId: 1,
    simulation: packetSimulation,
    settings: INITIAL_SETTINGS,
    marketConfig: packetSimulation.marketConfig,
    pendingMarketConfig: packetSimulation.marketConfig,
    spawnerConfig: packetSimulation.world.config,
    pendingSpawnerConfig: packetSimulation.world.config,
    playing: true,
    runState: "running",
    persistentSessionId: "baseline",
    version: 1,
    backlogTicks: 0,
    packetSizesKb: {},
  }),
  persistence: buildSinePersistencePacket({
    sessionId: 1,
    persistentSessionId: "baseline",
    simulation: packetSimulation,
    settings: INITIAL_SETTINGS,
    marketConfig: packetSimulation.marketConfig,
    spawnerConfig: packetSimulation.world.config,
    events: packetSimulation.world.recentEvents,
    includeInitial: true,
    includeStateSnapshot: true,
    pendingUniquenessSnapshots: [],
    uniquenessScores,
    includeFullUniquenessTick: packetSimulation.world.tick,
  }),
  architecture: createSpawnerArchitecturePacket({ sessionId: 1, spawnerId: spawner?.id ?? 1, spawner }),
  inspection: createSpawnerInspectionPacket({
    sessionId: 1,
    requestId: 1,
    simulation: packetSimulation,
    spawnerId: spawner?.id ?? 1,
    uniquenessScore: spawner ? uniquenessScores.get(spawner.id) ?? null : null,
  }),
  uniqueness: createSpawnerUniquenessDetailPacket({
    sessionId: 1,
    spawnerId: spawner?.id ?? 1,
    score: spawner ? uniquenessScores.get(spawner.id) ?? null : null,
  }),
};

console.log(
  JSON.stringify(
    {
      packetBaseline: {
        seed: 101,
        population: PACKET_POPULATION,
        tick: PACKET_TICK,
        packetSizesKb: Object.fromEntries(Object.entries(packets).map(([key, packet]) => [key, Number(estimatePacketKb(packet).toFixed(3))])),
      },
    },
    null,
    2,
  ),
);

const repository = repositoryModule.createSineHeadlessRepository();
try {
  const result = await runHeadlessSineExperiment({
    runId: "milestone-0-baseline",
    ticks: HEADLESS_TICKS,
    seed: 101,
    spawnerConfig: {
      ...DEFAULT_SPAWNER_CONFIG,
      initialSpawners: HEADLESS_POPULATION,
      maxSpawners: HEADLESS_POPULATION,
    },
    minimumResolvedTrades: 1,
    checkpointIntervalTicks: HEADLESS_CHECKPOINT_INTERVAL_TICKS,
    chunkTicks: HEADLESS_CHUNK_TICKS,
    sink: repository.sink,
  });
  const timing = result.timing;
  console.log(
    JSON.stringify(
      {
        headlessBaseline: {
          seed: 101,
          population: HEADLESS_POPULATION,
          targetTicks: HEADLESS_TICKS,
          chunkTicks: HEADLESS_CHUNK_TICKS,
          checkpointIntervalTicks: HEADLESS_CHECKPOINT_INTERVAL_TICKS,
          finalTick: result.tick,
          status: result.status,
          terminationReason: result.terminationReason,
          counts: repository.counts(result.runId),
          timing: {
            runMs: round(timing.runMs),
            chunks: timing.chunks,
            simulatedTicks: timing.simulatedTicks,
            advanceTotalMs: round(timing.advanceTotalMs),
            recorderEventMs: round(timing.recorderEventMs),
            recorderFounderMs: round(timing.recorderFounderMs),
            recorderFinalizeMs: round(timing.recorderFinalizeMs),
            checkpointMs: round(timing.checkpointMs),
            candleLoadMs: round(timing.candleLoadMs),
            sinkWriteMs: round(timing.sinkWriteMs),
            sinkWrites: timing.sinkWrites,
            topSinkMethod: timing.topSinkMethod
              ? {
                  method: timing.topSinkMethod.method,
                  calls: timing.topSinkMethod.calls,
                  ms: round(timing.topSinkMethod.ms),
                }
              : null,
            latestChunk: timing.latestChunk
              ? {
                  ...timing.latestChunk,
                  chunkMs: round(timing.latestChunk.chunkMs),
                  advanceTotalMs: round(timing.latestChunk.advanceTotalMs),
                  recorderEventMs: round(timing.latestChunk.recorderEventMs),
                  sinkWriteMs: round(timing.latestChunk.sinkWriteMs),
                  simulationCoreEstimateMs: round(timing.latestChunk.simulationCoreEstimateMs),
                  ticksPerSecond: round(timing.latestChunk.ticksPerSecond),
                }
              : null,
          },
        },
      },
      null,
      2,
    ),
  );
} finally {
  repository.close();
  rmSync(headlessDbDir, { recursive: true, force: true });
}

function round(value: number) {
  return Number(value.toFixed(3));
}
