import type { MarketTimeline } from "../marketTimeline";
import { forwardSpawner } from "./brain";
import { DEFAULT_SPAWNER_CONFIG, OUTPUT_INDEX } from "./config";
import { recordSpawnerEvent } from "./events";
import { activeConnections, activeLayerIndexes, activeUnits, createInnovationRegistry, createRandomGenome, mutateGenome } from "./genome";
import { clamp, interpolate, sigmoid } from "./math";
import { createMarketInputResolver } from "./marketInputs";
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
    steps += 1;
    stepSpawnerWorld(world, timeline);
  }
  return {
    processedTicks: steps,
    remainingTicks: timeline.tick - world.tick,
  };
}

export function getVisibleSpawnerFoods(world: Pick<SpawnerWorld, "foods">, centerTick: number, ticksVisible: number) {
  const start = centerTick - ticksVisible / 2;
  const end = centerTick + ticksVisible / 2;
  return world.foods.filter((food) => food.spawnTick <= end && food.resolveTick >= start);
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

  const pendingFoodCount = world.foods.filter((food) => food.status === "pending").length;
  const marketInputResolver = createMarketInputResolver(timeline, world.tick, pendingFoodCount);
  const newborns: SpawnerAgent[] = [];

  for (const spawner of world.spawners) {
    spawner.ageTicks += 1;
    spawner.cooldownTicks = Math.max(0, spawner.cooldownTicks - 1);
    spawner.energy -=
      world.config.energyDrainPerTick +
      activeUnits(spawner.genome).length * world.config.brainEnergyCostPerActiveUnit +
      activeConnections(spawner.genome).length * world.config.brainEnergyCostPerActiveConnection +
      activeLayerIndexes(spawner.genome).length * world.config.brainEnergyCostPerActiveLayer;
    spawner.lastAction = "wait";

    const marketInputs = marketInputResolver.resolve(spawner.genome.perception);
    const inputs = [...marketInputs, clamp(spawner.energy / world.config.reproductionEnergy, -1, 2), clamp(spawner.health / 100, 0, 1)];
    const outputs = forwardSpawner(spawner, inputs);
    const longScore = sigmoid(outputs[OUTPUT_INDEX.long] ?? 0) + spawner.genome.thresholdBias;
    const shortScore = sigmoid(outputs[OUTPUT_INDEX.short] ?? 0) + spawner.genome.thresholdBias;
    const strength = clamp(sigmoid(outputs[OUTPUT_INDEX.strength] ?? 0), world.config.minSignalStrength, 1);
    const horizonTicks = Math.max(
      1,
      Math.round(interpolate(spawner.genome.minHorizonTicks, spawner.genome.maxHorizonTicks, sigmoid(outputs[OUTPUT_INDEX.horizon] ?? 0))),
    );
    const cooldownTicks = Math.max(
      0,
      Math.round(spawner.genome.cooldownBaseTicks + sigmoid(outputs[OUTPUT_INDEX.cooldown] ?? 0) * world.config.cooldownOutputMultiplierTicks),
    );
    const reproductionProbability = sigmoid(outputs[OUTPUT_INDEX.reproduce] ?? 0);

    if (spawner.cooldownTicks <= 0 && spawner.energy > world.config.spawnCost + world.config.minimumSpawnEnergySurplus) {
      if (longScore >= world.config.spawnThreshold && longScore >= shortScore) {
        emitFood(world, spawner, "long", strength, horizonTicks, timeline);
        spawner.cooldownTicks = cooldownTicks;
      } else if (shortScore >= world.config.spawnThreshold) {
        emitFood(world, spawner, "short", strength, horizonTicks, timeline);
        spawner.cooldownTicks = cooldownTicks;
      } else {
        spawner.lastAction = "wait";
      }
    }

    if (
      world.spawners.length + newborns.length < world.config.maxSpawners &&
      spawner.energy >= world.config.reproductionEnergy &&
      world.rng.next() < reproductionProbability
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
        spawnerSnapshot: structuredClone(spawner),
        childSpawnerSnapshot: structuredClone(child),
      });
    }
  }

  world.spawners = world.spawners.concat(newborns);
  world.spawners = pruneDeadSpawners(world);

  const minTick = world.tick - world.config.foodHistoryTicks;
  world.foods = world.foods.filter((food) => food.status === "pending" || food.resolveTick >= minTick);
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
        spawnerSnapshot: structuredClone(spawner),
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
    ageTicks: 0,
    cooldownTicks: Math.round(world.rng.next() * world.config.initialCooldownMaxTicks),
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
