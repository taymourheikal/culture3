import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { recordSpawnerEvent } from "../../src/sine/spawner/events";
import { calculateFoodPayoff, emitFood, resolveFoods } from "../../src/sine/spawner/reward";
import {
  activeConnections,
  activeUnits,
  architectureMetrics,
  advanceSpawnerWorldToTimeline,
  applySpawnerUpkeep,
  connectionDeltaKey,
  createFoodRuntimeIndex,
  createSpawnerWorld,
  energyRatioInput,
  ensureCompiledBrainPlan,
  gateBiasDeltaKey,
  learnedStateNorm,
  outputBiasDeltaKey,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
} from "../../src/sine/spawnerSimulation";
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

function testDeadCreatorFoodResolvesWithoutMutatingDeadSpawner() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { initialSpawners: 1, deathHealth: 90 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.health = 80;
  spawner.energy = 100;
  world.foods.push({
    id: world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    direction: "long",
    strength: 1,
    horizonTicks: 1,
    entrySignal: 0,
    status: "pending",
  });
  world.nextFoodId += 1;

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.totalResolved, 1);
  assert.equal(world.foods[0]?.status === "win" || world.foods[0]?.status === "loss", true);
  assert.equal(spawner.resolvedCount, 0);
  assert.equal(spawner.wins + spawner.losses, 0);
  assert.equal(spawner.energy, 100);
  assert.equal(spawner.health, 80);
  assert.equal(world.recentEvents.some((event) => event.kind === "resolve" && event.spawnerId === spawner.id), true);
}

function testCreatorKilledByFirstSameTickFoodDoesNotReceiveLaterSameTickCredit() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
    candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 0, isStart: true },
      { timestamp: 1300, datetime: "1970-01-01T00:21:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: -2 },
    ],
  });
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialEnergyMin: 1,
    initialEnergyMax: 1,
    deathEnergy: 0,
    rewardScale: 1,
    transactionCost: 0,
    plasticityWeightLearningRate: 0.5,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  world.tick = 1;
  for (let id = 1; id <= 2; id += 1) {
    world.foods.push({
      id,
      creatorSpawnerId: spawner.id,
      creatorLineageId: spawner.lineageId,
      spawnTick: 0,
      resolveTick: 1,
      direction: "long",
      strength: 1,
      horizonTicks: 1,
      entrySignal: 0,
      entryPayoffScale: 1,
      status: "pending",
    });
  }

  advanceMarketTimeline(timeline, 1, 10);
  resolveFoods(world, timeline);

  assert.equal(world.totalResolved, 2);
  assert.equal(world.totalLosses, 2);
  assert.equal(spawner.resolvedCount, 1);
  assert.equal(spawner.losses, 1);
  assert.equal(spawner.energy, -1);
  assert.equal(spawner.learnedState.learningUpdateCount, 0);
}

function testFoodRuntimeEventsUseLightweightSnapshots() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    maxSpawners: 1,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
    initialCooldownMaxTicks: 0,
    defaultSpawnThreshold: 0,
    minimumSpawnEnergySurplus: 0,
    energyDrainPerTick: 0,
    brainEnergyCostPerActiveUnit: 0,
    brainEnergyCostPerActiveConnection: 0,
    brainEnergyCostPerActiveLayer: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.thresholdBias = 1;
  spawner.genome.minHorizonTicks = 1;
  spawner.genome.maxHorizonTicks = 1;
  spawner.genome.outputBias = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    index === OUTPUT_INDEX.long ? 100 : index === OUTPUT_INDEX.short ? -100 : index === OUTPUT_INDEX.strength ? 100 : -100,
  );

  advanceMarketTimeline(timeline, 1, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  const spawnEvent = world.recentEvents.find((event) => event.kind === "spawn");
  assert(spawnEvent?.foodEvent);
  assert.equal("foodSnapshot" in spawnEvent, false);

  advanceMarketTimeline(timeline, 2, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  const resolveEvent = world.recentEvents.find((event) => event.kind === "resolve");
  assert(resolveEvent?.foodEvent);
  assert.equal("foodSnapshot" in resolveEvent, false);
  assert.equal(typeof resolveEvent.foodEvent.payoff, "number");
}

function testCandleFoodPayoffUsesSignalScaleInsteadOfPriceReturn() {
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
    entryPayoffScale: 5,
    entryPrice: 100,
    status: "pending",
  });
  advanceMarketTimeline(timeline, 1, 10);
  resolveFoods(world, timeline);

  assert.equal(world.foods[0]?.status, "loss");
  assert.equal(round(world.foods[0]?.payoff ?? 0), -2);
  assert.equal(world.foods[0]?.exitSignal, -5);
}

function testFoodPayoffHelperUsesSignalScaleForGeneratedAndCandleModes() {
  assert.equal(
    round(
      calculateFoodPayoff(
        {
          id: 1,
          creatorSpawnerId: 1,
          creatorLineageId: 1,
          spawnTick: 0,
          resolveTick: 1,
          direction: "long",
          strength: 0.5,
          horizonTicks: 1,
          entrySignal: 2,
          entryPayoffScale: 3,
          status: "pending",
        },
        5,
        undefined,
        0.25,
      ),
    ),
    0.458333,
  );
  assert.equal(
    round(
      calculateFoodPayoff(
        {
          id: 2,
          creatorSpawnerId: 1,
          creatorLineageId: 1,
          spawnTick: 0,
          resolveTick: 1,
          direction: "short",
          strength: 1,
          horizonTicks: 1,
          entrySignal: 5,
          entryPayoffScale: 5,
          entryPrice: 100,
          status: "pending",
        },
        0,
        90,
        0.5,
      ),
    ),
    0.9,
  );
}

function testScaleRelativePayoffAndAbsoluteCost() {
  const small = calculateFoodPayoff(
    foodForPayoff({ entrySignal: -2, direction: "long", entryPayoffScale: 2 }),
    2,
    undefined,
    0,
  );
  const large = calculateFoodPayoff(
    foodForPayoff({ entrySignal: -10, direction: "long", entryPayoffScale: 10 }),
    10,
    undefined,
    0,
  );
  assert.equal(round(small), round(large));
  assert.equal(round(small), 2);

  const smallWithCost = calculateFoodPayoff(
    foodForPayoff({ entrySignal: -2, direction: "long", entryPayoffScale: 2 }),
    2,
    undefined,
    0.5,
  );
  const largeWithCost = calculateFoodPayoff(
    foodForPayoff({ entrySignal: -10, direction: "long", entryPayoffScale: 10 }),
    10,
    undefined,
    0.5,
  );
  assert(smallWithCost < largeWithCost);
  assert.equal(round(smallWithCost), 1.75);
  assert.equal(round(largeWithCost), 1.95);
}

function testShortPayoffPaysCostSymmetricallyAndStrengthScalesCost() {
  const fullStrength = calculateFoodPayoff(
    foodForPayoff({ entrySignal: 10, direction: "short", entryPayoffScale: 5, strength: 1 }),
    5,
    undefined,
    1,
  );
  const halfStrength = calculateFoodPayoff(
    foodForPayoff({ entrySignal: 10, direction: "short", entryPayoffScale: 5, strength: 0.5 }),
    5,
    undefined,
    1,
  );

  assert.equal(round(fullStrength), 0.8);
  assert.equal(round(halfStrength), 0.4);
}

function testFoodSnapshotsPayoffScaleAtSpawn() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
    candles: Array.from({ length: 20 }, (_, index) => ({
      timestamp: index,
      datetime: new Date(index * 60_000).toISOString(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      roc: Math.sin(index / 2) * 4,
      isStart: index === 0,
    })),
  });
  advanceMarketTimeline(timeline, 10, 20);
  const world = createSpawnerWorld(101, { initialSpawners: 1, transactionCost: 0 });
  const spawner = world.spawners[0];
  assert(spawner);
  world.tick = timeline.tick;
  spawner.genome.payoffProfile = { scaleWindowTicks: 8, scaleSampleStepTicks: 1 };

  emitFood(world, spawner, "long", 1, 1, timeline);
  const food = world.foods[0];
  assert(food);
  assert.equal(food.payoffScaleWindowTicks, 8);
  assert.equal(food.payoffScaleSampleStepTicks, 1);
  assert.equal(Number.isFinite(food.entryPayoffScale), true);
  const snapshottedScale = food.entryPayoffScale;

  spawner.genome.payoffProfile = { scaleWindowTicks: 1000, scaleSampleStepTicks: 1000 };
  advanceMarketTimeline(timeline, food.resolveTick, 20);
  world.tick = food.resolveTick;
  resolveFoods(world, timeline);

  assert.equal(food.entryPayoffScale, snapshottedScale);
  assert.equal(round(food.payoff ?? 0), round(calculateFoodPayoff(food, food.exitSignal ?? 0, food.exitPrice, 0)));
}

function foodForPayoff({
  entrySignal,
  direction,
  entryPayoffScale,
  strength = 1,
}: {
  entrySignal: number;
  direction: "long" | "short";
  entryPayoffScale: number;
  strength?: number;
}) {
  return {
    id: 1,
    creatorSpawnerId: 1,
    creatorLineageId: 1,
    spawnTick: 0,
    resolveTick: 1,
    direction,
    strength,
    horizonTicks: 1,
    entrySignal,
    entryPayoffScale,
    status: "pending" as const,
  };
}

function testFoodRuntimeIndexRebuildsFromFoods() {
  const world = createSpawnerWorld(101, { initialSpawners: 2 });
  const first = world.spawners[0];
  const second = world.spawners[1];
  assert.ok(first);
  assert.ok(second);
  world.foods = [
    {
      id: 1,
      creatorSpawnerId: first.id,
      creatorLineageId: first.lineageId,
      spawnTick: 0,
      resolveTick: 5,
      direction: "long",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "pending",
    },
    {
      id: 2,
      creatorSpawnerId: first.id,
      creatorLineageId: first.lineageId,
      spawnTick: 0,
      resolveTick: 5,
      direction: "short",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "loss",
      payoff: -1,
    },
    {
      id: 3,
      creatorSpawnerId: second.id,
      creatorLineageId: second.lineageId,
      spawnTick: 0,
      resolveTick: 5,
      direction: "short",
      strength: 1,
      horizonTicks: 5,
      entrySignal: 0,
      status: "pending",
    },
  ];

  const index = createFoodRuntimeIndex(world.foods);

  assert.equal(index.pendingCount, 2);
  assert.equal(index.resolvedCount, 1);
  assert.equal(index.pendingByCreatorId.get(first.id), 1);
  assert.equal(index.pendingByCreatorId.get(second.id), 1);
}

export const tests: SineTest[] = [
  { name: "Food Resolves Exactly Once", run: testFoodResolvesExactlyOnce },
  { name: "Dead Creator Food Resolves Without Mutating Dead Spawner", run: testDeadCreatorFoodResolvesWithoutMutatingDeadSpawner },
  { name: "Creator Killed By First Same Tick Food Does Not Receive Later Same Tick Credit", run: testCreatorKilledByFirstSameTickFoodDoesNotReceiveLaterSameTickCredit },
  { name: "Food Runtime Events Use Lightweight Snapshots", run: testFoodRuntimeEventsUseLightweightSnapshots },
  { name: "Candle Food Payoff Uses Signal Scale Instead Of Price Return", run: testCandleFoodPayoffUsesSignalScaleInsteadOfPriceReturn },
  { name: "Food Payoff Helper Uses Signal Scale For Generated And Candle Modes", run: testFoodPayoffHelperUsesSignalScaleForGeneratedAndCandleModes },
  { name: "Scale Relative Payoff And Absolute Cost", run: testScaleRelativePayoffAndAbsoluteCost },
  { name: "Short Payoff Pays Cost Symmetrically And Strength Scales Cost", run: testShortPayoffPaysCostSymmetricallyAndStrengthScalesCost },
  { name: "Food Snapshots Payoff Scale At Spawn", run: testFoodSnapshotsPayoffScaleAtSpawn },
  { name: "Food Runtime Index Rebuilds From Foods", run: testFoodRuntimeIndexRebuildsFromFoods },
];
