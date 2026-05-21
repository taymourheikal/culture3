import { allocateInnovationId } from "./genomeCommon";
import type { ConnectionSource, ConnectionTarget, InnovationRegistry, SpawnerGenome } from "./types";

export function createInnovationRegistry(): InnovationRegistry {
  return {
    nextInnovationId: 1,
    connectionInnovations: {},
  };
}

export function connectionInnovationId(source: ConnectionSource, target: ConnectionTarget) {
  return stableHash(`${sourceKey(source)}->${targetKey(target)}`);
}

export function getOrCreateConnectionInnovationId(
  genome: SpawnerGenome,
  innovations: InnovationRegistry,
  source: ConnectionSource,
  target: ConnectionTarget,
) {
  const key = connectionStructuralKey(genome, source, target);
  innovations.connectionInnovations[key] ??= allocateInnovationId(innovations);
  return innovations.connectionInnovations[key];
}

export function sourceKey(source: ConnectionSource) {
  return source.kind === "input" ? `i:${source.index}` : `h:${source.mode}:${source.unitId}`;
}

export function targetKey(target: ConnectionTarget) {
  return target.kind === "output" ? `o:${target.index}` : `h:${target.unitId}:${target.gate}`;
}

function connectionStructuralKey(genome: SpawnerGenome, source: ConnectionSource, target: ConnectionTarget) {
  const sourcePart =
    source.kind === "input"
      ? `i:${source.index}`
      : `h:${source.mode}:${genome.units.find((unit) => unit.unitId === source.unitId)?.innovationId ?? source.unitId}`;
  const targetPart =
    target.kind === "output" ? `o:${target.index}` : `h:${genome.units.find((unit) => unit.unitId === target.unitId)?.innovationId ?? target.unitId}:${target.gate}`;
  return `${sourcePart}->${targetPart}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
