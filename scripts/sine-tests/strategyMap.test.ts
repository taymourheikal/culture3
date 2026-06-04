import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { createSpawnerWorld, DEFAULT_SPAWNER_CONFIG, type SpawnerAgent } from "../../src/sine/spawnerSimulation";
import { preparePopulationFeatureSpace } from "../../src/sine/spawner/populationFeatureSpace";
import { projectPopulationStrategySpace } from "../../src/sine/spawner/strategyProjection";
import { buildPopulationStrategyMap } from "../../src/sine/spawner/strategyMap";
import { clusterPopulationStrategySpace } from "../../src/sine/spawner/strategyClustering";
import { visibleClusterOverlays } from "../../src/sine/charts/strategyMapOverlay";
import { createSimulationState } from "../../src/sine/simulationRuntime";
import { createStrategyMapService } from "../../src/sine/worker/strategyMapService";
import { UNIQUENESS_INTERVAL_TICKS } from "../../src/sine/worker/uniquenessInspectionService";
import type { SineTest } from "./helpers";

function testProjectionHandlesTinyAndDegeneratePopulations() {
  const empty = preparePopulationFeatureSpace([]);
  assert.deepEqual(projectPopulationStrategySpace(empty), []);

  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const single = projectPopulationStrategySpace(preparePopulationFeatureSpace(world.spawners));
  assert.deepEqual(single.map((point) => [point.x, point.y]), [[0, 0]]);

  const base = world.spawners[0];
  assert.ok(base);
  const clones = [base, cloneSpawner(base, 2), cloneSpawner(base, 3)];
  const projected = projectPopulationStrategySpace(preparePopulationFeatureSpace(clones));
  for (const point of projected) {
    assert.equal(Number.isFinite(point.x), true);
    assert.equal(Number.isFinite(point.y), true);
  }
}

function testProjectionIsDeterministic() {
  const world = createSpawnerWorld(202, { initialSpawners: 12 });
  const first = projectPopulationStrategySpace(preparePopulationFeatureSpace(world.spawners));
  const second = projectPopulationStrategySpace(preparePopulationFeatureSpace(world.spawners));

  assert.deepEqual(first, second);
  for (const point of first) {
    assert.ok(point.x >= -1 && point.x <= 1);
    assert.ok(point.y >= -1 && point.y <= 1);
  }
}

function testClusteringAssignsEveryAgentAndSummariesAreFinite() {
  const world = createSpawnerWorld(303, { initialSpawners: 20 });
  const result = buildPopulationStrategyMap(preparePopulationFeatureSpace(world.spawners));

  assert.equal(result.points.length, world.spawners.length);
  assert.ok(result.clusters.length > 0);
  assert.equal(new Set(result.points.map((point) => point.spawnerId)).size, world.spawners.length);
  for (const point of result.points) {
    assert.equal(Number.isFinite(point.clusterDistance), true);
    assert.equal(Number.isFinite(point.clusterPercentile), true);
    assert.ok(result.clusters.some((cluster) => cluster.clusterId === point.clusterId));
  }
  for (const cluster of result.clusters) {
    assert.equal(Number.isFinite(cluster.centroidX), true);
    assert.equal(Number.isFinite(cluster.centroidY), true);
    assert.equal(Number.isFinite(cluster.radius), true);
    assert.equal(Number.isFinite(cluster.avgPayoff), true);
    assert.equal(Number.isFinite(cluster.hitRate), true);
    assert.equal(Number.isFinite(cluster.avgGeneration), true);
  }
}

function testIdenticalPopulationCollapsesToLowRadiusCluster() {
  const world = createSpawnerWorld(404, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert.ok(base);
  const clones = [base, cloneSpawner(base, 2), cloneSpawner(base, 3), cloneSpawner(base, 4)];
  const result = clusterPopulationStrategySpace(preparePopulationFeatureSpace(clones));

  assert.equal(result.clusters.length, 1);
  assert.equal(result.points.length, clones.length);
  assert.ok((result.clusters[0]?.radius ?? 1) <= 1e-9);
  assert.equal(result.points.every((point) => point.clusterDistance <= 1e-9), true);
}

function testClusterIdentityStabilizesAcrossRecomputes() {
  const world = createSpawnerWorld(505, { initialSpawners: 16 });
  const first = buildPopulationStrategyMap(preparePopulationFeatureSpace(world.spawners));
  const second = buildPopulationStrategyMap(preparePopulationFeatureSpace(world.spawners), first.state);

  assert.deepEqual(
    second.clusters.map((cluster) => cluster.clusterId).sort((left, right) => left - right),
    first.clusters.map((cluster) => cluster.clusterId).sort((left, right) => left - right),
  );

  const child = cloneSpawner(world.spawners[0]!, 999);
  child.genome.outputBias = child.genome.outputBias.map((bias, index) => bias + index + 1);
  const added = buildPopulationStrategyMap(preparePopulationFeatureSpace([...world.spawners, child]), first.state);
  assert.ok(added.state.nextClusterId >= first.state.nextClusterId);
  assert.equal(new Set(added.clusters.map((cluster) => cluster.clusterId)).size, added.clusters.length);
  for (const cluster of added.state.clusters) {
    assert.equal(Number.isFinite(cluster.radius), true);
  }
}

function testClusterIdentityRejectsFarPreviousCentroids() {
  const world = createSpawnerWorld(606, { initialSpawners: 8 });
  const featureSpace = preparePopulationFeatureSpace(world.spawners);
  const width = featureSpace.normalizedRows.get(world.spawners[0]?.id ?? -1)?.length ?? 1;
  const result = buildPopulationStrategyMap(featureSpace, {
    nextClusterId: 2,
    clusters: [{ clusterId: 1, centroid: Array.from({ length: width }, () => 100), radius: 0.01 }],
  });

  assert.equal(result.clusters.some((cluster) => cluster.clusterId === 1), false);
  assert.ok(result.state.nextClusterId > 2);
  assert.equal(new Set(result.clusters.map((cluster) => cluster.clusterId)).size, result.clusters.length);
}

function testClusterPerformanceSummariesUseResolvedTradeWeight() {
  const world = createSpawnerWorld(707, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert.ok(base);
  const highSample = cloneSpawner(base, 2);
  highSample.resolvedCount = 100;
  highSample.wins = 80;
  highSample.losses = 20;
  highSample.totalPayoff = 200;
  const lowSample = cloneSpawner(base, 3);
  lowSample.resolvedCount = 1;
  lowSample.wins = 0;
  lowSample.losses = 1;
  lowSample.totalPayoff = -100;

  const result = clusterPopulationStrategySpace(preparePopulationFeatureSpace([highSample, lowSample]));
  const cluster = result.clusters[0];
  assert.equal(result.clusters.length, 1);
  assert.ok(cluster);
  assert.equal(cluster.hitRate, 80 / 101);
  assert.equal(cluster.avgPayoff, 100 / 101);
}

function testClusterPerformanceSummariesStayFiniteWithoutTrades() {
  const world = createSpawnerWorld(808, { initialSpawners: 4 });
  const result = clusterPopulationStrategySpace(preparePopulationFeatureSpace(world.spawners));

  for (const cluster of result.clusters) {
    assert.equal(Number.isFinite(cluster.hitRate), true);
    assert.equal(Number.isFinite(cluster.avgPayoff), true);
  }
}

function testStrategyMapFullOutputGolden() {
  const world = createSpawnerWorld(303, { initialSpawners: 8, maxSpawners: 8 });
  for (const [index, spawner] of world.spawners.entries()) {
    spawner.energy = 30 + index * 3;
    spawner.resolvedCount = index + 1;
    spawner.wins = index % 2 === 0 ? index + 1 : 1;
    spawner.losses = index % 2 === 0 ? 0 : index;
    spawner.totalPayoff = (index - 3) * 1.25;
  }

  assert.deepEqual(roundStrategyMapResult(buildPopulationStrategyMap(preparePopulationFeatureSpace(world.spawners))), {
    points: [
      { spawnerId: 1, x: 0.292488, y: -0.246149, clusterId: 1, clusterDistance: 15.432392, clusterPercentile: 0, energy: 30, generation: 0, lineageId: 1, hitRate: 1, averagePayoff: -3.75, resolvedCount: 1 },
      { spawnerId: 2, x: -0.603551, y: -0.861102, clusterId: 1, clusterDistance: 19.466132, clusterPercentile: 1, energy: 33, generation: 0, lineageId: 2, hitRate: 0.5, averagePayoff: -1.25, resolvedCount: 2 },
      { spawnerId: 3, x: 0.445664, y: -0.226814, clusterId: 1, clusterDistance: 17.257602, clusterPercentile: 0.333333, energy: 36, generation: 0, lineageId: 3, hitRate: 1, averagePayoff: -0.416667, resolvedCount: 3 },
      { spawnerId: 4, x: 0.282802, y: 0.89715, clusterId: 3, clusterDistance: 0, clusterPercentile: 0, energy: 39, generation: 0, lineageId: 4, hitRate: 0.25, averagePayoff: 0, resolvedCount: 4 },
      { spawnerId: 5, x: -0.622579, y: 0.163619, clusterId: 2, clusterDistance: 15.08897, clusterPercentile: 0, energy: 42, generation: 0, lineageId: 5, hitRate: 1, averagePayoff: 0.25, resolvedCount: 5 },
      { spawnerId: 6, x: -0.393062, y: -0.042899, clusterId: 2, clusterDistance: 15.654939, clusterPercentile: 1, energy: 45, generation: 0, lineageId: 6, hitRate: 0.166667, averagePayoff: 0.416667, resolvedCount: 6 },
      { spawnerId: 7, x: -0.401762, y: 0.596409, clusterId: 2, clusterDistance: 15.553833, clusterPercentile: 0.5, energy: 48, generation: 0, lineageId: 7, hitRate: 1, averagePayoff: 0.535714, resolvedCount: 7 },
      { spawnerId: 8, x: 1, y: -0.280215, clusterId: 1, clusterDistance: 17.758155, clusterPercentile: 0.666667, energy: 51, generation: 0, lineageId: 8, hitRate: 0.125, averagePayoff: 0.625, resolvedCount: 8 },
    ],
    clusters: [
      { clusterId: 1, size: 4, centroidX: 0.28365, centroidY: -0.40357, radius: 0.99823, avgPayoff: -0.178571, hitRate: 0.428571, avgGeneration: 0, dominantLineageId: 1 },
      { clusterId: 2, size: 3, centroidX: -0.472468, centroidY: 0.239043, radius: 0.364293, avgPayoff: 0.416667, hitRate: 0.722222, avgGeneration: 0, dominantLineageId: 5 },
      { clusterId: 3, size: 1, centroidX: 0.282802, centroidY: 0.89715, radius: 0, avgPayoff: 0, hitRate: 0.25, avgGeneration: 0, dominantLineageId: 4 },
    ],
  });
}

function testStrategyMapServiceCachesBetweenIntervalsAndResets() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 12, maxSpawners: 20 });
  const service = createStrategyMapService();
  simulation.world.tick = 1000;
  const first = service.prepare(simulation);
  simulation.world.tick = 1000 + Math.floor(UNIQUENESS_INTERVAL_TICKS / 2);
  const cached = service.prepare(simulation);

  assert.equal(first, cached);
  assert.equal(service.window(simulation.world.tick), cached);

  service.reset();
  assert.equal(service.window(7).status, "waiting");
  const recomputed = service.prepare(simulation, true);
  assert.notEqual(recomputed, cached);
  assert.equal(recomputed.status, "ready");
}

function testStrategyMapServiceSkipsAbovePopulationLimit() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 4, maxSpawners: 20, uniquenessPopulationLimit: 2 });
  const service = createStrategyMapService();
  simulation.world.tick = 250;
  const skipped = service.prepare(simulation);

  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.skippedReason, "population_limit");
  assert.equal(skipped.points.length, 0);
  assert.equal(skipped.clusters.length, 0);
}

function testStrategyMapServiceRecoversImmediatelyAfterPopulationLimitDrops() {
  const simulation = createSimulationState(INITIAL_SETTINGS, { ...DEFAULT_SPAWNER_CONFIG, initialSpawners: 4, maxSpawners: 20, uniquenessPopulationLimit: 2 });
  const service = createStrategyMapService();
  simulation.world.tick = 250;
  const skipped = service.prepare(simulation);
  simulation.world.spawners.splice(2);
  simulation.world.tick = 251;
  const recovered = service.prepare(simulation);

  assert.equal(skipped.status, "skipped");
  assert.equal(recovered.status, "ready");
  assert.equal(recovered.populationSize, simulation.world.spawners.length);
  assert.equal(recovered.points.length, simulation.world.spawners.length);
}

function testFilteredClusterOverlaysUseVisiblePointsOnly() {
  const overlays = visibleClusterOverlays(
    [
      pointFixture({ spawnerId: 1, clusterId: 1, x: -0.5, y: 0 }),
      pointFixture({ spawnerId: 2, clusterId: 1, x: 0.5, y: 0 }),
    ],
    [
      clusterFixture({ clusterId: 1, centroidX: 0.9, centroidY: 0.9, radius: 1 }),
      clusterFixture({ clusterId: 2, centroidX: -0.9, centroidY: -0.9, radius: 1 }),
    ],
  );
  const filtered = visibleClusterOverlays(
    [pointFixture({ spawnerId: 1, clusterId: 1, x: -0.5, y: 0 })],
    [
      clusterFixture({ clusterId: 1, centroidX: 0.9, centroidY: 0.9, radius: 1 }),
      clusterFixture({ clusterId: 2, centroidX: -0.9, centroidY: -0.9, radius: 1 }),
    ],
  );

  assert.equal(overlays.length, 1);
  assert.equal(overlays[0]?.centroidX, 0);
  assert.equal(overlays[0]?.radius, 0.5);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.clusterId, 1);
  assert.equal(filtered[0]?.centroidX, -0.5);
  assert.equal(filtered[0]?.radius, 0);
}

function cloneSpawner(spawner: SpawnerAgent, id: number): SpawnerAgent {
  const clone = structuredClone(spawner);
  clone.id = id;
  clone.lineageId = id;
  return clone;
}

function pointFixture(patch: Partial<ReturnType<typeof buildPopulationStrategyMap>["points"][number]>) {
  return {
    spawnerId: 1,
    x: 0,
    y: 0,
    clusterId: 1,
    clusterDistance: 0,
    clusterPercentile: 0,
    energy: 1,
    generation: 0,
    lineageId: 1,
    hitRate: 0,
    averagePayoff: 0,
    resolvedCount: 0,
    ...patch,
  };
}

function clusterFixture(patch: Partial<ReturnType<typeof buildPopulationStrategyMap>["clusters"][number]>) {
  return {
    clusterId: 1,
    size: 1,
    centroidX: 0,
    centroidY: 0,
    radius: 0,
    avgPayoff: 0,
    hitRate: 0,
    avgGeneration: 0,
    dominantLineageId: null,
    ...patch,
  };
}

function roundStrategyMapResult(result: ReturnType<typeof buildPopulationStrategyMap>) {
  return {
    points: result.points.map((point) => ({
      ...point,
      x: round(point.x),
      y: round(point.y),
      clusterDistance: round(point.clusterDistance),
      clusterPercentile: round(point.clusterPercentile),
      energy: round(point.energy),
      hitRate: round(point.hitRate),
      averagePayoff: round(point.averagePayoff),
    })),
    clusters: result.clusters.map((cluster) => ({
      ...cluster,
      centroidX: round(cluster.centroidX),
      centroidY: round(cluster.centroidY),
      radius: round(cluster.radius),
      avgPayoff: round(cluster.avgPayoff),
      hitRate: round(cluster.hitRate),
      avgGeneration: round(cluster.avgGeneration),
    })),
  };
}

function round(value: number) {
  return Number(value.toFixed(6));
}

export const tests: SineTest[] = [
  { name: "Projection Handles Tiny And Degenerate Populations", run: testProjectionHandlesTinyAndDegeneratePopulations },
  { name: "Projection Is Deterministic", run: testProjectionIsDeterministic },
  { name: "Clustering Assigns Every Agent And Summaries Are Finite", run: testClusteringAssignsEveryAgentAndSummariesAreFinite },
  { name: "Identical Population Collapses To Low Radius Cluster", run: testIdenticalPopulationCollapsesToLowRadiusCluster },
  { name: "Cluster Identity Stabilizes Across Recomputes", run: testClusterIdentityStabilizesAcrossRecomputes },
  { name: "Cluster Identity Rejects Far Previous Centroids", run: testClusterIdentityRejectsFarPreviousCentroids },
  { name: "Cluster Performance Summaries Use Resolved Trade Weight", run: testClusterPerformanceSummariesUseResolvedTradeWeight },
  { name: "Cluster Performance Summaries Stay Finite Without Trades", run: testClusterPerformanceSummariesStayFiniteWithoutTrades },
  { name: "Strategy Map Full Output Golden", run: testStrategyMapFullOutputGolden },
  { name: "Strategy Map Service Caches Between Intervals And Resets", run: testStrategyMapServiceCachesBetweenIntervalsAndResets },
  { name: "Strategy Map Service Skips Above Population Limit", run: testStrategyMapServiceSkipsAbovePopulationLimit },
  { name: "Strategy Map Service Recovers Immediately After Population Limit Drops", run: testStrategyMapServiceRecoversImmediatelyAfterPopulationLimitDrops },
  { name: "Filtered Cluster Overlays Use Visible Points Only", run: testFilteredClusterOverlaysUseVisiblePointsOnly },
];
