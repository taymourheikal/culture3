import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { recordSpawnerEvent } from "./events";
import type { SpawnerAgent, SpawnerDirection, SpawnerWorld } from "./types";

export function resolveFoods(world: SpawnerWorld, timeline: MarketTimeline) {
  for (const food of world.foods) {
    if (food.status !== "pending" || food.resolveTick > world.tick) continue;

    const exitSample = getTimelineSampleByTick(timeline, food.resolveTick);
    const exitSignal = exitSample.signal;
    const direction = food.direction === "long" ? 1 : -1;
    const payoff = direction * (exitSignal - food.entrySignal) * food.strength - world.config.transactionCost;
    food.exitSignal = exitSignal;
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
      time: food.resolveTime,
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
  horizon: number,
  timeline: MarketTimeline,
) {
  const entrySample = getTimelineSampleByTick(timeline, world.tick);
  const horizonTicks = Math.max(1, Math.round(horizon / timeline.tickSeconds));
  const resolveTick = world.tick + horizonTicks;
  const foodId = world.nextFoodId;
  world.foods.push({
    id: foodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: world.tick,
    resolveTick,
    spawnTime: entrySample.time,
    resolveTime: resolveTick * timeline.tickSeconds,
    direction,
    strength,
    horizon: horizonTicks * timeline.tickSeconds,
    entrySignal: entrySample.signal,
    status: "pending",
  });
  world.nextFoodId += 1;
  recordSpawnerEvent(world, {
    kind: "spawn",
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    foodId,
    tick: world.tick,
    time: entrySample.time,
  });
  spawner.spawnedCount += 1;
  spawner.energy -= world.config.spawnCost * (0.55 + strength);
  spawner.lastAction = direction;
}
