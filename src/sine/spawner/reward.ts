import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { recordSpawnerEvent } from "./events";
import { duePendingFoods, registerPendingFood } from "./foodDueQueue";
import { applyFoodResolutionLearning } from "./learning";
import { computeLocalSignalScale, LOCAL_SCALE_FLOOR } from "./localSignalScale";
import { sanitizePayoffProfile } from "./payoffProfile";
import { createSpawnerRuntimeIndex, getLivingSpawner, isSpawnerAlive, type SpawnerRuntimeIndex } from "./runtimeIndex";
import type { SpawnerAgent, SpawnerDirection, SpawnerFood, SpawnerWorld } from "./types";

export function resolveFoods(world: SpawnerWorld, timeline: MarketTimeline, spawnerIndex = createSpawnerRuntimeIndex(world.spawners, world.config)) {
  for (const food of duePendingFoods(world)) {
    if (food.status !== "pending" || food.resolveTick > world.tick) continue;

    const outcome = resolveFoodOutcome(food, world, timeline);
    applyResolvedFoodToWorld(world, food, outcome.payoff);
    const creator = livingCreatorForFood(spawnerIndex, food);
    if (creator) {
      applyFoodResolutionLearning(creator, food.traceId, outcome.payoff);
      applyResolvedFoodToSpawner(world, creator, outcome.payoff);
      if (!isSpawnerAlive(creator, world.config)) spawnerIndex.livingIds.delete(creator.id);
    }
  }
}

export function calculateFoodPayoff(food: SpawnerFood, exitSignal: number, _exitPrice: number | undefined, transactionCost: number) {
  const direction = food.direction === "long" ? 1 : -1;
  const rawDirectionalMove = direction * (exitSignal - food.entrySignal);
  const rawNetMove = rawDirectionalMove - transactionCost;
  return (rawNetMove / Math.max(LOCAL_SCALE_FLOOR, food.entryPayoffScale ?? 1)) * food.strength;
}

export function resolveFoodOutcome(food: SpawnerFood, world: SpawnerWorld, timeline: MarketTimeline) {
  const exitSample = getTimelineSampleByTick(timeline, food.resolveTick);
  const payoff = calculateFoodPayoff(food, exitSample.signal, exitSample.price, world.config.transactionCost);
  food.exitSignal = exitSample.signal;
  food.exitPrice = exitSample.price;
  food.exitSourceTimestamp = exitSample.sourceTimestamp;
  food.payoff = payoff;
  food.status = payoff > 0 ? "win" : "loss";
  return {
    exitSignal: exitSample.signal,
    exitPrice: exitSample.price,
    exitSourceTimestamp: exitSample.sourceTimestamp,
    payoff,
    status: food.status,
  };
}

export function applyResolvedFoodToWorld(world: SpawnerWorld, food: SpawnerFood, payoff: number) {
  recordSpawnerEvent(world, {
    kind: "resolve",
    spawnerId: food.creatorSpawnerId,
    lineageId: food.creatorLineageId,
    foodId: food.id,
    status: food.status,
    payoff,
    tick: food.resolveTick,
    foodEvent: createFoodEventSnapshot(food),
  });
  world.cumulativeNetPayoff += payoff;
  world.totalResolved += 1;
  world.recentResolvedPayoffs.push(payoff);
  while (world.recentResolvedPayoffs.length > Math.max(1, Math.round(world.config.recentResolvedPayoffWindow))) {
    world.recentResolvedPayoffs.shift();
  }
  if (payoff < 0) {
    world.totalLosses += 1;
    world.cumulativeLoss += -payoff;
  }
}

export function applyResolvedFoodToSpawner(world: SpawnerWorld, creator: SpawnerAgent, payoff: number) {
  creator.resolvedCount += 1;
  creator.totalPayoff += payoff;
  creator.recentPayoffs.push(payoff);
  while (creator.recentPayoffs.length > Math.max(1, Math.round(world.config.agentRecentPayoffWindow))) {
    creator.recentPayoffs.shift();
  }

  if (payoff > 0) {
    creator.wins += 1;
    creator.energy += payoff * world.config.rewardScale;
    creator.health = Math.min(world.config.initialHealth, creator.health + payoff * world.config.healthGainScale);
  } else {
    creator.losses += 1;
    creator.energy += payoff * world.config.rewardScale;
    creator.health += payoff * world.config.lossHealthScale;
  }
}

export function emitFood(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  direction: SpawnerDirection,
  strength: number,
  horizonTicks: number,
  timeline: MarketTimeline,
  traceId?: number,
) {
  const entrySample = getTimelineSampleByTick(timeline, world.tick);
  const payoffProfile = sanitizePayoffProfile(spawner.genome.payoffProfile);
  const entryPayoffScale = computeLocalSignalScale(timeline, world.tick, payoffProfile.scaleWindowTicks, payoffProfile.scaleSampleStepTicks);
  const resolvedHorizonTicks = Math.max(1, Math.round(horizonTicks));
  const resolveTick = world.tick + resolvedHorizonTicks;
  const foodId = world.nextFoodId;
  const food = createFoodMarker({
    id: foodId,
    spawner,
    spawnTick: world.tick,
    resolveTick,
    direction,
    strength,
    horizonTicks: resolvedHorizonTicks,
    entrySignal: entrySample.signal,
    entryPayoffScale,
    payoffScaleWindowTicks: payoffProfile.scaleWindowTicks,
    payoffScaleSampleStepTicks: payoffProfile.scaleSampleStepTicks,
    entryPrice: entrySample.price,
    sourceTimestamp: entrySample.sourceTimestamp,
    traceId,
  });
  world.foods.push(food);
  registerPendingFood(world, food);
  world.nextFoodId += 1;
  recordSpawnerEvent(world, {
    kind: "spawn",
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    foodId,
    tick: world.tick,
    foodEvent: createFoodEventSnapshot(food),
  });
  spawner.spawnedCount += 1;
  spawner.energy -= world.config.spawnCost * (0.55 + strength);
  spawner.lastAction = direction;
}

export function createFoodEventSnapshot(food: SpawnerFood) {
  return {
    id: food.id,
    creatorSpawnerId: food.creatorSpawnerId,
    creatorLineageId: food.creatorLineageId,
    spawnTick: food.spawnTick,
    resolveTick: food.resolveTick,
    direction: food.direction,
    strength: food.strength,
    horizonTicks: food.horizonTicks,
    entrySignal: food.entrySignal,
    exitSignal: food.exitSignal,
    entryPayoffScale: food.entryPayoffScale,
    payoffScaleWindowTicks: food.payoffScaleWindowTicks,
    payoffScaleSampleStepTicks: food.payoffScaleSampleStepTicks,
    entryPrice: food.entryPrice,
    exitPrice: food.exitPrice,
    sourceTimestamp: food.sourceTimestamp,
    exitSourceTimestamp: food.exitSourceTimestamp,
    traceId: food.traceId,
    payoff: food.payoff,
    status: food.status,
  };
}

function livingCreatorForFood(index: SpawnerRuntimeIndex, food: SpawnerFood) {
  return getLivingSpawner(index, food.creatorSpawnerId);
}

export function createFoodMarker({
  id,
  spawner,
  spawnTick,
  resolveTick,
  direction,
  strength,
  horizonTicks,
  entrySignal,
  entryPayoffScale,
  payoffScaleWindowTicks,
  payoffScaleSampleStepTicks,
  entryPrice,
  sourceTimestamp,
  traceId,
}: {
  id: number;
  spawner: SpawnerAgent;
  spawnTick: number;
  resolveTick: number;
  direction: SpawnerDirection;
  strength: number;
  horizonTicks: number;
  entrySignal: number;
  entryPayoffScale?: number;
  payoffScaleWindowTicks?: number;
  payoffScaleSampleStepTicks?: number;
  entryPrice?: number;
  sourceTimestamp?: number;
  traceId?: number;
}): SpawnerFood {
  return {
    id,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick,
    resolveTick,
    direction,
    strength,
    horizonTicks,
    entrySignal,
    entryPayoffScale,
    payoffScaleWindowTicks,
    payoffScaleSampleStepTicks,
    entryPrice,
    sourceTimestamp,
    traceId,
    status: "pending",
  };
}
