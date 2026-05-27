import type { ConnectionGene, GateType, HiddenUnitGene, SpawnerGenome } from "./types";
import { cloneGenome } from "./genomeCommon";
import { connectionDeltaKey, gateBiasDeltaKey, outputBiasDeltaKey, sanitizeLearnedState, type SpawnerLearnedState } from "./plasticity";

export type EffectiveGenomeView = {
  genome: SpawnerGenome;
  getConnectionWeight: (connection: ConnectionGene) => number;
  getOutputBias: (outputIndex: number) => number;
  getGateBias: (unit: HiddenUnitGene, gate: GateType) => number;
};

export type EffectiveBrainValues = EffectiveGenomeView;

export type EffectiveValueDetail = {
  base: number;
  learnedDelta: number;
  effective: number;
};

export function getEffectiveConnectionWeight(connection: ConnectionGene) {
  return connection.weight;
}

export function getEffectiveOutputBias(genome: SpawnerGenome, outputIndex: number) {
  return genome.outputBias[outputIndex] ?? 0;
}

export function getEffectiveGateBias(unit: HiddenUnitGene, gate: GateType) {
  return baseGateBias(unit, gate);
}

export function createEffectiveGenomeView(genome: SpawnerGenome, learnedState?: Partial<SpawnerLearnedState>): EffectiveGenomeView {
  return createEffectiveBrainValues(genome, learnedState);
}

export function createEffectiveBrainValues(
  genome: SpawnerGenome,
  learnedState?: Partial<SpawnerLearnedState>,
  options: { assumeNormalizedLearnedState?: boolean } = {},
): EffectiveBrainValues {
  const normalizedLearned = options.assumeNormalizedLearnedState
    ? learnedState
    : learnedState
      ? sanitizeLearnedState(learnedState, genome.plasticityProfile?.maxLearnedDelta)
      : undefined;
  const connectionWeightById = Object.create(null) as Record<string, number>;
  for (const connection of genome.connections) connectionWeightById[String(connection.innovationId)] = connection.weight;
  const unitById = new Map(genome.units.map((unit) => [unit.unitId, unit]));
  return {
    genome,
    getConnectionWeight: (connection) =>
      (connectionWeightById[String(connection.innovationId)] ?? connection.weight) +
      (normalizedLearned?.connectionDeltas?.[connectionDeltaKey(connection.innovationId)] ?? 0),
    getOutputBias: (outputIndex) => (genome.outputBias[outputIndex] ?? 0) + (normalizedLearned?.outputBiasDeltas?.[outputBiasDeltaKey(outputIndex)] ?? 0),
    getGateBias: (unit, gate) => {
      const currentUnit = unitById.get(unit.unitId) ?? unit;
      return baseGateBias(currentUnit, gate) + (normalizedLearned?.gateBiasDeltas?.[gateBiasDeltaKey(unit.unitId, gate)] ?? 0);
    },
  };
}

export function materializeEffectiveGenomeForInheritance(
  genome: SpawnerGenome,
  learnedState?: Partial<SpawnerLearnedState>,
): SpawnerGenome {
  const view = createEffectiveGenomeView(genome, learnedState);
  const materialized = cloneGenome(genome);

  for (const connection of materialized.connections) {
    connection.weight = view.getConnectionWeight(connection);
  }
  materialized.outputBias = materialized.outputBias.map((_, index) => view.getOutputBias(index));
  for (const unit of materialized.units) {
    unit.updateBias = view.getGateBias(unit, "update");
    unit.resetBias = view.getGateBias(unit, "reset");
    unit.candidateBias = view.getGateBias(unit, "candidate");
  }

  return materialized;
}

export function getEffectiveConnectionDetail(
  connection: ConnectionGene,
  learnedState?: Partial<SpawnerLearnedState>,
  maxLearnedDelta?: number,
): EffectiveValueDetail {
  const base = connection.weight;
  const learned = learnedState ? sanitizeLearnedState(learnedState, maxLearnedDelta) : undefined;
  const learnedDelta = learned?.connectionDeltas[connectionDeltaKey(connection.innovationId)] ?? 0;
  return { base, learnedDelta, effective: base + learnedDelta };
}

export function getEffectiveOutputBiasDetail(
  genome: SpawnerGenome,
  outputIndex: number,
  learnedState?: Partial<SpawnerLearnedState>,
): EffectiveValueDetail {
  const base = genome.outputBias[outputIndex] ?? 0;
  const learned = learnedState ? sanitizeLearnedState(learnedState, genome.plasticityProfile?.maxLearnedDelta) : undefined;
  const learnedDelta = learned?.outputBiasDeltas[outputBiasDeltaKey(outputIndex)] ?? 0;
  return { base, learnedDelta, effective: base + learnedDelta };
}

export function getEffectiveGateBiasDetail(
  genome: SpawnerGenome,
  unit: HiddenUnitGene,
  gate: GateType,
  learnedState?: Partial<SpawnerLearnedState>,
): EffectiveValueDetail {
  const base = baseGateBias(unit, gate);
  const learned = learnedState ? sanitizeLearnedState(learnedState, genome.plasticityProfile?.maxLearnedDelta) : undefined;
  const learnedDelta = learned?.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, gate)] ?? 0;
  return { base, learnedDelta, effective: base + learnedDelta };
}

function baseGateBias(unit: HiddenUnitGene, gate: GateType) {
  return gate === "update" ? unit.updateBias : gate === "reset" ? unit.resetBias : unit.candidateBias;
}
