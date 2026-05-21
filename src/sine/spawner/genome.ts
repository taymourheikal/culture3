import { INPUT_COUNT, OUTPUT_COUNT } from "./config";
import { clamp } from "./math";
import type { SeededRng } from "./rng";
import type {
  ConnectionGene,
  ConnectionSource,
  ConnectionTarget,
  GateType,
  HiddenUnitGene,
  InnovationRegistry,
  SpawnerConfig,
  SpawnerGenome,
} from "./types";

const GATES: GateType[] = ["update", "reset", "candidate"];

export function createInnovationRegistry(): InnovationRegistry {
  return {
    nextInnovationId: 1,
    connectionInnovations: {},
  };
}

export function createRandomGenome(rng: SeededRng, config: SpawnerConfig, innovations: InnovationRegistry): SpawnerGenome {
  const unitCount = randomInt(
    rng,
    Math.max(1, Math.round(config.initialHiddenUnitsMin)),
    Math.max(1, Math.round(config.initialHiddenUnitsMax)),
  );
  const genome: SpawnerGenome = {
    units: [],
    connections: [],
    outputBias: vector(rng, OUTPUT_COUNT, config.outputBiasStdDev),
    nextUnitId: 1,
    mutationStd: config.baseMutationStdDev,
    thresholdBias: rng.gaussian(0, config.thresholdBiasInitialStdDev),
    minHorizon: randomRange(rng, config.initialMinHorizonMin, config.initialMinHorizonMax),
    maxHorizon: randomRange(rng, config.initialMaxHorizonMin, config.initialMaxHorizonMax),
    cooldownBase: randomRange(rng, config.cooldownBaseInitialMin, config.cooldownBaseInitialMax),
  };

  for (let index = 0; index < unitCount; index += 1) {
    genome.units.push(createUnitGene(genome.nextUnitId, allocateInnovationId(innovations), 1, rng, config));
    genome.nextUnitId += 1;
  }

  for (const unit of genome.units) {
    addFounderConnections(Math.round(config.initialInputConnectionsPerUnit), () =>
      addConnectionIfMissing(
        genome,
        { kind: "input", index: randomInt(rng, 0, INPUT_COUNT - 1) },
        { kind: "hidden", unitId: unit.unitId, gate: randomGate(rng) },
        rng.gaussian(0, config.newConnectionWeightStdDev),
        innovations,
      ),
    );
    addFounderConnections(Math.round(config.initialRecurrentConnectionsPerUnit), () => {
      const source = choose(genome.units, rng);
      if (!source) return false;
      return addConnectionIfMissing(
        genome,
        { kind: "hidden", unitId: source.unitId, mode: "previous" },
        { kind: "hidden", unitId: unit.unitId, gate: randomGate(rng) },
        rng.gaussian(0, config.newConnectionWeightStdDev),
        innovations,
      );
    });
  }

  for (let output = 0; output < OUTPUT_COUNT; output += 1) {
    addFounderConnections(Math.round(config.initialOutputConnectionsPerOutput), () => {
      const source = choose(genome.units, rng);
      if (!source) return false;
      return addConnectionIfMissing(
        genome,
        { kind: "hidden", unitId: source.unitId, mode: "current" },
        { kind: "output", index: output },
        rng.gaussian(0, config.newConnectionWeightStdDev),
        innovations,
      );
    });
  }

  return genome;
}

export function mutateGenome(genome: SpawnerGenome, rng: SeededRng, config: SpawnerConfig, innovations: InnovationRegistry): SpawnerGenome {
  const child = cloneGenome(genome);
  mutateNumericGenes(child, rng, config);
  if (rng.next() < config.addUnitRate) addRandomUnit(child, rng, config, innovations);
  if (rng.next() < config.disableUnitRate) setRandomUnitEnabled(child, rng, false);
  if (rng.next() < config.reenableUnitRate) setRandomUnitEnabled(child, rng, true);
  if (rng.next() < config.addConnectionRate) addRandomLegalConnection(child, rng, config, innovations);
  if (rng.next() < config.disableConnectionRate) setRandomConnectionEnabled(child, rng, false);
  if (rng.next() < config.reenableConnectionRate) setRandomConnectionEnabled(child, rng, true, config);

  child.mutationStd = clamp(
    child.mutationStd + rng.gaussian(0, config.mutationStdDevMutationStdDev),
    config.mutationStdDevMin,
    config.mutationStdDevMax,
  );
  child.thresholdBias = clamp(
    child.thresholdBias + rng.gaussian(0, config.thresholdBiasMutationStdDev),
    config.thresholdBiasMin,
    config.thresholdBiasMax,
  );
  const minHorizon = clamp(
    child.minHorizon + rng.gaussian(0, config.minHorizonMutationStdDev),
    config.minHorizonClampMin,
    config.minHorizonClampMax,
  );
  child.minHorizon = minHorizon;
  child.maxHorizon = clamp(
    Math.max(minHorizon + 0.5, child.maxHorizon + rng.gaussian(0, config.maxHorizonMutationStdDev)),
    config.maxHorizonClampMin,
    config.maxHorizonClampMax,
  );
  child.cooldownBase = clamp(
    child.cooldownBase + rng.gaussian(0, config.cooldownBaseMutationStdDev),
    config.cooldownBaseClampMin,
    config.cooldownBaseClampMax,
  );
  return child;
}

export function activeUnits(genome: SpawnerGenome) {
  return genome.units.filter((unit) => unit.enabled);
}

export function activeConnections(genome: SpawnerGenome) {
  const enabledUnitIds = new Set(activeUnits(genome).map((unit) => unit.unitId));
  return genome.connections.filter(
    (connection) =>
      connection.enabled &&
      sourceIsActive(connection.source, enabledUnitIds) &&
      targetIsActive(connection.target, enabledUnitIds),
  );
}

export function activeLayerIndexes(genome: SpawnerGenome) {
  return [...new Set(activeUnits(genome).map((unit) => unit.layerIndex))].sort((left, right) => left - right);
}

export function architectureMetrics(genome: SpawnerGenome) {
  const enabledConnections = activeConnections(genome);
  const recurrentConnections = enabledConnections.filter((connection) => connection.source.kind === "hidden" && connection.source.mode === "previous");
  const skipConnections = enabledConnections.filter((connection) => {
    if (connection.source.kind !== "hidden" || connection.source.mode !== "current" || connection.target.kind !== "hidden") return false;
    const sourceRef = connection.source;
    const targetRef = connection.target;
    const source = genome.units.find((unit) => unit.unitId === sourceRef.unitId);
    const target = genome.units.find((unit) => unit.unitId === targetRef.unitId);
    return !!source && !!target && target.layerIndex - source.layerIndex > 1;
  });
  return {
    activeUnits: activeUnits(genome).length,
    activeLayers: activeLayerIndexes(genome).length,
    activeConnections: enabledConnections.length,
    disabledUnits: genome.units.filter((unit) => !unit.enabled).length,
    disabledConnections: genome.connections.filter((connection) => !connection.enabled).length,
    recurrentConnections: recurrentConnections.length,
    skipConnections: skipConnections.length,
    outputConnections: enabledConnections.filter((connection) => connection.target.kind === "output").length,
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

export function addRandomLegalConnection(genome: SpawnerGenome, rng: SeededRng, config: SpawnerConfig, innovations: InnovationRegistry) {
  const candidates = legalConnectionCandidates(genome, config).filter(
    (candidate) => !genome.connections.some((connection) => connectionKey(connection) === connectionKey(candidate)),
  );
  const candidate = choose(candidates, rng);
  if (!candidate) return false;
  addConnectionIfMissing(genome, candidate.source, candidate.target, rng.gaussian(0, config.newConnectionWeightStdDev), innovations);
  return true;
}

export function validateGenome(genome: SpawnerGenome, config: SpawnerConfig, { allowBiasOnlyBrains = false } = {}) {
  const errors: string[] = [];
  const enabledKeys = new Set<string>();
  if (genome.outputBias.length !== OUTPUT_COUNT) errors.push(`Expected ${OUTPUT_COUNT} output biases; found ${genome.outputBias.length}.`);
  if (!allowBiasOnlyBrains && activeUnits(genome).length === 0) errors.push("Genome has no active hidden units.");

  for (const unit of genome.units) {
    if (!Number.isFinite(unit.updateBias)) errors.push(`Unit ${unit.unitId} update bias is not finite.`);
    if (!Number.isFinite(unit.resetBias)) errors.push(`Unit ${unit.unitId} reset bias is not finite.`);
    if (!Number.isFinite(unit.candidateBias)) errors.push(`Unit ${unit.unitId} candidate bias is not finite.`);
    if (unit.layerIndex < 1) errors.push(`Unit ${unit.unitId} has invalid layer ${unit.layerIndex}.`);
  }
  for (const [index, bias] of genome.outputBias.entries()) {
    if (!Number.isFinite(bias)) errors.push(`Output bias ${index} is not finite.`);
  }
  for (const connection of genome.connections) {
    if (!Number.isFinite(connection.weight)) errors.push(`Connection ${connection.innovationId} weight is not finite.`);
    if (connection.enabled) {
      const key = connectionKey(connection);
      if (enabledKeys.has(key)) errors.push(`Duplicate enabled connection ${key}.`);
      enabledKeys.add(key);
      if (!isLegalConnection(genome, connection.source, connection.target, config)) {
        errors.push(`Illegal enabled connection ${key}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function mutateNumericGenes(genome: SpawnerGenome, rng: SeededRng, config: SpawnerConfig) {
  for (const connection of genome.connections) {
    if (rng.next() > config.weightMutationRate) continue;
    connection.weight =
      rng.next() < config.weightReplaceRate
        ? rng.gaussian(0, config.newConnectionWeightStdDev)
        : connection.weight + rng.gaussian(0, config.weightMutationStdDev);
  }
  for (const unit of genome.units) {
    if (rng.next() < config.biasMutationRate) unit.updateBias += rng.gaussian(0, config.biasMutationStdDev);
    if (rng.next() < config.biasMutationRate) unit.resetBias += rng.gaussian(0, config.biasMutationStdDev);
    if (rng.next() < config.biasMutationRate) unit.candidateBias += rng.gaussian(0, config.biasMutationStdDev);
  }
  genome.outputBias = genome.outputBias.map((bias) => (rng.next() < config.biasMutationRate ? bias + rng.gaussian(0, config.biasMutationStdDev) : bias));
}

function addRandomUnit(genome: SpawnerGenome, rng: SeededRng, config: SpawnerConfig, innovations: InnovationRegistry) {
  const layers = activeLayerIndexes(genome);
  const maxLayer = layers.at(-1) ?? 0;
  const existingChance = config.newUnitExistingLayerChance;
  const newChance = config.newUnitNewLayerChance;
  const useNewLayer = layers.length === 0 || rng.next() >= existingChance / Math.max(0.0001, existingChance + newChance);
  const layerIndex = layers.length === 0 ? 1 : useNewLayer ? maxLayer + 1 : choose(layers, rng) ?? 1;
  const unit = createUnitGene(genome.nextUnitId, allocateInnovationId(innovations), layerIndex, rng, config);
  genome.nextUnitId += 1;
  genome.units.push(unit);

  const attempts = Math.max(0, Math.round(config.newUnitInitialConnections));
  for (let index = 0; index < attempts; index += 1) {
    addRandomConnectionTouchingUnit(genome, unit, rng, config, innovations);
  }
}

function setRandomUnitEnabled(genome: SpawnerGenome, rng: SeededRng, enabled: boolean) {
  const activeCount = activeUnits(genome).length;
  const candidates = genome.units.filter((unit) => unit.enabled !== enabled && (enabled || activeCount > 1 || !unit.enabled));
  const unit = choose(candidates, rng);
  if (!unit) return false;
  unit.enabled = enabled;
  return true;
}

function setRandomConnectionEnabled(genome: SpawnerGenome, rng: SeededRng, enabled: boolean, config?: SpawnerConfig) {
  const candidates = genome.connections.filter(
    (connection) => connection.enabled !== enabled && (!enabled || !config || isLegalConnection(genome, connection.source, connection.target, config)),
  );
  const connection = choose(candidates, rng);
  if (!connection) return false;
  connection.enabled = enabled;
  return true;
}

function legalConnectionCandidates(genome: SpawnerGenome, config: SpawnerConfig) {
  const candidates: Array<{ source: ConnectionSource; target: ConnectionTarget }> = [];
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

function legalConnectionCandidatesTouchingUnit(genome: SpawnerGenome, unit: HiddenUnitGene, config: SpawnerConfig) {
  return legalConnectionCandidates(genome, config).filter((candidate) => {
    const sourceTouches = candidate.source.kind === "hidden" && candidate.source.unitId === unit.unitId;
    const targetTouches = candidate.target.kind === "hidden" && candidate.target.unitId === unit.unitId;
    return sourceTouches || targetTouches;
  });
}

function addRandomConnectionTouchingUnit(
  genome: SpawnerGenome,
  unit: HiddenUnitGene,
  rng: SeededRng,
  config: SpawnerConfig,
  innovations: InnovationRegistry,
) {
  const candidates = legalConnectionCandidatesTouchingUnit(genome, unit, config).filter(
    (candidate) => !genome.connections.some((connection) => connectionKey(connection) === connectionKey(candidate)),
  );
  const candidate = choose(candidates, rng);
  if (!candidate) return false;
  return addConnectionIfMissing(genome, candidate.source, candidate.target, rng.gaussian(0, config.newConnectionWeightStdDev), innovations);
}

function addConnectionIfMissing(
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

function createUnitGene(unitId: number, innovationId: number, layerIndex: number, rng: SeededRng, config: SpawnerConfig): HiddenUnitGene {
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

function cloneGenome(genome: SpawnerGenome): SpawnerGenome {
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

function findEnabledUnit(genome: SpawnerGenome, unitId: number) {
  return genome.units.find((unit) => unit.unitId === unitId && unit.enabled);
}

function nextLayerAfter(genome: SpawnerGenome, layerIndex: number) {
  return activeLayerIndexes(genome).find((candidate) => candidate > layerIndex);
}

function sourceIsActive(source: ConnectionSource, enabledUnitIds: Set<number>) {
  return source.kind === "input" || enabledUnitIds.has(source.unitId);
}

function targetIsActive(target: ConnectionTarget, enabledUnitIds: Set<number>) {
  return target.kind === "output" || enabledUnitIds.has(target.unitId);
}

function sourceKey(source: ConnectionSource) {
  return source.kind === "input" ? `i:${source.index}` : `h:${source.mode}:${source.unitId}`;
}

function targetKey(target: ConnectionTarget) {
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

function allocateInnovationId(innovations: InnovationRegistry) {
  const id = innovations.nextInnovationId;
  innovations.nextInnovationId += 1;
  return id;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomRange(rng: SeededRng, min: number, max: number) {
  return min + rng.next() * Math.max(0, max - min);
}

function randomInt(rng: SeededRng, min: number, max: number) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(rng.next() * (high - low + 1));
}

function vector(rng: SeededRng, count: number, scale: number) {
  return Array.from({ length: count }, () => rng.gaussian(0, scale));
}

function choose<T>(items: T[], rng: SeededRng) {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng.next() * items.length)];
}

function randomGate(rng: SeededRng) {
  return GATES[Math.floor(rng.next() * GATES.length)] ?? "candidate";
}

function addFounderConnections(targetCount: number, add: () => boolean) {
  let added = 0;
  let attempts = 0;
  const desired = Math.max(0, targetCount);
  while (added < desired && attempts < Math.max(8, desired * 12)) {
    if (add()) added += 1;
    attempts += 1;
  }
}
