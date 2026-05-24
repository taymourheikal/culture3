import { OUTPUT_COUNT } from "./config";
import { activeUnits } from "./genomeCommon";
import { connectionKey, isLegalConnection } from "./genomeConnections";
import { PERCEPTION_MAX_TICKS } from "./perception";
import type { SpawnerConfig, SpawnerGenome } from "./types";

const MUTATION_PROFILE_KEYS = [
  "addUnitRate",
  "disableUnitRate",
  "reenableUnitRate",
  "addConnectionRate",
  "disableConnectionRate",
  "reenableConnectionRate",
  "weightMutationRate",
  "weightMutationStdDev",
  "weightReplaceRate",
  "newConnectionWeightStdDev",
  "gateBiasMutationRate",
  "gateBiasMutationStdDev",
  "outputBiasMutationRate",
  "outputBiasMutationStdDev",
  "perceptionMutationRate",
  "perceptionLagMutationStdDev",
  "perceptionWindowMutationStdDev",
  "perceptionSensitivityMutationStdDev",
  "perceptionDensityScaleMutationStdDev",
  "thresholdBiasMutationStdDev",
  "minHorizonTicksMutationStdDev",
  "maxHorizonTicksMutationStdDev",
  "cooldownBaseTicksMutationStdDev",
  "mutationProfileMutationStdDev",
] as const;

export function validateGenome(genome: SpawnerGenome, config: SpawnerConfig, { allowBiasOnlyBrains = false } = {}) {
  const errors: string[] = [];
  const enabledKeys = new Set<string>();
  if (genome.outputBias.length !== OUTPUT_COUNT) errors.push(`Expected ${OUTPUT_COUNT} output biases; found ${genome.outputBias.length}.`);
  if (!allowBiasOnlyBrains && activeUnits(genome).length === 0) errors.push("Genome has no active hidden units.");
  validatePerception(genome, errors);
  validateMutationProfile(genome, errors);

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

function validatePerception(genome: SpawnerGenome, errors: string[]) {
  const perception = genome.perception;
  if (!perception || typeof perception !== "object") {
    errors.push("Genome is missing perception settings.");
    return;
  }
  if (!Array.isArray(perception.deltaLagPairs) || perception.deltaLagPairs.length !== 5) {
    errors.push(`Expected 5 perception lag pairs; found ${Array.isArray(perception.deltaLagPairs) ? perception.deltaLagPairs.length : 0}.`);
  }
  for (const [index, pair] of (Array.isArray(perception.deltaLagPairs) ? perception.deltaLagPairs : []).entries()) {
    validateTick(pair?.fromTicks, `Perception delta ${index + 1} fromTicks`, errors);
    validateTick(pair?.toTicks, `Perception delta ${index + 1} toTicks`, errors);
  }
  const tickValues = [
    ["rollingWindowTicks", perception.rollingWindowTicks],
    ["localScaleWindowTicks", perception.localScaleWindowTicks],
    ["localScaleSampleStepTicks", perception.localScaleSampleStepTicks],
    ["trendWindowTicks", perception.trendWindowTicks],
    ["cycleWindowTicks", perception.cycleWindowTicks],
  ] as const;
  for (const [label, value] of tickValues) {
    validateTick(value, `Perception ${label}`, errors);
  }
  if (!Number.isInteger(perception.localScaleSampleStepTicks) || perception.localScaleSampleStepTicks < 1) {
    errors.push("Perception local scale sample step must be an integer of at least 1.");
  }
  if (!Number.isFinite(perception.roughnessSensitivity) || perception.roughnessSensitivity < 0) {
    errors.push("Perception roughness sensitivity must be finite and non-negative.");
  }
  if (!Number.isInteger(perception.pendingDensityScale) || perception.pendingDensityScale < 1 || perception.pendingDensityScale > PERCEPTION_MAX_TICKS) {
    errors.push(`Perception pending-density scale must be an integer in 1-${PERCEPTION_MAX_TICKS}.`);
  }
}

function validateMutationProfile(genome: SpawnerGenome, errors: string[]) {
  const profile = genome.mutationProfile;
  if (!profile || typeof profile !== "object") {
    errors.push("Genome is missing mutation profile.");
    return;
  }
  for (const key of MUTATION_PROFILE_KEYS) {
    const value = profile[key];
    if (!Number.isFinite(value)) {
      errors.push(`Mutation profile ${key} is not finite.`);
      continue;
    }
    if (key.endsWith("Rate") && (value < 0 || value > 1)) errors.push(`Mutation profile ${key} must be in [0, 1].`);
    if (key.endsWith("StdDev") && value < 0) errors.push(`Mutation profile ${key} must be non-negative.`);
  }
}

function validateTick(value: number | undefined, label: string, errors: string[]) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > PERCEPTION_MAX_TICKS) {
    errors.push(`${label} must be an integer in 0-${PERCEPTION_MAX_TICKS}.`);
  }
}
