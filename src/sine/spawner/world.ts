import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { forwardSpawner } from "./brain";
import { DEFAULT_SPAWNER_CONFIG } from "./config";
import { recordSpawnerEvent } from "./events";
import { activeConnections, activeLayerIndexes, activeUnits, createInnovationRegistry, createRandomGenome, mutateGenome } from "./genome";
import { clamp, interpolate, sigmoid } from "./math";
import { buildMarketInputs } from "./marketInputs";
import { emitFood, resolveFoods } from "./reward";
import { SeededRng } from "./rng";
import { recordTelemetry } from "./telemetry";
import type { SpawnerAgent, SpawnerConfig, SpawnerGenome, SpawnerWorld } from "./types";

export function createSpawnerWorld(seed = 101, config: Partial<SpawnerConfig> = {}): SpawnerWorld {
  const fullConfig = { ...DEFAULT_SPAWNER_CONFIG, ...config };
  const rng = new SeededRng(seed);
  const innovations = createInnovationRegistry();
  const world: SpawnerWorld = {
    seed,
    rng,
    tick: 0,
    time: 0,
    nextEventId: 1,
    nextSpawnerId: 1,
    nextLineageId: 1,
    nextFoodId: 1,
    spawners: [],
    foods: [],
    recentEvents: [],
    lineages: {},
    cumulativeLoss: 0,
    cumulativeNetPayoff: 0,
    totalResolved: 0,
    totalLosses: 0,
    recentResolvedPayoffs: [],
    telemetry: [],
    config: fullConfig,
    innovations,
  };

  const initialCount = Math.min(fullConfig.initialSpawners, fullConfig.maxSpawners);
  for (let index = 0; index < initialCount; index += 1) {
    world.spawners.push(createSpawner(world, createRandomGenome(rng, fullConfig, innovations)));
  }

  return world;
}

export function advanceSpawnerWorldToTimeline(world: SpawnerWorld, timeline: MarketTimeline, maxSteps = Number.POSITIVE_INFINITY) {
  let steps = 0;
  while (world.tick < timeline.tick && steps < maxSteps) {
    world.tick += 1;
    world.time = getTimelineSampleByTick(timeline, world.tick).time;
    steps += 1;
    stepSpawnerWorld(world, timeline);
  }
  return {
    processedTicks: steps,
    remainingTicks: timeline.tick - world.tick,
  };
}

export function getVisibleSpawnerFoods(world: SpawnerWorld, centerTime: number, secondsVisible: number) {
  const start = centerTime - secondsVisible / 2;
  const end = centerTime + secondsVisible / 2;
  return world.foods.filter((food) => food.spawnTime <= end && food.resolveTime >= start);
}

export function spawnerHitRate(spawner: SpawnerAgent) {
  return spawner.resolvedCount > 0 ? spawner.wins / spawner.resolvedCount : 0;
}

export function spawnerAveragePayoff(spawner: SpawnerAgent) {
  return spawner.resolvedCount > 0 ? spawner.totalPayoff / spawner.resolvedCount : 0;
}

export function isSpawnerAlive(spawner: SpawnerAgent, config: SpawnerConfig) {
  return spawner.energy > config.deathEnergy && spawner.health > config.deathHealth;
}

function stepSpawnerWorld(world: SpawnerWorld, timeline: MarketTimeline) {
  resolveFoods(world, timeline);
  world.spawners = pruneDeadSpawners(world);

  const pendingDensity =
    world.foods.filter((food) => food.status === "pending").length / Math.max(1, world.config.pendingDensityDivisor);
  const marketInputs = buildMarketInputs(timeline, world.tick, pendingDensity);
  const newborns: SpawnerAgent[] = [];

  for (const spawner of world.spawners) {
    spawner.age += world.config.tickSeconds;
    spawner.cooldown = Math.max(0, spawner.cooldown - world.config.tickSeconds);
    spawner.energy -=
      (world.config.metabolism +
        activeUnits(spawner.genome).length * world.config.brainEnergyCostPerActiveUnit +
        activeConnections(spawner.genome).length * world.config.brainEnergyCostPerActiveConnection +
        activeLayerIndexes(spawner.genome).length * world.config.brainEnergyCostPerActiveLayer) *
      world.config.tickSeconds;
    spawner.lastAction = "wait";

    const inputs = [...marketInputs, clamp(spawner.energy / world.config.reproductionEnergy, -1, 2), clamp(spawner.health / 100, 0, 1)];
    const outputs = forwardSpawner(spawner, inputs);
    const longScore = sigmoid(outputs[0] ?? 0) + spawner.genome.thresholdBias;
    const shortScore = sigmoid(outputs[1] ?? 0) + spawner.genome.thresholdBias;
    const strength = clamp(sigmoid(outputs[2] ?? 0), world.config.minSignalStrength, 1);
    const horizon = interpolate(spawner.genome.minHorizon, spawner.genome.maxHorizon, sigmoid(outputs[3] ?? 0));
    const cooldown = spawner.genome.cooldownBase + sigmoid(outputs[4] ?? 0) * world.config.cooldownOutputMultiplier;

    if (spawner.cooldown <= 0 && spawner.energy > world.config.spawnCost + world.config.minimumSpawnEnergySurplus) {
      if (longScore >= world.config.spawnThreshold && longScore >= shortScore) {
        emitFood(world, spawner, "long", strength, horizon, timeline);
        spawner.cooldown = cooldown;
      } else if (shortScore >= world.config.spawnThreshold) {
        emitFood(world, spawner, "short", strength, horizon, timeline);
        spawner.cooldown = cooldown;
      } else {
        spawner.lastAction = "wait";
      }
    }

    const recentAverage =
      spawner.recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / Math.max(1, spawner.recentPayoffs.length);
    if (
      world.spawners.length + newborns.length < world.config.maxSpawners &&
      spawner.energy >= world.config.reproductionEnergy &&
      spawner.recentPayoffs.length >= world.config.reproductionMinResolved &&
      recentAverage >= world.config.reproductionMinAveragePayoff
    ) {
      spawner.energy -= world.config.reproductionCost;
      spawner.children += 1;
      const child = createSpawner(world, mutateGenome(spawner.genome, world.rng, world.config, world.innovations), spawner.lineageId, spawner);
      newborns.push(child);
      recordSpawnerEvent(world, {
        kind: "reproduction",
        spawnerId: spawner.id,
        lineageId: spawner.lineageId,
        childSpawnerId: child.id,
      });
    }
  }

  world.spawners = world.spawners.concat(newborns);
  world.spawners = pruneDeadSpawners(world);

  const minTime = world.time - world.config.foodHistorySeconds;
  world.foods = world.foods.filter((food) => food.status === "pending" || food.resolveTime >= minTime);
  recordTelemetry(world);
}

function pruneDeadSpawners(world: SpawnerWorld) {
  const survivors: SpawnerAgent[] = [];
  for (const spawner of world.spawners) {
    if (isSpawnerAlive(spawner, world.config)) {
      survivors.push(spawner);
    } else {
      const lineage = world.lineages[spawner.lineageId];
      if (lineage) lineage.totalDeaths += 1;
      recordSpawnerEvent(world, {
        kind: "death",
        spawnerId: spawner.id,
        lineageId: spawner.lineageId,
      });
    }
  }
  return survivors;
}

function createSpawner(world: SpawnerWorld, genome: SpawnerGenome, lineageId?: number, parent?: SpawnerAgent): SpawnerAgent {
  const id = world.nextSpawnerId;
  world.nextSpawnerId += 1;
  const assignedLineageId = lineageId ?? world.nextLineageId;
  if (lineageId === undefined) world.nextLineageId += 1;
  const lineage = world.lineages[assignedLineageId] ?? {
    id: assignedLineageId,
    totalBorn: 0,
    totalDeaths: 0,
  };
  lineage.totalBorn += 1;
  world.lineages[assignedLineageId] = lineage;

  return {
    id,
    lineageId: assignedLineageId,
    generation: parent ? parent.generation + 1 : 0,
    birthTick: world.tick,
    parentSpawnerId: parent?.id,
    genome,
    hiddenState: Object.fromEntries(genome.units.map((unit) => [unit.unitId, 0])),
    energy: world.config.initialEnergyMin + world.rng.next() * Math.max(0, world.config.initialEnergyMax - world.config.initialEnergyMin),
    health: world.config.initialHealth,
    age: 0,
    cooldown: world.rng.next() * world.config.initialCooldownMax,
    spawnedCount: 0,
    resolvedCount: 0,
    wins: 0,
    losses: 0,
    totalPayoff: 0,
    children: 0,
    lastAction: "wait",
    recentPayoffs: [],
  };
}
