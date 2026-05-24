import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { recordSpawnerEvent } from "../../src/sine/spawner/events";
import { resolveFoods } from "../../src/sine/spawner/reward";
import { activeConnections, activeUnits, architectureMetrics, advanceSpawnerWorldToTimeline, createSpawnerWorld, OUTPUT_COUNT, OUTPUT_INDEX } from "../../src/sine/spawnerSimulation";
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
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { initialSpawners: 1, deathHealth: 90 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.health = 80;
  spawner.energy = 100;
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : 0));
  world.foods.push({
    id: world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long",
    strength: 1,
    horizonTicks: 1,
    entrySignal: 100,
    status: "pending",
  });
  world.nextFoodId += 1;

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 0);
  assert.equal(world.foods.length, 1);
  assert.equal(world.foods[0]?.status, "loss");
}

function testCooldownSpawnerReportsWait() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.lastAction = "long";
  spawner.cooldownTicks = 10;

  advanceMarketTimeline(timeline, 1, 10);
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
    initialCooldownMaxTicks: 0,
  });

  assert.equal(world.spawners.length, 3);
  assert.equal(world.config.maxSpawners, 7);
  for (const spawner of world.spawners) {
    assert.equal(spawner.energy, 42);
    assert.equal(spawner.health, 77);
    assert.equal(spawner.cooldownTicks, 0);
    assert.equal(activeUnits(spawner.genome).length, 4);
    assert.equal(Object.keys(spawner.hiddenState).length, 4);
    assert.equal(spawner.genome.mutationStd, 0);
  }
}

function testInitialSpawnersRespectPopulationCap() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 20,
    maxSpawners: 7,
  });

  assert.equal(world.spawners.length, 7);
}

function testEligibleFoundersDoNotImmediatelyFillToPopulationCap() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 250,
    maxSpawners: 400,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 1,
    reproductionCost: 0,
    spawnThreshold: 99,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });

  assert.equal(world.spawners.length, 250);
  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert(world.spawners.length < 300);
}

function testHighReproductionOutputCreatesChildWhenEligible() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 7,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    perceptionLagMutationStdDev: 0,
    perceptionWindowMutationStdDev: 0,
    perceptionSensitivityMutationStdDev: 0,
    perceptionDensityScaleMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? 100 : -100));

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 2);
  assert.equal(world.spawners[0]?.children, 1);
  assert.equal(world.spawners[0]?.energy, 100 - world.config.energyDrainPerTick * 1 - world.config.reproductionCost);
}

function testLowReproductionOutputSuppressesChildWhenEligible() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 2,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    reproductionEnergy: 10,
    reproductionCost: 7,
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.reproduce ? -100 : -100));

  advanceMarketTimeline(timeline, 1 * 20, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);

  assert.equal(world.spawners.length, 1);
  assert.equal(world.spawners[0]?.children, 0);
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

function testLargeMutablePerceptionRunAvoidsInvalidNumbers() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(909, {
    initialSpawners: 250,
    maxSpawners: 250,
    defaultDeltaLag5FromTicks: 27,
    defaultDeltaLag5ToTicks: 1000,
    defaultRollingWindowTicks: 1000,
    defaultLocalScaleWindowTicks: 1000,
    defaultTrendWindowTicks: 1000,
    defaultCycleWindowTicks: 1000,
    founderPerceptionRandomizationTicks: 20,
    reproductionEnergy: 10_000,
  });

  advanceMarketTimeline(timeline, 160, 500);
  advanceSpawnerWorldToTimeline(world, timeline, 500);

  assert.equal(world.tick, 160);
  assert(world.spawners.length > 0);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
    assert.equal(spawner.genome.perception.deltaLagPairs.length, 5);
    assert(spawner.genome.perception.deltaLagPairs.every((pair) => pair.fromTicks >= 0 && pair.toTicks <= 1000));
  }
}

function testThousandSpawnerLargeWindowRunAvoidsInvalidNumbers() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(1001, {
    initialSpawners: 1000,
    maxSpawners: 1000,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    initialInputConnectionsPerUnit: 2,
    initialRecurrentConnectionsPerUnit: 0,
    initialOutputConnectionsPerOutput: 1,
    defaultRollingWindowTicks: 1000,
    defaultLocalScaleWindowTicks: 1000,
    defaultLocalScaleSampleStepTicks: 1,
    defaultTrendWindowTicks: 1000,
    defaultCycleWindowTicks: 1000,
    founderPerceptionRandomizationTicks: 0,
    reproductionEnergy: 10_000,
    spawnThreshold: 10,
  });

  advanceMarketTimeline(timeline, 20, 1200);
  advanceSpawnerWorldToTimeline(world, timeline, 1200);

  assert.equal(world.tick, 20);
  assert.equal(world.spawners.length, 1000);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
  }
}

function testTelemetryTrimKeepsValidRange() {
  const { world } = runTo(3650);
  assert.equal(world.telemetry.length, 3000);
  assert((world.telemetry[0]?.tick ?? 0) > 1);
  assert.equal(world.telemetry.at(-1)?.tick, world.tick);
  for (let index = 1; index < world.telemetry.length; index += 1) {
    assert.equal(world.telemetry[index]?.tick, (world.telemetry[index - 1]?.tick ?? 0) + 1);
  }
}

function testEventSinkReceivesEventsBeyondVisualRetentionCap() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const captured: number[] = [];
  world.eventSink = (event) => captured.push(event.id);

  for (let index = 0; index < 350; index += 1) {
    world.tick = index;
    world.tick = index;
    recordSpawnerEvent(world, {
      kind: "spawn",
      spawnerId: 1,
      lineageId: 1,
    });
  }

  assert.equal(captured.length, 350);
  assert.ok(world.recentEvents.length < captured.length);
  assert.ok(world.recentEvents.length <= 300);
  assert.equal(captured[0], 1);
  assert.equal(captured.at(-1), 350);
}

function testBtcFoodPayoffUsesPriceReturnInsteadOfRocChange() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
        candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 5, isStart: true },
      { timestamp: 1300, datetime: "1970-01-01T00:21:40.000Z", open: 101, high: 101, low: 101, close: 110, roc: -5 },
    ],
  });
  const world = createSpawnerWorld(101, { initialSpawners: 1, transactionCost: 0 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  world.tick = 1;
  world.tick = 1;
  world.foods.push({
    id: 1,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long",
    strength: 1,
    horizonTicks: 1,
    entrySignal: 5,
    entryPrice: 100,
    status: "pending",
  });
  advanceMarketTimeline(timeline, 1, 10);
  resolveFoods(world, timeline);

  assert.equal(world.foods[0]?.status, "win");
  assert.equal(round(world.foods[0]?.payoff ?? 0), 10);
  assert.equal(world.foods[0]?.exitSignal, -5);
}

export const tests: SineTest[] = [
  { name: "Food Resolves Exactly Once", run: testFoodResolvesExactlyOnce },
  { name: "Dead Spawner Cannot Act After Resolved Loss", run: testDeadSpawnerCannotActAfterResolvedLoss },
  { name: "Cooldown Spawner Reports Wait", run: testCooldownSpawnerReportsWait },
  { name: "Spawner Config Affects New Worlds", run: testSpawnerConfigAffectsNewWorlds },
  { name: "Initial Spawners Respect Population Cap", run: testInitialSpawnersRespectPopulationCap },
  { name: "Eligible Founders Do Not Immediately Fill To Population Cap", run: testEligibleFoundersDoNotImmediatelyFillToPopulationCap },
  { name: "High Reproduction Output Creates Child When Eligible", run: testHighReproductionOutputCreatesChildWhenEligible },
  { name: "Low Reproduction Output Suppresses Child When Eligible", run: testLowReproductionOutputSuppressesChildWhenEligible },
  { name: "Deterministic Seed Outcome", run: testDeterministicSeedOutcome },
  { name: "Long Sparse Run Avoids Invalid Numbers", run: testLongSparseRunAvoidsInvalidNumbers },
  { name: "Large Mutable Perception Run Avoids Invalid Numbers", run: testLargeMutablePerceptionRunAvoidsInvalidNumbers },
  { name: "Thousand Spawner Large Window Run Avoids Invalid Numbers", run: testThousandSpawnerLargeWindowRunAvoidsInvalidNumbers },
  { name: "Telemetry Trim Keeps Valid Range", run: testTelemetryTrimKeepsValidRange },
  { name: "Event Sink Receives Events Beyond Visual Retention Cap", run: testEventSinkReceivesEventsBeyondVisualRetentionCap },
  { name: "BTC Food Payoff Uses Price Return Instead Of ROC Change", run: testBtcFoodPayoffUsesPriceReturnInsteadOfRocChange },
];
