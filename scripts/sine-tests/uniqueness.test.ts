import { strict as assert } from "node:assert";
import {
  buildFunctionalGenomeVector,
  computeSpawnerUniqueness,
  createSpawnerWorld,
  type SpawnerAgent,
} from "../../src/sine/spawnerSimulation";
import { finiteZero, median, percentileRank, populationStdDev } from "../../src/sine/stats";
import type { SineTest } from "./helpers";

function testFunctionalVectorKeysAreStableAndFinite() {
  const world = createSpawnerWorld(101, { initialSpawners: 3 });
  const vectors = world.spawners.map(buildFunctionalGenomeVector);
  const keys = vectors[0]?.map((feature) => feature.key) ?? [];

  assert.ok(keys.length > 60);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("output.reproduce.bias"));
  assert.ok(keys.includes("payoffProfile.scaleWindowTicks"));
  assert.ok(keys.includes("payoffProfile.scaleSampleStepTicks"));
  assert.ok(keys.includes("tradingPolicy.spawnThreshold"));
  assert.ok(keys.includes("tradingPolicy.minSignalStrength"));
  assert.ok(keys.includes("mutationProfile.payoffScaleMutationRate"));
  assert.ok(keys.includes("mutationProfile.tradingPolicyMutationRate"));
  assert.ok(keys.includes("plasticity.weightLearningRate"));
  assert.ok(keys.includes("plasticity.plasticityMutationStdDev"));
  for (const vector of vectors) {
    assert.deepEqual(vector.map((feature) => feature.key), keys);
    for (const feature of vector) assert.equal(Number.isFinite(feature.value), true, feature.key);
  }
}

function testFunctionalVectorGoldenAnchors() {
  const world = createSpawnerWorld(101, { initialSpawners: 3 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const vector = buildFunctionalGenomeVector(spawner);
  const firstFeatures = vector.slice(0, 30).map((feature) => [feature.key, round(feature.value)] as const);
  const anchoredFeatures = Object.fromEntries(
    vector
      .filter((feature) =>
        [
          "output.long.bias",
          "tradingPolicy.spawnThreshold",
          "perception.localScaleWindowTicks",
          "mutationProfile.weightMutationStdDev",
          "plasticity.weightLearningRate",
        ].includes(feature.key),
      )
      .map((feature) => [feature.key, round(feature.value)]),
  );

  assert.equal(vector.length, 162);
  assert.deepEqual(firstFeatures, [
    ["units.layer1", 6],
    ["units.layer2", 0],
    ["units.layer3Plus", 0],
    ["layers.active", 1],
    ["layers.maxIndex", 1],
    ["layers.widthStd", 0],
    ["connections.inputToHidden", 30],
    ["connections.recurrent", 12],
    ["connections.hiddenCurrentToHidden", 0],
    ["connections.hiddenToOutput", 24],
    ["connections.inputToOutput", 0],
    ["connections.skip", 0],
    ["density.inputToHidden", 0.075758],
    ["density.recurrent", 0.111111],
    ["density.hiddenToOutput", 0.666667],
    ["density.skip", 0],
    ["recurrence.unitsWithInputRatio", 1],
    ["recurrence.unitsWithSelfRatio", 0.333333],
    ["recurrence.meanInputsPerUnit", 2],
    ["recurrence.maxInputsPerUnit", 2],
    ["gate.balanceEntropy", 0.960432],
    ["bias.update.mean", -0.014903],
    ["bias.update.std", 0.052715],
    ["bias.reset.mean", -0.061946],
    ["bias.reset.std", 0.057855],
    ["bias.candidate.mean", -0.065566],
    ["bias.candidate.std", 0.077981],
    ["input.0.outgoingCount", 0],
    ["input.0.absWeightMean", 0],
    ["input.1.outgoingCount", 3],
  ]);
  assert.deepEqual(anchoredFeatures, {
    "output.long.bias": -0.17715,
    "tradingPolicy.spawnThreshold": 0.56,
    "perception.localScaleWindowTicks": 48,
    "mutationProfile.weightMutationStdDev": 0.045,
    "plasticity.weightLearningRate": 0.012,
  });
}

function testSingleSpawnerPopulationReturnsZeroScore() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const scores = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: world.spawners[0]?.id });
  const spawner = world.spawners[0];
  assert(spawner);
  const score = scores.get(spawner.id);
  assert(score);
  assert.equal(score.vectorVersion, "functional-genome-v8");
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

function testUniquenessScoreGoldenDetail() {
  const world = createSpawnerWorld(515, { initialSpawners: 6 });
  const spawner = world.spawners[2];
  assert(spawner);
  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: spawner.id }).get(spawner.id);

  assert(score);
  assert.equal(round(score.score), 0.2);
  assert.equal(round(score.rawDistance), 2.421892);
  assert.equal(score.activeFeatureCount, 105);
  assert.equal(score.droppedFeatureCount, 57);
  assert.deepEqual(score.nearestNeighborIds, [4, 2, 6, 1, 5]);
  assert.deepEqual(
    score.mostSimilarFeatures.slice(0, 3).map((feature) => [
      feature.key,
      round(feature.value),
      round(feature.populationMedian),
      round(feature.populationMad),
      round(feature.zScore),
    ]),
    [
      ["input.1.outgoingCount", 2, 2, 1, 0],
      ["input.10.outgoingCount", 1, 1, 1, 0],
      ["input.11.outgoingCount", 1, 1, 0.5, 0],
    ],
  );
  assert.deepEqual(
    score.mostDissimilarFeatures.slice(0, 3).map((feature) => [
      feature.key,
      round(feature.value),
      round(feature.populationMedian),
      round(feature.populationMad),
      round(feature.zScore),
    ]),
    [
      ["input.14.absWeightMean", 0, 0.466053, 0.062406, -7.468046],
      ["perception.cycleWindowTicks", 57, 50, 1, 7],
      ["perception.volumeScaleSampleStepTicks", 7, 2, 1, 5],
    ],
  );
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

function testTradingPolicyFeatureCanExplainUniqueness() {
  const world = createSpawnerWorld(812, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const secondClone = cloneSpawner(base, 3);
  const unusual = cloneSpawner(base, 4);
  unusual.genome.tradingPolicy = {
    spawnThreshold: 1.2,
    minSignalStrength: 0.8,
  };
  unusual.genome.mutationProfile = {
    ...unusual.genome.mutationProfile,
    tradingPolicyMutationRate: 0.9,
  };
  world.spawners = [base, firstClone, secondClone, unusual];

  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: unusual.id }).get(unusual.id);

  assert(score);
  assert.ok(score.mostDissimilarFeatures.some((feature) => feature.key.startsWith("tradingPolicy.")));
}

function testPlasticityProfileFeatureCanExplainUniqueness() {
  const world = createSpawnerWorld(818, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const secondClone = cloneSpawner(base, 3);
  const unusual = cloneSpawner(base, 4);
  unusual.genome.plasticityProfile = {
    ...unusual.genome.plasticityProfile,
    weightLearningRate: 0.9,
    biasLearningRate: 0.8,
    plasticityMutationStdDev: 0.7,
  };
  world.spawners = [base, firstClone, secondClone, unusual];

  const score = computeSpawnerUniqueness(world.spawners, world.tick, { detailSpawnerId: unusual.id }).get(unusual.id);

  assert(score);
  assert.ok(score.mostDissimilarFeatures.some((feature) => feature.key.startsWith("plasticity.")));
}

function testLearnedDeltasAffectLiveUniquenessVector() {
  const world = createSpawnerWorld(909, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const secondClone = cloneSpawner(base, 3);
  const learned = cloneSpawner(base, 4);
  const connection = learned.genome.connections.find((item) => item.target.kind === "output");
  assert(connection);
  learned.learnedState.connectionDeltas[String(connection.innovationId)] = 3;
  world.spawners = [base, firstClone, secondClone, learned];

  const baseVector = buildFunctionalGenomeVector(base);
  const learnedVector = buildFunctionalGenomeVector(learned);
  assert.notDeepEqual(learnedVector.map((feature) => feature.value), baseVector.map((feature) => feature.value));

  const score = computeSpawnerUniqueness(world.spawners, world.tick).get(learned.id);
  assert(score);
  assert(score.rawDistance > 0);
}

function testSharedStatsPreserveSineSemantics() {
  assert.equal(finiteZero(Number.NaN), 0);
  assert.equal(finiteZero(Number.POSITIVE_INFINITY), 0);
  assert.equal(finiteZero(-2), -2);
  assert.equal(populationStdDev([]), 0);
  assert.equal(populationStdDev([1, 2, 3]), Math.sqrt(2 / 3));
  assert.equal(median([]), 0);
  assert.equal(median([3, Number.NaN, 1]), 1);
  assert.equal(median([1, 4, 2, 3]), 2.5);
  assert.equal(percentileRank(2, [1, 2, 2, 4]), 0.5);
}

function round(value: number) {
  return Number(value.toFixed(6));
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
      payoffProfile: { ...spawner.genome.payoffProfile },
      tradingPolicy: { ...spawner.genome.tradingPolicy },
      mutationProfile: { ...spawner.genome.mutationProfile },
      plasticityProfile: { ...spawner.genome.plasticityProfile },
    },
    learnedState: {
      connectionDeltas: { ...spawner.learnedState.connectionDeltas },
      outputBiasDeltas: { ...spawner.learnedState.outputBiasDeltas },
      gateBiasDeltas: { ...spawner.learnedState.gateBiasDeltas },
      recentLearningSignal: spawner.learnedState.recentLearningSignal,
      learningUpdateCount: spawner.learnedState.learningUpdateCount,
      reproductionLearningCount: spawner.learnedState.reproductionLearningCount,
    },
    traceStore: { nextTraceId: spawner.traceStore.nextTraceId, traces: structuredClone(spawner.traceStore.traces) },
    hiddenState: { ...spawner.hiddenState },
    recentPayoffs: [...spawner.recentPayoffs],
  };
}

export const tests: SineTest[] = [
  { name: "Functional Vector Keys Are Stable And Finite", run: testFunctionalVectorKeysAreStableAndFinite },
  { name: "Functional Vector Golden Anchors", run: testFunctionalVectorGoldenAnchors },
  { name: "Single Spawner Population Returns Zero Score", run: testSingleSpawnerPopulationReturnsZeroScore },
  { name: "Cloned Genomes Have Zero Uniqueness", run: testClonedGenomesHaveZeroUniqueness },
  { name: "Unusual Functional Genome Ranks Highest", run: testUnusualFunctionalGenomeRanksHighest },
  { name: "Nearest Neighbors Exclude Selected Spawner", run: testNearestNeighborsExcludeSelectedSpawner },
  { name: "Feature Explanations Are Finite", run: testFeatureExplanationsAreFinite },
  { name: "Uniqueness Score Golden Detail", run: testUniquenessScoreGoldenDetail },
  { name: "Typical Feature Explanations Prefer Active Dimensions", run: testTypicalFeatureExplanationsPreferActiveDimensions },
  { name: "Perception Feature Can Explain Uniqueness", run: testPerceptionFeatureCanExplainUniqueness },
  { name: "Mutation Profile Feature Can Explain Uniqueness", run: testMutationProfileFeatureCanExplainUniqueness },
  { name: "Trading Policy Feature Can Explain Uniqueness", run: testTradingPolicyFeatureCanExplainUniqueness },
  { name: "Plasticity Profile Feature Can Explain Uniqueness", run: testPlasticityProfileFeatureCanExplainUniqueness },
  { name: "Learned Deltas Affect Live Uniqueness Vector", run: testLearnedDeltasAffectLiveUniquenessVector },
  { name: "Shared Stats Preserve Sine Semantics", run: testSharedStatsPreserveSineSemantics },
];
