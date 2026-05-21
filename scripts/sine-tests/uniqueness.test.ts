import { strict as assert } from "node:assert";
import { computeSpawnerUniqueness, createSpawnerWorld, type SpawnerAgent } from "../../src/sine/spawnerSimulation";
import type { SineTest } from "./helpers";

function testSingleSpawnerPopulationReturnsZeroScores() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const scores = computeSpawnerUniqueness(world.spawners, world.config);
  const spawner = world.spawners[0];
  assert(spawner);
  assert.deepEqual(scores.get(spawner.id), {
    genome: 0,
    behavior: 0,
    complexity: 0,
    overall: 0,
    nearestNeighborIds: [],
  });
}

function testClonedGenomesHaveLowUniqueness() {
  const world = createSpawnerWorld(202, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  world.spawners = [base, cloneSpawner(base, 2), cloneSpawner(base, 3)];

  const scores = computeSpawnerUniqueness(world.spawners, world.config);
  for (const spawner of world.spawners) {
    const score = scores.get(spawner.id);
    assert(score);
    assert.equal(score.genome, 0);
    assert.equal(score.behavior, 0);
    assert.equal(score.complexity, 0);
    assert.equal(score.overall, 0);
  }
}

function testDifferentArchitectureIncreasesComplexityUniqueness() {
  const world = createSpawnerWorld(303, { initialSpawners: 1 });
  const base = world.spawners[0];
  assert(base);
  const firstClone = cloneSpawner(base, 2);
  const different = cloneSpawner(base, 3);
  different.genome.units.push({
    unitId: different.genome.nextUnitId,
    innovationId: 999_001,
    layerIndex: 2,
    enabled: true,
    updateBias: 0,
    resetBias: 0,
    candidateBias: 0,
  });
  different.genome.nextUnitId += 1;
  world.spawners = [base, firstClone, different];

  const scores = computeSpawnerUniqueness(world.spawners, world.config);
  const cloneScore = scores.get(firstClone.id);
  const differentScore = scores.get(different.id);
  assert(cloneScore);
  assert(differentScore);
  assert(differentScore.complexity > cloneScore.complexity);
}

function testBehaviorUniquenessDoesNotMutateHiddenState() {
  const world = createSpawnerWorld(404, { initialSpawners: 3 });
  const before = world.spawners.map((spawner) => JSON.stringify(spawner.hiddenState));
  computeSpawnerUniqueness(world.spawners, world.config);
  const after = world.spawners.map((spawner) => JSON.stringify(spawner.hiddenState));
  assert.deepEqual(after, before);
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
    },
    hiddenState: { ...spawner.hiddenState },
    recentPayoffs: [...spawner.recentPayoffs],
  };
}

export const tests: SineTest[] = [
  { name: "Single Spawner Population Returns Zero Scores", run: testSingleSpawnerPopulationReturnsZeroScores },
  { name: "Cloned Genomes Have Low Uniqueness", run: testClonedGenomesHaveLowUniqueness },
  { name: "Different Architecture Increases Complexity Uniqueness", run: testDifferentArchitectureIncreasesComplexityUniqueness },
  { name: "Behavior Uniqueness Does Not Mutate Hidden State", run: testBehaviorUniquenessDoesNotMutateHiddenState },
];
