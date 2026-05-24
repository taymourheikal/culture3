import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawnerSimulation";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import { createUniquenessInspectionService, UNIQUENESS_INTERVAL_TICKS } from "../../src/sine/worker/uniquenessInspectionService";
import { createUniquenessTelemetryService } from "../../src/sine/worker/uniquenessTelemetryService";
import { createUniquenessTelemetryWindow, UNIQUENESS_TELEMETRY_SAMPLE_LIMIT } from "../../src/sine/marketWorkerSnapshot";
import type { SineTest } from "./helpers";

function testUniquenessTelemetrySummarizesRawDistance() {
  const service = createUniquenessTelemetryService();
  service.record(
    new Map([
      [1, score(1)],
      [2, score(3)],
      [3, score(5)],
      [4, score(7)],
    ]),
    100,
  );
  const window = service.window(100);
  const sample = window.uniquenessSamples[0];

  assert.ok(sample);
  assert.equal(sample.tick, 100);
  assert.equal(sample.p25RawDistance, 2.5);
  assert.equal(sample.medianRawDistance, 4);
  assert.equal(sample.p75RawDistance, 5.5);
  assert.equal(window.uniquenessRawDistanceMax, 5.5 * 1.18);
}

function testUniquenessTelemetryBoundsHistoryAndSelectedLine() {
  const service = createUniquenessTelemetryService();
  for (let tick = 1; tick <= 3100; tick += 1) {
    service.record(
      new Map([
        [1, score(tick)],
        [2, score(tick * 2)],
      ]),
      tick,
    );
  }
  service.setSelectedSpawner(2);
  const window = service.window(3100);

  assert.equal(service.sampleCount(), 3000);
  assert.ok(window.uniquenessSamples.length <= UNIQUENESS_TELEMETRY_SAMPLE_LIMIT);
  assert.ok(window.selectedSpawnerUniquenessSamples.length <= UNIQUENESS_TELEMETRY_SAMPLE_LIMIT);
  assert.equal(window.uniquenessSamples[0]?.tick, 101);
  assert.equal(window.uniquenessSamples.at(-1)?.tick, 3100);
  assert.equal(window.selectedSpawnerUniquenessSamples.at(-1)?.rawDistance, 6200);
}

function testUniquenessWindowDownsamplesWithStableEdges() {
  const aggregateSamples = Array.from({ length: 400 }, (_, index) => ({
    tick: index + 1,
    p25RawDistance: index,
    medianRawDistance: index + 1,
    p75RawDistance: index + 2,
  }));
  const selectedSamples = Array.from({ length: 400 }, (_, index) => ({ tick: index + 1, rawDistance: index + 3 }));
  const window = createUniquenessTelemetryWindow({ aggregateSamples, selectedSamples, renderTick: 400 });

  assert.ok(window.uniquenessSamples.length <= UNIQUENESS_TELEMETRY_SAMPLE_LIMIT + 1);
  assert.ok(window.selectedSpawnerUniquenessSamples.length <= UNIQUENESS_TELEMETRY_SAMPLE_LIMIT + 1);
  assert.equal(window.uniquenessSamples[0]?.tick, 1);
  assert.equal(window.uniquenessSamples.at(-1)?.tick, 400);
  assert.equal(window.selectedSpawnerUniquenessSamples[0]?.tick, 1);
  assert.equal(window.selectedSpawnerUniquenessSamples.at(-1)?.tick, 400);
}

function testUniquenessTelemetrySkipReason() {
  const service = createUniquenessTelemetryService();
  service.markSkipped("population_limit");
  const window = service.window(200);

  assert.equal(window.uniquenessSkippedReason, "population_limit");
  assert.equal(window.uniquenessSamples.length, 0);
  assert.equal(window.uniquenessEndTick, 200);
}

function testUniquenessRecoversImmediatelyAfterPopulationLimitDrops() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 130,
    maxSpawners: 130,
    uniquenessPopulationLimit: 120,
  });
  const inspection = createUniquenessInspectionService({ onDetailedScore: () => undefined });
  const skipped = inspection.computeIfNeeded(simulation, true);
  simulation.world.spawners = simulation.world.spawners.slice(0, 44);
  simulation.world.tick += 1;
  const recovered = inspection.computeIfNeeded(simulation, false);

  assert.equal(skipped.status, "skipped");
  assert.equal(recovered.status, "computed");
  assert.equal(recovered.scores.size, 44);
}

function testUniquenessSamplesAgainAfterRecoveryInterval() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 130,
    maxSpawners: 130,
    uniquenessPopulationLimit: 120,
  });
  const inspection = createUniquenessInspectionService({ onDetailedScore: () => undefined });
  inspection.computeIfNeeded(simulation, true);
  simulation.world.spawners = simulation.world.spawners.slice(0, 44);
  simulation.world.tick += 1;
  const recovered = inspection.computeIfNeeded(simulation, false);
  simulation.world.tick += UNIQUENESS_INTERVAL_TICKS - 1;
  const stillWaiting = inspection.computeIfNeeded(simulation, false);
  simulation.world.tick += 1;
  const nextSample = inspection.computeIfNeeded(simulation, false);

  assert.equal(recovered.status, "computed");
  assert.equal(stillWaiting.status, "unchanged");
  assert.equal(nextSample.status, "computed");
}

function testUniquenessPopulationLimitComesFromSpawnerConfig() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 130,
    maxSpawners: 130,
    uniquenessPopulationLimit: 200,
  });
  const inspection = createUniquenessInspectionService({ onDetailedScore: () => undefined });
  const result = inspection.computeIfNeeded(simulation, true);

  assert.equal(result.status, "computed");
  assert.equal(result.scores.size, 130);
}

function testUniquenessOnDemandRespectsPopulationLimit() {
  const simulation = createSimulationState(INITIAL_SETTINGS, {
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 130,
    maxSpawners: 130,
    uniquenessPopulationLimit: 120,
  });
  const inspection = createUniquenessInspectionService({ onDetailedScore: () => undefined });
  const spawner = simulation.world.spawners[0];
  assert.ok(spawner);
  const packet = inspection.uniquenessDetailPacket(3, simulation, spawner.id);
  const inspectionPacket = inspection.inspectionPacket(3, 44, simulation, spawner.id);

  assert.equal(packet.score, null);
  assert.equal(packet.skippedReason, "population_limit");
  assert.equal(inspectionPacket.ok, true);
  assert.equal(inspectionPacket.payload?.uniqueness, null);
}

function score(rawDistance: number) {
  return {
    version: "mahalanobis-v1" as const,
    vectorVersion: "functional-genome-v3" as const,
    score: 0,
    rawDistance,
    comparisonTick: 0,
    comparisonPopulationSize: 2,
    activeFeatureCount: 1,
    droppedFeatureCount: 0,
    nearestNeighborIds: [],
    mostSimilarFeatures: [],
    mostDissimilarFeatures: [],
  };
}

export const tests: SineTest[] = [
  { name: "Uniqueness Telemetry Summarizes Raw Distance", run: testUniquenessTelemetrySummarizesRawDistance },
  { name: "Uniqueness Telemetry Bounds History And Selected Line", run: testUniquenessTelemetryBoundsHistoryAndSelectedLine },
  { name: "Uniqueness Window Downsamples With Stable Edges", run: testUniquenessWindowDownsamplesWithStableEdges },
  { name: "Uniqueness Telemetry Skip Reason", run: testUniquenessTelemetrySkipReason },
  { name: "Uniqueness Recovers Immediately After Population Limit Drops", run: testUniquenessRecoversImmediatelyAfterPopulationLimitDrops },
  { name: "Uniqueness Samples Again After Recovery Interval", run: testUniquenessSamplesAgainAfterRecoveryInterval },
  { name: "Uniqueness Population Limit Comes From Spawner Config", run: testUniquenessPopulationLimitComesFromSpawnerConfig },
  { name: "Uniqueness On Demand Respects Population Limit", run: testUniquenessOnDemandRespectsPopulationLimit },
];
