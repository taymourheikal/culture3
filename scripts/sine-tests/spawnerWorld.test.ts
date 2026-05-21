import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { activeConnections, activeUnits, architectureMetrics, advanceSpawnerWorldToTimeline, createSpawnerWorld } from "../../src/sine/spawnerSimulation";
import { round, runTo, summarize, type SineTest } from "./helpers";

function testFoodResolvesExactlyOnce() {
  const { timeline, world } = runTo(180);
  const badPending = world.foods.filter((food) => food.status === "pending" && food.resolveTick <= world.tick);
  const badResolved = world.foods.filter(
    (food) => food.status !== "pending" && (typeof food.exitSignal !== "number" || typeof food.payoff !== "number"),
  );

  assert.equal(world.tick, timeline.tick);
  assert.equal(badPending.length, 0);
  assert.equal(badResolved.length, 0);
  assert.equal(world.telemetry.at(-1)?.tick, world.tick);
}

function testDeadSpawnerCannotActAfterResolvedLoss() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(101, { initialSpawners: 1, deathHealth: 90 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.health = 80;
  spawner.energy = 100;
  spawner.cooldown = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.outputBias = [100, -100, 100, 0, 0];
  world.foods.push({
    id: world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    spawnTime: 0,
    resolveTime: timeline.tickSeconds,
    direction: "long",
    strength: 1,
    horizon: timeline.tickSeconds,
    entrySignal: 100,
    status: "pending",
  });
  world.nextFoodId += 1;

  advanceMarketTimeline(timeline, timeline.tickSeconds, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 0);
  assert.equal(world.foods.length, 1);
  assert.equal(world.foods[0]?.status, "loss");
}

function testCooldownSpawnerReportsWait() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.lastAction = "long";
  spawner.cooldown = 10;

  advanceMarketTimeline(timeline, timeline.tickSeconds, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners[0]?.lastAction, "wait");
}

function testSpawnerConfigAffectsNewWorlds() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 3,
    maxSpawners: 7,
    initialHiddenUnitsMin: 4,
    initialHiddenUnitsMax: 4,
    initialEnergyMin: 42,
    initialEnergyMax: 42,
    initialHealth: 77,
    initialCooldownMax: 0,
    baseMutationStdDev: 0.123,
  });

  assert.equal(world.spawners.length, 3);
  assert.equal(world.config.maxSpawners, 7);
  for (const spawner of world.spawners) {
    assert.equal(spawner.energy, 42);
    assert.equal(spawner.health, 77);
    assert.equal(spawner.cooldown, 0);
    assert.equal(activeUnits(spawner.genome).length, 4);
    assert.equal(Object.keys(spawner.hiddenState).length, 4);
    assert.equal(spawner.genome.mutationStd, 0.123);
  }
}

function testInitialSpawnersRespectPopulationCap() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 20,
    maxSpawners: 7,
  });

  assert.equal(world.spawners.length, 7);
}

function testDeterministicSeedOutcome() {
  assert.deepEqual(summarize(180, 101), summarize(180, 101));
  assert.notDeepEqual(summarize(180, 101), summarize(180, 202));
}

function testLongSparseRunAvoidsInvalidNumbers() {
  const { world } = runTo(240, 606);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
    const metrics = architectureMetrics(spawner.genome);
    assert(metrics.activeUnits >= 0);
    assert(metrics.activeConnections >= 0);
  }
  for (const sample of world.telemetry) {
    assert(Number.isFinite(sample.averageActiveUnits));
    assert(Number.isFinite(sample.averageActiveConnections));
    assert(Number.isFinite(sample.averageActiveLayers));
  }
}

function testTelemetryTrimKeepsValidRange() {
  const { world } = runTo(650);
  assert.equal(world.telemetry.length, 3000);
  assert((world.telemetry[0]?.tick ?? 0) > 1);
  assert.equal(world.telemetry.at(-1)?.tick, world.tick);
  for (let index = 1; index < world.telemetry.length; index += 1) {
    assert.equal(world.telemetry[index]?.tick, (world.telemetry[index - 1]?.tick ?? 0) + 1);
  }
}

export const tests: SineTest[] = [
  { name: "Food Resolves Exactly Once", run: testFoodResolvesExactlyOnce },
  { name: "Dead Spawner Cannot Act After Resolved Loss", run: testDeadSpawnerCannotActAfterResolvedLoss },
  { name: "Cooldown Spawner Reports Wait", run: testCooldownSpawnerReportsWait },
  { name: "Spawner Config Affects New Worlds", run: testSpawnerConfigAffectsNewWorlds },
  { name: "Initial Spawners Respect Population Cap", run: testInitialSpawnersRespectPopulationCap },
  { name: "Deterministic Seed Outcome", run: testDeterministicSeedOutcome },
  { name: "Long Sparse Run Avoids Invalid Numbers", run: testLongSparseRunAvoidsInvalidNumbers },
  { name: "Telemetry Trim Keeps Valid Range", run: testTelemetryTrimKeepsValidRange },
];
