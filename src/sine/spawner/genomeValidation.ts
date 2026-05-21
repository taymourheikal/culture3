import { OUTPUT_COUNT } from "./config";
import { activeUnits } from "./genomeCommon";
import { connectionKey, isLegalConnection } from "./genomeConnections";
import type { SpawnerConfig, SpawnerGenome } from "./types";

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
