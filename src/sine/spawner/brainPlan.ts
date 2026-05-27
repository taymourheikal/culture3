import { OUTPUT_COUNT } from "./config";
import { createGenomeIndex, hiddenGateInputKey } from "./genomeIndex";
import type { ConnectionGene, HiddenUnitGene, SpawnerGenome } from "./types";

export type CompiledBrainUnit = {
  unit: HiddenUnitGene;
  unitIndex: number;
  updateInputs: ConnectionGene[];
  resetInputs: ConnectionGene[];
  candidateInputs: ConnectionGene[];
};

export type CompiledBrainLayer = {
  layerIndex: number;
  units: CompiledBrainUnit[];
};

export type CompiledBrainPlan = {
  signature: string;
  layers: CompiledBrainLayer[];
  outputInputs: ConnectionGene[][];
  unitIds: number[];
  unitIndexById: Map<number, number>;
  activeConnectionIds: number[];
  activeUnitCount: number;
  activeConnectionCount: number;
  activeLayerCount: number;
};

const planCache = new WeakMap<SpawnerGenome, { signature: string; plan: CompiledBrainPlan }>();

export function ensureCompiledBrainPlan(genome: SpawnerGenome) {
  // Recompute the structural signature before using the WeakMap entry because tests
  // and mutation tooling currently allow in-place topology changes.
  const signature = brainPlanSignature(genome);
  const cached = planCache.get(genome);
  if (cached?.signature === signature) return cached.plan;
  const plan = compileBrainPlan(genome, signature);
  planCache.set(genome, { signature, plan });
  return plan;
}

export function compileBrainPlan(genome: SpawnerGenome, signature = brainPlanSignature(genome)): CompiledBrainPlan {
  const index = createGenomeIndex(genome);
  const unitIds = index.units.map((unit) => unit.unitId);
  const unitIndexById = new Map(unitIds.map((unitId, unitIndex) => [unitId, unitIndex]));
  return {
    signature,
    layers: index.layerIndexes.map((layerIndex) => ({
      layerIndex,
      units: (index.unitsByLayer.get(layerIndex) ?? []).map((unit) => ({
        unit,
        unitIndex: unitIndexById.get(unit.unitId) ?? -1,
        updateInputs: index.hiddenGateInputs.get(hiddenGateInputKey(unit.unitId, "update")) ?? [],
        resetInputs: index.hiddenGateInputs.get(hiddenGateInputKey(unit.unitId, "reset")) ?? [],
        candidateInputs: index.hiddenGateInputs.get(hiddenGateInputKey(unit.unitId, "candidate")) ?? [],
      })),
    })),
    outputInputs: Array.from({ length: OUTPUT_COUNT }, (_, outputIndex) => index.outputInputs[outputIndex] ?? []),
    unitIds,
    unitIndexById,
    activeConnectionIds: index.connections.map((connection) => connection.innovationId),
    activeUnitCount: index.units.length,
    activeConnectionCount: index.connections.length,
    activeLayerCount: index.layerIndexes.length,
  };
}

export function brainPlanSignature(genome: SpawnerGenome) {
  const units = genome.units
    .map((unit) => `${unit.unitId},${unit.layerIndex},${unit.enabled ? 1 : 0}`)
    .join("|");
  const connections = genome.connections
    .map((connection) => `${connection.innovationId},${connection.enabled ? 1 : 0},${sourceSignature(connection)},${targetSignature(connection)}`)
    .join("|");
  return `${OUTPUT_COUNT};u:${units};c:${connections}`;
}

export function brainGenomeCacheSignature(genome: SpawnerGenome) {
  const connectionWeights = genome.connections.map((connection) => `${connection.innovationId}:${connection.weight}`).join("|");
  const outputBiases = genome.outputBias.map((bias, index) => `${index}:${bias ?? 0}`).join("|");
  const gateBiases = genome.units
    .map((unit) => `${unit.unitId}:${unit.updateBias},${unit.resetBias},${unit.candidateBias}`)
    .join("|");
  return [
    brainPlanSignature(genome),
    `cw:${connectionWeights}`,
    `ob:${outputBiases}`,
    `gb:${gateBiases}`,
    `maxDelta:${genome.plasticityProfile.maxLearnedDelta}`,
  ].join(";");
}

function sourceSignature(connection: ConnectionGene) {
  const source = connection.source;
  return source.kind === "input" ? `i:${source.index}` : `h:${source.unitId}:${source.mode}`;
}

function targetSignature(connection: ConnectionGene) {
  const target = connection.target;
  return target.kind === "output" ? `o:${target.index}` : `h:${target.unitId}:${target.gate}`;
}
