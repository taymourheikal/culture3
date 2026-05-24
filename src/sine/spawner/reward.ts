import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { recordSpawnerEvent } from "./events";
import type { SpawnerAgent, SpawnerDirection, SpawnerWorld } from "./types";

export function resolveFoods(world: SpawnerWorld, timeline: MarketTimeline) {
  for (const food of world.foods) {
    if (food.status !== "pending" || food.resolveTick > world.tick) continue;

    const exitSample = getTimelineSampleByTick(timeline, food.resolveTick);
    const exitSignal = exitSample.signal;
    const direction = food.direction === "long" ? 1 : -1;
    const exitPrice = exitSample.price;
    const payoff =
      food.entryPrice !== undefined && exitPrice !== undefined
        ? direction * ((exitPrice - food.entryPrice) / Math.max(0.000001, food.entryPrice)) * 100 * food.strength -
          world.config.transactionCost
        : direction * (exitSignal - food.entrySignal) * food.strength - world.config.transactionCost;
    food.exitSignal = exitSignal;
    food.exitPrice = exitPrice;
    food.exitSourceTimestamp = exitSample.sourceTimestamp;
    food.payoff = payoff;
    food.status = payoff > 0 ? "win" : "loss";
    recordSpawnerEvent(world, {
      kind: "resolve",
      spawnerId: food.creatorSpawnerId,
      lineageId: food.creatorLineageId,
      foodId: food.id,
      status: food.status,
      payoff,
      tick: food.resolveTick,
      foodSnapshot: structuredClone(food),
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

    const creator = world.spawners.find((spawner) => spawner.id === food.creatorSpawnerId);
    if (!creator) continue;

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
}

export function emitFood(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  direction: SpawnerDirection,
  strength: number,
  horizonTicks: number,
  timeline: MarketTimeline,
) {
  const entrySample = getTimelineSampleByTick(timeline, world.tick);
  const resolvedHorizonTicks = Math.max(1, Math.round(horizonTicks));
  const resolveTick = world.tick + resolvedHorizonTicks;
  const foodId = world.nextFoodId;
  world.foods.push({
    id: foodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: world.tick,
    resolveTick,
    direction,
    strength,
    horizonTicks: resolvedHorizonTicks,
    entrySignal: entrySample.signal,
    entryPrice: entrySample.price,
    sourceTimestamp: entrySample.sourceTimestamp,
    status: "pending",
  });
  world.nextFoodId += 1;
  recordSpawnerEvent(world, {
    kind: "spawn",
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    foodId,
    tick: world.tick,
    foodSnapshot: structuredClone(world.foods[world.foods.length - 1]),
  });
  spawner.spawnedCount += 1;
  spawner.energy -= world.config.spawnCost * (0.55 + strength);
  spawner.lastAction = direction;
}
