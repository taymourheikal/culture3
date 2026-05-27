import { INPUT_COUNT, OUTPUT_COUNT } from "./config";
import { activeUnits, choose, findEnabledUnit, GATES, nextLayerAfter, sourceIsActive, targetIsActive } from "./genomeCommon";
import { getOrCreateConnectionInnovationId, sourceKey, targetKey } from "./genomeInnovation";
import type { ConnectionGene, ConnectionSource, ConnectionTarget, HiddenUnitGene, InnovationRegistry, SpawnerConfig, SpawnerGenome } from "./types";
import type { SeededRng } from "./rng";

export type LegalConnectionCandidate = {
  source: ConnectionSource;
  target: ConnectionTarget;
};

export function activeConnections(genome: SpawnerGenome) {
  const enabledUnitIds = new Set(activeUnits(genome).map((unit) => unit.unitId));
  return genome.connections.filter(
    (connection) =>
      connection.enabled &&
      sourceIsActive(connection.source, enabledUnitIds) &&
      targetIsActive(connection.target, enabledUnitIds),
  );
}

export function connectionKey(connection: Pick<ConnectionGene, "source" | "target">) {
  return `${sourceKey(connection.source)}->${targetKey(connection.target)}`;
}

export function isLegalConnection(genome: SpawnerGenome, source: ConnectionSource, target: ConnectionTarget, config: SpawnerConfig) {
  if (source.kind === "input" && (source.index < 0 || source.index >= INPUT_COUNT)) return false;
  if (target.kind === "output") {
    if (target.index < 0 || target.index >= OUTPUT_COUNT) return false;
    if (source.kind === "input") return config.allowInputToOutputConnections >= 0.5;
    return source.mode === "current" && !!findEnabledUnit(genome, source.unitId);
  }

  const targetUnit = findEnabledUnit(genome, target.unitId);
  if (!targetUnit) return false;
  if (source.kind === "input") return true;

  const sourceUnit = findEnabledUnit(genome, source.unitId);
  if (!sourceUnit) return false;
  if (source.mode === "previous") return sourceUnit.layerIndex === targetUnit.layerIndex;
  if (sourceUnit.layerIndex >= targetUnit.layerIndex) return false;
  if (config.allowSkipConnections >= 0.5) return true;
  return targetUnit.layerIndex === nextLayerAfter(genome, sourceUnit.layerIndex);
}

export function addRandomLegalConnection(
  genome: SpawnerGenome,
  rng: SeededRng,
  config: SpawnerConfig,
  innovations: InnovationRegistry,
  weightStdDev = config.newConnectionWeightStdDev,
) {
  return addRandomLegalConnectionMatching(genome, rng, config, innovations, () => true, weightStdDev);
}

export function addRandomConnectionTouchingUnit(
  genome: SpawnerGenome,
  unit: HiddenUnitGene,
  rng: SeededRng,
  config: SpawnerConfig,
  innovations: InnovationRegistry,
  weightStdDev = config.newConnectionWeightStdDev,
) {
  return addRandomLegalConnectionMatching(genome, rng, config, innovations, (candidate) => connectionTouchesUnit(candidate, unit), weightStdDev);
}

export function addRandomLegalConnectionMatching(
  genome: SpawnerGenome,
  rng: SeededRng,
  config: SpawnerConfig,
  innovations: InnovationRegistry,
  matches: (candidate: LegalConnectionCandidate) => boolean,
  weightStdDev = config.newConnectionWeightStdDev,
) {
  const candidates = legalConnectionCandidates(genome, config).filter(
    (candidate) => matches(candidate) && !genome.connections.some((connection) => connectionKey(connection) === connectionKey(candidate)),
  );
  const candidate = choose(candidates, rng);
  if (!candidate) return false;
  return addConnectionIfMissing(genome, candidate.source, candidate.target, rng.gaussian(0, weightStdDev), innovations);
}

function connectionTouchesUnit(candidate: LegalConnectionCandidate, unit: HiddenUnitGene) {
  const sourceTouches = candidate.source.kind === "hidden" && candidate.source.unitId === unit.unitId;
  const targetTouches = candidate.target.kind === "hidden" && candidate.target.unitId === unit.unitId;
  return sourceTouches || targetTouches;
}

export function addConnectionIfMissing(
  genome: SpawnerGenome,
  source: ConnectionSource,
  target: ConnectionTarget,
  weight: number,
  innovations: InnovationRegistry,
) {
  const key = `${sourceKey(source)}->${targetKey(target)}`;
  if (genome.connections.some((connection) => connectionKey(connection) === key)) return false;
  genome.connections.push({
    innovationId: getOrCreateConnectionInnovationId(genome, innovations, source, target),
    source,
    target,
    weight,
    enabled: true,
  });
  return true;
}

function legalConnectionCandidates(genome: SpawnerGenome, config: SpawnerConfig) {
  const candidates: LegalConnectionCandidate[] = [];
  const enabledUnits = activeUnits(genome);
  for (const target of enabledUnits) {
    for (let input = 0; input < INPUT_COUNT; input += 1) {
      for (const gate of GATES) candidates.push({ source: { kind: "input", index: input }, target: { kind: "hidden", unitId: target.unitId, gate } });
    }
    for (const source of enabledUnits) {
      for (const gate of GATES) {
        candidates.push({ source: { kind: "hidden", unitId: source.unitId, mode: "previous" }, target: { kind: "hidden", unitId: target.unitId, gate } });
        if (source.layerIndex < target.layerIndex && (config.allowSkipConnections >= 0.5 || target.layerIndex === nextLayerAfter(genome, source.layerIndex))) {
          candidates.push({ source: { kind: "hidden", unitId: source.unitId, mode: "current" }, target: { kind: "hidden", unitId: target.unitId, gate } });
        }
      }
    }
  }
  for (let output = 0; output < OUTPUT_COUNT; output += 1) {
    for (const unit of enabledUnits) {
      candidates.push({ source: { kind: "hidden", unitId: unit.unitId, mode: "current" }, target: { kind: "output", index: output } });
    }
    if (config.allowInputToOutputConnections >= 0.5) {
      for (let input = 0; input < INPUT_COUNT; input += 1) {
        candidates.push({ source: { kind: "input", index: input }, target: { kind: "output", index: output } });
      }
    }
  }
  return candidates.filter((candidate) => isLegalConnection(genome, candidate.source, candidate.target, config));
}
