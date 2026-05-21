import type { ConnectionSource, ConnectionTarget, GateType, HiddenUnitGene, InnovationRegistry, SpawnerConfig, SpawnerGenome } from "./types";
import type { SeededRng } from "./rng";

export const GATES: GateType[] = ["update", "reset", "candidate"];

export function activeUnits(genome: SpawnerGenome) {
  return genome.units.filter((unit) => unit.enabled);
}

export function activeLayerIndexes(genome: SpawnerGenome) {
  return [...new Set(activeUnits(genome).map((unit) => unit.layerIndex))].sort((left, right) => left - right);
}

export function createUnitGene(unitId: number, innovationId: number, layerIndex: number, rng: SeededRng, config: SpawnerConfig): HiddenUnitGene {
  return {
    unitId,
    innovationId,
    layerIndex,
    enabled: true,
    updateBias: rng.gaussian(0, config.gateBiasStdDev),
    resetBias: rng.gaussian(0, config.gateBiasStdDev),
    candidateBias: rng.gaussian(0, config.gateBiasStdDev),
  };
}

export function cloneGenome(genome: SpawnerGenome): SpawnerGenome {
  return {
    units: genome.units.map((unit) => ({ ...unit })),
    connections: genome.connections.map((connection) => ({
      innovationId: connection.innovationId,
      source: { ...connection.source },
      target: { ...connection.target },
      weight: connection.weight,
      enabled: connection.enabled,
    })),
    outputBias: [...genome.outputBias],
    nextUnitId: genome.nextUnitId,
    mutationStd: genome.mutationStd,
    thresholdBias: genome.thresholdBias,
    minHorizon: genome.minHorizon,
    maxHorizon: genome.maxHorizon,
    cooldownBase: genome.cooldownBase,
  };
}

export function findEnabledUnit(genome: SpawnerGenome, unitId: number) {
  return genome.units.find((unit) => unit.unitId === unitId && unit.enabled);
}

export function nextLayerAfter(genome: SpawnerGenome, layerIndex: number) {
  return activeLayerIndexes(genome).find((candidate) => candidate > layerIndex);
}

export function sourceIsActive(source: ConnectionSource, enabledUnitIds: Set<number>) {
  return source.kind === "input" || enabledUnitIds.has(source.unitId);
}

export function targetIsActive(target: ConnectionTarget, enabledUnitIds: Set<number>) {
  return target.kind === "output" || enabledUnitIds.has(target.unitId);
}

export function randomRange(rng: SeededRng, min: number, max: number) {
  return min + rng.next() * Math.max(0, max - min);
}

export function randomInt(rng: SeededRng, min: number, max: number) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(rng.next() * (high - low + 1));
}

export function vector(rng: SeededRng, count: number, scale: number) {
  return Array.from({ length: count }, () => rng.gaussian(0, scale));
}

export function choose<T>(items: T[], rng: SeededRng) {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng.next() * items.length)];
}

export function randomGate(rng: SeededRng) {
  return GATES[Math.floor(rng.next() * GATES.length)] ?? "candidate";
}

export function addFounderConnections(targetCount: number, add: () => boolean) {
  let added = 0;
  let attempts = 0;
  const desired = Math.max(0, targetCount);
  while (added < desired && attempts < Math.max(8, desired * 12)) {
    if (add()) added += 1;
    attempts += 1;
  }
}

export function allocateInnovationId(innovations: InnovationRegistry) {
  const id = innovations.nextInnovationId;
  innovations.nextInnovationId += 1;
  return id;
}
