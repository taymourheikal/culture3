import type { ConnectionGene, GateType, HiddenUnitGene, SpawnerGenome } from "./types";
import { cloneGenome } from "./genomeCommon";
import { connectionDeltaKey, gateBiasDeltaKey, outputBiasDeltaKey, sanitizeLearnedState, type SpawnerLearnedState } from "./plasticity";
import { OUTPUT_COUNT } from "./config";
import { connectionTopologySignature, unitTopologySignature, type CompiledBrainPlan } from "./brainPlan";

export type EffectiveGenomeView = {
  genome: SpawnerGenome;
  getConnectionWeight: (connection: ConnectionGene) => number;
  getOutputBias: (outputIndex: number) => number;
  getGateBias: (unit: HiddenUnitGene, gate: GateType) => number;
};

export type EffectiveBrainValues = EffectiveGenomeView;

export type PlanAlignedEffectiveBrainValues = EffectiveGenomeView & {
  kind: "plan-aligned";
  planSignature: string;
  connectionWeightsByPlanIndex: number[];
  outputBiases: number[];
  updateGateBiasesByUnitIndex: number[];
  resetGateBiasesByUnitIndex: number[];
  candidateGateBiasesByUnitIndex: number[];
};

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
  const normalizedLearned = normalizeLearnedState(genome, learnedState, options);
  const connectionWeightById = Object.create(null) as Record<string, number>;
  for (const connection of genome.connections) connectionWeightById[String(connection.innovationId)] = connection.weight;
  const unitById = new Map(genome.units.map((unit) => [unit.unitId, unit]));
  return {
    genome,
    getConnectionWeight: (connection) =>
      effectiveConnectionWeight(connectionWeightById[String(connection.innovationId)] ?? connection.weight, connection.innovationId, normalizedLearned),
    getOutputBias: (outputIndex) => effectiveOutputBias(genome.outputBias[outputIndex] ?? 0, outputIndex, normalizedLearned),
    getGateBias: (unit, gate) => {
      const currentUnit = unitById.get(unit.unitId) ?? unit;
      return effectiveGateBias(currentUnit, gate, normalizedLearned);
    },
  };
}

export function createPlanAlignedEffectiveBrainValues(
  genome: SpawnerGenome,
  learnedState: Partial<SpawnerLearnedState> | undefined,
  plan: CompiledBrainPlan,
  options: { assumeNormalizedLearnedState?: boolean; verifyTopology?: boolean } = {},
): PlanAlignedEffectiveBrainValues {
  if (options.verifyTopology) assertPlanMatchesGenomeTopology(genome, plan);
  const normalizedLearned = normalizeLearnedState(genome, learnedState, options);
  const connectionWeightsByPlanIndex = new Array(plan.activeConnectionCount).fill(0);
  for (const connection of genome.connections) {
    if (!connection.enabled) continue;
    const connectionIndex = plan.connectionIndexByInnovationId.get(connection.innovationId);
    if (connectionIndex !== undefined) {
      connectionWeightsByPlanIndex[connectionIndex] = effectiveConnectionWeight(connection.weight, connection.innovationId, normalizedLearned);
    }
  }

  const outputBiases = Array.from({ length: OUTPUT_COUNT }, (_, outputIndex) =>
    effectiveOutputBias(genome.outputBias[outputIndex] ?? 0, outputIndex, normalizedLearned),
  );
  const updateGateBiasesByUnitIndex = new Array(plan.activeUnitCount).fill(0);
  const resetGateBiasesByUnitIndex = new Array(plan.activeUnitCount).fill(0);
  const candidateGateBiasesByUnitIndex = new Array(plan.activeUnitCount).fill(0);
  for (const unit of genome.units) {
    if (!unit.enabled) continue;
    const unitIndex = plan.unitIndexById.get(unit.unitId);
    if (unitIndex === undefined) continue;
    updateGateBiasesByUnitIndex[unitIndex] = effectiveGateBias(unit, "update", normalizedLearned);
    resetGateBiasesByUnitIndex[unitIndex] = effectiveGateBias(unit, "reset", normalizedLearned);
    candidateGateBiasesByUnitIndex[unitIndex] = effectiveGateBias(unit, "candidate", normalizedLearned);
  }

  return {
    kind: "plan-aligned",
    genome,
    planSignature: plan.signature,
    connectionWeightsByPlanIndex,
    outputBiases,
    updateGateBiasesByUnitIndex,
    resetGateBiasesByUnitIndex,
    candidateGateBiasesByUnitIndex,
    getConnectionWeight: (connection) => {
      const connectionIndex = plan.connectionIndexByInnovationId.get(connection.innovationId);
      return connectionIndex === undefined
        ? effectiveConnectionWeight(connection.weight, connection.innovationId, normalizedLearned)
        : connectionWeightsByPlanIndex[connectionIndex] ?? 0;
    },
    getOutputBias: (outputIndex) => outputBiases[outputIndex] ?? 0,
    getGateBias: (unit, gate) => {
      const unitIndex = plan.unitIndexById.get(unit.unitId);
      if (unitIndex === undefined) return effectiveGateBias(unit, gate, normalizedLearned);
      return gate === "update"
        ? updateGateBiasesByUnitIndex[unitIndex] ?? 0
        : gate === "reset"
          ? resetGateBiasesByUnitIndex[unitIndex] ?? 0
          : candidateGateBiasesByUnitIndex[unitIndex] ?? 0;
    },
  };
}

export function isPlanAlignedEffectiveBrainValues(values: EffectiveBrainValues): values is PlanAlignedEffectiveBrainValues {
  return (values as PlanAlignedEffectiveBrainValues).kind === "plan-aligned";
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

function normalizeLearnedState(
  genome: SpawnerGenome,
  learnedState: Partial<SpawnerLearnedState> | undefined,
  options: { assumeNormalizedLearnedState?: boolean },
) {
  return options.assumeNormalizedLearnedState
    ? learnedState
    : learnedState
      ? sanitizeLearnedState(learnedState, genome.plasticityProfile?.maxLearnedDelta)
      : undefined;
}

function effectiveConnectionWeight(baseWeight: number, innovationId: number, learnedState: Partial<SpawnerLearnedState> | undefined) {
  return baseWeight + (learnedState?.connectionDeltas?.[connectionDeltaKey(innovationId)] ?? 0);
}

function effectiveOutputBias(baseBias: number, outputIndex: number, learnedState: Partial<SpawnerLearnedState> | undefined) {
  return baseBias + (learnedState?.outputBiasDeltas?.[outputBiasDeltaKey(outputIndex)] ?? 0);
}

function effectiveGateBias(unit: HiddenUnitGene, gate: GateType, learnedState: Partial<SpawnerLearnedState> | undefined) {
  return baseGateBias(unit, gate) + (learnedState?.gateBiasDeltas?.[gateBiasDeltaKey(unit.unitId, gate)] ?? 0);
}

function assertPlanMatchesGenomeTopology(genome: SpawnerGenome, plan: CompiledBrainPlan) {
  let activeUnitCount = 0;
  for (const unit of genome.units) {
    if (!unit.enabled) continue;
    activeUnitCount += 1;
    if (plan.unitTopologyById.get(unit.unitId) !== unitTopologySignature(unit)) {
      throw new Error("Compiled brain plan does not match genome unit topology");
    }
  }
  if (activeUnitCount !== plan.activeUnitCount) throw new Error("Compiled brain plan unit count does not match genome topology");

  let activeConnectionCount = 0;
  for (const connection of genome.connections) {
    if (!connection.enabled) continue;
    activeConnectionCount += 1;
    if (plan.connectionTopologyByInnovationId.get(connection.innovationId) !== connectionTopologySignature(connection)) {
      throw new Error("Compiled brain plan does not match genome connection topology");
    }
  }
  if (activeConnectionCount !== plan.activeConnectionCount) throw new Error("Compiled brain plan connection count does not match genome topology");
}
