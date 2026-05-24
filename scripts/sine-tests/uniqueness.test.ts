import { strict as assert } from "node:assert";
import {
  buildFunctionalGenomeVector,
  computeSpawnerUniqueness,
  createSpawnerWorld,
  type SpawnerAgent,
} from "../../src/sine/spawnerSimulation";
import type { SineTest } from "./helpers";

function testFunctionalVectorKeysAreStableAndFinite() {
  const world = createSpawnerWorld(101, { initialSpawners: 3 });
  const vectors = world.spawners.map(buildFunctionalGenomeVector);
  const keys = vectors[0]?.map((feature) => feature.key) ?? [];

  assert.ok(keys.length > 60);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("output.reproduce.bias"));
  for (const vector of vectors) {
    assert.deepEqual(vector.map((feature) => feature.key), keys);
    for (const feature of vector) assert.equal(Number.isFinite(feature.value), true, feature.key);
  }
}

function testSingleSpawnerPopulationReturnsZeroScore() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const scores = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: world.spawners[0]?.id });
  const spawner = world.spawners[0];
  assert(spawner);
  const score = scores.get(spawner.id);
  assert(score);
  assert.equal(score.vectorVersion, "functional-genome-v3");
  assert.equal(score.score, 0);
  assert.equal(score.rawDistance, 0);
  assert.equal(score.comparisonPopulationSize, 1);
  assert.equal(score.nearestNeighborIds.length, 0);
}

function testClonedGenomesHaveZeroUniqueness() {
  const world = createSpawnerWorld(202, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  world.spawners = [base, cloneSpawner(base, 2), cloneSpawner(base, 3)];

  const scores = computeSpawnerUniqueness(world.spawners, world.tick);
  for (const spawner of world.spawners) {
    const score = scores.get(spawner.id);
    assert(score);
    assert.equal(score.score, 0);
    assert.equal(score.rawDistance, 0);
    assert.equal(score.activeFeatureCount, 0);
    assert.ok(score.droppedFeatureCount > 0);
  }
}

function testUnusualFunctionalGenomeRanksHighest() {
  const world = createSpawnerWorld(303, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const secondClone = cloneSpawner(base, 3);
  const unusual = cloneSpawner(base, 4);
  unusual.genome.outputBias = [2, -2, 1.5, -1, 1, 2.5];
  unusual.genome.mutationProfile.weightMutationStdDev = 0.14;
  unusual.genome.units.push({
    unitId: unusual.genome.nextUnitId,
    innovationId: 999_001,
    layerIndex: 3,
    enabled: true,
    updateBias: 1,
    resetBias: -1,
    candidateBias: 0.8,
  });
  unusual.genome.nextUnitId += 1;
  world.spawners = [base, firstClone, secondClone, unusual];

  const scores = computeSpawnerUniqueness(world.spawners, world.tick);
  const unusualScore = scores.get(unusual.id);
  assert(unusualScore);
  for (const spawner of [base, firstClone, secondClone]) {
    const score = scores.get(spawner.id);
    assert(score);
    assert.ok(unusualScore.rawDistance >= score.rawDistance);
    assert.ok(unusualScore.score >= score.score);
  }
  assert.equal(unusualScore.score, 1);
}

function testNearestNeighborsExcludeSelectedSpawner() {
  const world = createSpawnerWorld(404, { initialSpawners: 6 });
  const spawner = world.spawners[0];
  assert(spawner);
  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: spawner.id }).get(spawner.id);
  assert(score);
  assert.equal(score.nearestNeighborIds.includes(spawner.id), false);
  assert.ok(score.nearestNeighborIds.length > 0);
  assert.ok(score.nearestNeighborIds.length <= 5);
}

function testFeatureExplanationsAreFinite() {
  const world = createSpawnerWorld(505, { initialSpawners: 8 });
  const spawner = world.spawners[0];
  assert(spawner);
  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: spawner.id }).get(spawner.id);
  assert(score);
  assert.ok(score.mostSimilarFeatures.length > 0);
  assert.ok(score.mostDissimilarFeatures.length > 0);
  for (const feature of [...score.mostSimilarFeatures, ...score.mostDissimilarFeatures]) {
    assert.ok(feature.key);
    assert.ok(feature.label);
    assert.equal(Number.isFinite(feature.value), true);
    assert.equal(Number.isFinite(feature.populationMedian), true);
    assert.equal(Number.isFinite(feature.populationMad), true);
    assert.equal(Number.isFinite(feature.zScore), true);
  }
}

function testTypicalFeatureExplanationsPreferActiveDimensions() {
  const world = createSpawnerWorld(606, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const first = cloneSpawner(base, 2);
  const second = cloneSpawner(base, 3);
  const third = cloneSpawner(base, 4);
  first.genome.mutationProfile.weightMutationStdDev = 0.05;
  second.genome.mutationProfile.weightMutationStdDev = 0.08;
  third.genome.mutationProfile.weightMutationStdDev = 0.11;
  world.spawners = [base, first, second, third];

  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: first.id }).get(first.id);

  assert(score);
  assert.ok(score.activeFeatureCount > 0);
  assert.ok(score.mostSimilarFeatures.length > 0);
  assert.ok(score.mostSimilarFeatures.every((feature) => feature.populationMad > 0));
}

function testPerceptionFeatureCanExplainUniqueness() {
  const world = createSpawnerWorld(707, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const secondClone = cloneSpawner(base, 3);
  const unusual = cloneSpawner(base, 4);
  unusual.genome.perception = {
    ...unusual.genome.perception,
    deltaLagPairs: unusual.genome.perception.deltaLagPairs.map((pair, index) =>
      index === 4 ? { fromTicks: 800, toTicks: 1000 } : { ...pair },
    ),
    rollingWindowTicks: 900,
    localScaleWindowTicks: 850,
  };
  world.spawners = [base, firstClone, secondClone, unusual];

  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: unusual.id }).get(unusual.id);

  assert(score);
  assert.ok(score.mostDissimilarFeatures.some((feature) => feature.key.startsWith("perception.")));
}

function testMutationProfileFeatureCanExplainUniqueness() {
  const world = createSpawnerWorld(808, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const secondClone = cloneSpawner(base, 3);
  const unusual = cloneSpawner(base, 4);
  unusual.genome.mutationProfile = {
    ...unusual.genome.mutationProfile,
    addUnitRate: 0.9,
    addConnectionRate: 0.95,
    perceptionMutationRate: 0.9,
    mutationProfileMutationStdDev: 0.8,
  };
  world.spawners = [base, firstClone, secondClone, unusual];

  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: unusual.id }).get(unusual.id);

  assert(score);
  assert.ok(score.mostDissimilarFeatures.some((feature) => feature.key.startsWith("mutationProfile.")));
}

function cloneSpawner(spawner: SpawnerAgent, id: number): SpawnerAgent {
  return {
    ...spawner,
    id,
    genome: {
      ...spawner.genome,
      units: spawner.genome.units.map((unit) => ({ ...unit })),
      connections: spawner.genome.connections.map((connection) => ({
        ...connection,
        source: { ...connection.source },
        target: { ...connection.target },
      })),
      outputBias: [...spawner.genome.outputBias],
      perception: {
        ...spawner.genome.perception,
        deltaLagPairs: spawner.genome.perception.deltaLagPairs.map((pair) => ({ ...pair })),
      },
      mutationProfile: { ...spawner.genome.mutationProfile },
    },
    hiddenState: { ...spawner.hiddenState },
    recentPayoffs: [...spawner.recentPayoffs],
  };
}

export const tests: SineTest[] = [
  { name: "Functional Vector Keys Are Stable And Finite", run: testFunctionalVectorKeysAreStableAndFinite },
  { name: "Single Spawner Population Returns Zero Score", run: testSingleSpawnerPopulationReturnsZeroScore },
  { name: "Cloned Genomes Have Zero Uniqueness", run: testClonedGenomesHaveZeroUniqueness },
  { name: "Unusual Functional Genome Ranks Highest", run: testUnusualFunctionalGenomeRanksHighest },
  { name: "Nearest Neighbors Exclude Selected Spawner", run: testNearestNeighborsExcludeSelectedSpawner },
  { name: "Feature Explanations Are Finite", run: testFeatureExplanationsAreFinite },
  { name: "Typical Feature Explanations Prefer Active Dimensions", run: testTypicalFeatureExplanationsPreferActiveDimensions },
  { name: "Perception Feature Can Explain Uniqueness", run: testPerceptionFeatureCanExplainUniqueness },
  { name: "Mutation Profile Feature Can Explain Uniqueness", run: testMutationProfileFeatureCanExplainUniqueness },
];
