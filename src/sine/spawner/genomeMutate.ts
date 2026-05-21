import { clamp } from "./math";
import { activeUnits, activeLayerIndexes, allocateInnovationId, choose, cloneGenome, createUnitGene } from "./genomeCommon";
import { addRandomConnectionTouchingUnit, addRandomLegalConnection, isLegalConnection } from "./genomeConnections";
import type { InnovationRegistry, SpawnerConfig, SpawnerGenome } from "./types";
import type { SeededRng } from "./rng";

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
