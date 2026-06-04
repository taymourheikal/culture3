import { ensureCompiledBrainPlan, type CompiledBrainPlan } from "./brainPlan";
import { recordSpawnerEvent } from "./events";
import { createRandomGenome } from "./genome";
import { createEmptyLearnedState, createEmptyTraceStore } from "./plasticity";
import { classifySpawnerDeath, isSpawnerAlive } from "./runtimeIndex";
import { createSpawnerSnapshot } from "./snapshots";
import type { SpawnerAgent, SpawnerGenome, SpawnerWorld } from "./types";

export function applySpawnerUpkeep(
  world: SpawnerWorld,
  spawner: SpawnerAgent,
  plan: Pick<CompiledBrainPlan, "activeUnitCount" | "activeConnectionCount" | "activeLayerCount"> = ensureCompiledBrainPlan(spawner.genome),
) {
  spawner.ageTicks += 1;
  spawner.cooldownTicks = Math.max(0, spawner.cooldownTicks - 1);
  spawner.energy -=
    world.config.energyDrainPerTick +
    plan.activeUnitCount * world.config.brainEnergyCostPerActiveUnit +
    plan.activeConnectionCount * world.config.brainEnergyCostPerActiveConnection +
    plan.activeLayerCount * world.config.brainEnergyCostPerActiveLayer;
  spawner.lastAction = "wait";
}

export function createInitialSpawners(world: SpawnerWorld) {
  const initialCount = Math.min(world.config.initialSpawners, world.config.maxSpawners);
  for (let index = 0; index < initialCount; index += 1) {
    world.spawners.push(createSpawner(world, createRandomGenome(world.rng, world.config, world.innovations)));
  }
}

export function pruneDeadSpawners(world: SpawnerWorld) {
  return collectLivingSpawners(world);
}

export function removeDeadSpawners(world: SpawnerWorld, _reason: "payoff" | "upkeep" | "action" | "manual" = "manual") {
  world.spawners = collectLivingSpawners(world);
}

export function createSpawner(world: SpawnerWorld, genome: SpawnerGenome, lineageId?: number, parent?: SpawnerAgent): SpawnerAgent {
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
    learnedState: createEmptyLearnedState(),
    traceStore: createEmptyTraceStore(),
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

function collectLivingSpawners(world: SpawnerWorld) {
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
        deathCause: classifySpawnerDeath(spawner, world.config),
        deathEnergyThreshold: world.config.deathEnergy,
        deathHealthThreshold: world.config.deathHealth,
        spawnerSnapshot: createSpawnerSnapshot(spawner),
      });
    }
  }
  return survivors;
}
