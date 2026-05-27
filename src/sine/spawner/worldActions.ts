import type { MarketTimeline } from "../marketTimeline";
import { OUTPUT_INDEX } from "./config";
import { materializeEffectiveGenomeForInheritance } from "./effectiveGenome";
import { recordSpawnerEvent } from "./events";
import { applyReproductionLearning } from "./learning";
import { clamp, interpolate, sigmoid } from "./math";
import { mutateGenome } from "./genome";
import { currentReproductionCost, currentReproductionEnergyRequirement } from "./reproductionPressure";
import { emitFood } from "./reward";
import { createSpawnerSnapshot } from "./snapshots";
import type { SpawnerAgent, SpawnerDirection, SpawnerWorld } from "./types";
import { createSpawner } from "./worldLifecycle";

export type SpawnerDecodedOutputs = {
  longScore: number;
  shortScore: number;
  strength: number;
  spawnThreshold: number;
  horizonTicks: number;
  cooldownTicks: number;
  reproductionProbability: number;
};

export type SpawnerActionChoice = SpawnerDirection | "wait";

export function decodeSpawnerOutputs(world: SpawnerWorld, spawner: SpawnerAgent, outputs: number[]): SpawnerDecodedOutputs {
  const tradingPolicy = spawner.genome.tradingPolicy;
  return {
    longScore: sigmoid(outputs[OUTPUT_INDEX.long] ?? 0) + spawner.genome.thresholdBias,
    shortScore: sigmoid(outputs[OUTPUT_INDEX.short] ?? 0) + spawner.genome.thresholdBias,
    strength: clamp(sigmoid(outputs[OUTPUT_INDEX.strength] ?? 0), tradingPolicy.minSignalStrength, 1),
    spawnThreshold: tradingPolicy.spawnThreshold,
    horizonTicks: Math.max(
      1,
      Math.round(interpolate(spawner.genome.minHorizonTicks, spawner.genome.maxHorizonTicks, sigmoid(outputs[OUTPUT_INDEX.horizon] ?? 0))),
    ),
    cooldownTicks: Math.max(
      0,
      Math.round(spawner.genome.cooldownBaseTicks + sigmoid(outputs[OUTPUT_INDEX.cooldown] ?? 0) * world.config.cooldownOutputMultiplierTicks),
    ),
    reproductionProbability: sigmoid(outputs[OUTPUT_INDEX.reproduce] ?? 0),
  };
}

export function chooseSpawnerAction(world: SpawnerWorld, spawner: SpawnerAgent, decoded: SpawnerDecodedOutputs): SpawnerActionChoice {
  if (spawner.cooldownTicks > 0 || spawner.energy <= world.config.spawnCost + world.config.minimumSpawnEnergySurplus) return "wait";
  if (decoded.longScore >= decoded.spawnThreshold && decoded.longScore >= decoded.shortScore) return "long";
  if (decoded.shortScore >= decoded.spawnThreshold) return "short";
  return "wait";
}

export function trySpawnFood(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  decoded: SpawnerDecodedOutputs,
  timeline: MarketTimeline,
  action = chooseSpawnerAction(world, spawner, decoded),
  traceId?: number,
) {
  if (action === "wait") return false;
  emitFood(world, spawner, action, decoded.strength, decoded.horizonTicks, timeline, traceId);
  spawner.cooldownTicks = decoded.cooldownTicks;
  return true;
}

export function tryReproduceSpawner(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  decoded: Pick<SpawnerDecodedOutputs, "reproductionProbability">,
  newborns: SpawnerAgent[],
  traceId?: number | (() => number),
) {
  const reproductionPopulation = world.spawners.length + newborns.length;
  const reproductionCost = currentReproductionCost(world.config, reproductionPopulation);
  const requiredEnergy = currentReproductionEnergyRequirement(world.config, reproductionPopulation);
  if (
    world.spawners.length + newborns.length >= world.config.maxSpawners ||
    spawner.energy < requiredEnergy ||
    world.rng.next() >= decoded.reproductionProbability
  ) {
    return null;
  }
  spawner.energy -= reproductionCost;
  spawner.children += 1;
  const resolvedTraceId = typeof traceId === "function" ? traceId() : traceId;
  applyReproductionLearning(spawner, resolvedTraceId);
  const inheritedGenome = materializeEffectiveGenomeForInheritance(spawner.genome, spawner.learnedState);
  const child = createSpawner(world, mutateGenome(inheritedGenome, world.rng, world.config, world.innovations), spawner.lineageId, spawner);
  newborns.push(child);
  recordSpawnerEvent(world, {
    kind: "reproduction",
    spawnerId: spawner.id,
    lineageId: spawner.lineageId,
    childSpawnerId: child.id,
    spawnerSnapshot: createSpawnerSnapshot(spawner),
    childSpawnerSnapshot: createSpawnerSnapshot(child),
  });
  return child;
}
