import { clamp } from "./math";
import { activeUnits, activeLayerIndexes, allocateInnovationId, choose, cloneGenome, createUnitGene } from "./genomeCommon";
import {
  addRandomConnectionTouchingUnit,
  addRandomLegalConnection,
  addRandomLegalConnectionMatching,
  isLegalConnection,
  type LegalConnectionCandidate,
} from "./genomeConnections";
import { driftMutationProfile, sanitizeMutationProfile } from "./mutationProfile";
import { mutatePayoffProfile } from "./payoffProfile";
import { mutatePerception } from "./perception";
import { driftPlasticityProfile } from "./plasticity";
import { mutateTradingPolicy } from "./tradingPolicy";
import type { HiddenUnitGene, InnovationRegistry, SpawnerConfig, SpawnerGenome, SpawnerMutationProfile } from "./types";
import type { SeededRng } from "./rng";

export function mutateGenome(genome: SpawnerGenome, rng: SeededRng, config: SpawnerConfig, innovations: InnovationRegistry): SpawnerGenome {
  const child = cloneGenome(genome);
  const profile = sanitizeMutationProfile(child.mutationProfile);
  mutateNumericGenes(child, rng, profile);
  if (rng.next() < profile.addUnitRate) addRandomUnit(child, rng, config, innovations, profile);
  if (rng.next() < profile.disableUnitRate) setRandomUnitEnabled(child, rng, false);
  if (rng.next() < profile.reenableUnitRate) setRandomUnitEnabled(child, rng, true);
  if (rng.next() < profile.addConnectionRate) {
    addRandomLegalConnection(child, rng, config, innovations, profile.newConnectionWeightStdDev);
  }
  if (rng.next() < profile.disableConnectionRate) setRandomConnectionEnabled(child, rng, false);
  if (rng.next() < profile.reenableConnectionRate) setRandomConnectionEnabled(child, rng, true, config);

  child.thresholdBias = clamp(
    child.thresholdBias + rng.gaussian(0, profile.thresholdBiasMutationStdDev),
    config.thresholdBiasMin,
    config.thresholdBiasMax,
  );
  const minHorizon = clamp(
    child.minHorizonTicks + rng.gaussian(0, profile.minHorizonTicksMutationStdDev),
    config.minHorizonTicksClampMin,
    config.minHorizonTicksClampMax,
  );
  child.minHorizonTicks = minHorizon;
  child.maxHorizonTicks = clamp(
    Math.max(minHorizon + 1, child.maxHorizonTicks + rng.gaussian(0, profile.maxHorizonTicksMutationStdDev)),
    config.maxHorizonTicksClampMin,
    config.maxHorizonTicksClampMax,
  );
  child.cooldownBaseTicks = clamp(
    child.cooldownBaseTicks + rng.gaussian(0, profile.cooldownBaseTicksMutationStdDev),
    config.cooldownBaseTicksClampMin,
    config.cooldownBaseTicksClampMax,
  );
  child.perception = mutatePerception(child.perception, rng, {
    rate: profile.perceptionMutationRate,
    lagStdDev: profile.perceptionLagMutationStdDev,
    windowStdDev: profile.perceptionWindowMutationStdDev,
    sensitivityStdDev: profile.perceptionSensitivityMutationStdDev,
    densityScaleStdDev: profile.perceptionDensityScaleMutationStdDev,
  });
  child.payoffProfile = mutatePayoffProfile(child.payoffProfile, rng, {
    rate: profile.payoffScaleMutationRate,
    windowStdDev: profile.payoffScaleWindowMutationStdDev,
    sampleStepStdDev: profile.payoffScaleSampleStepMutationStdDev,
  });
  child.tradingPolicy = mutateTradingPolicy(child.tradingPolicy, rng, {
    rate: profile.tradingPolicyMutationRate,
    spawnThresholdStdDev: profile.spawnThresholdMutationStdDev,
    minSignalStrengthStdDev: profile.minSignalStrengthMutationStdDev,
  });
  child.mutationProfile = driftMutationProfile(profile, rng);
  child.plasticityProfile = driftPlasticityProfile(child.plasticityProfile, rng);
  return child;
}

function mutateNumericGenes(genome: SpawnerGenome, rng: SeededRng, profile: SpawnerMutationProfile) {
  for (const connection of genome.connections) {
    if (rng.next() > profile.weightMutationRate) continue;
    connection.weight =
      rng.next() < profile.weightReplaceRate
        ? rng.gaussian(0, profile.newConnectionWeightStdDev)
        : connection.weight + rng.gaussian(0, profile.weightMutationStdDev);
  }
  for (const unit of genome.units) {
    if (rng.next() < profile.gateBiasMutationRate) unit.updateBias += rng.gaussian(0, profile.gateBiasMutationStdDev);
    if (rng.next() < profile.gateBiasMutationRate) unit.resetBias += rng.gaussian(0, profile.gateBiasMutationStdDev);
    if (rng.next() < profile.gateBiasMutationRate) unit.candidateBias += rng.gaussian(0, profile.gateBiasMutationStdDev);
  }
  genome.outputBias = genome.outputBias.map((bias) =>
    rng.next() < profile.outputBiasMutationRate ? bias + rng.gaussian(0, profile.outputBiasMutationStdDev) : bias,
  );
}

function addRandomUnit(
  genome: SpawnerGenome,
  rng: SeededRng,
  config: SpawnerConfig,
  innovations: InnovationRegistry,
  profile: SpawnerMutationProfile,
) {
  const layers = activeLayerIndexes(genome);
  const maxLayer = layers.at(-1) ?? 0;
  const existingChance = config.newUnitExistingLayerChance;
  const newChance = config.newUnitNewLayerChance;
  const useNewLayer = layers.length === 0 || rng.next() >= existingChance / Math.max(0.0001, existingChance + newChance);
  const layerIndex = layers.length === 0 ? 1 : useNewLayer ? maxLayer + 1 : choose(layers, rng) ?? 1;
  const unit = createUnitGene(genome.nextUnitId, allocateInnovationId(innovations), layerIndex, rng, config);
  genome.nextUnitId += 1;
  genome.units.push(unit);

  const attempts = Math.max(2, Math.round(config.newUnitInitialConnections));
  const mandatoryConnections = [
    addRandomLegalConnectionMatching(
      genome,
      rng,
      config,
      innovations,
      (candidate) => isIncomingConnectionToUnit(genome, candidate, unit),
      profile.newConnectionWeightStdDev,
    ),
    addRandomLegalConnectionMatching(
      genome,
      rng,
      config,
      innovations,
      (candidate) => isOutgoingConnectionFromUnit(genome, candidate, unit),
      profile.newConnectionWeightStdDev,
    ),
  ].filter(Boolean).length;
  for (let index = mandatoryConnections; index < attempts; index += 1) {
    addRandomConnectionTouchingUnit(genome, unit, rng, config, innovations, profile.newConnectionWeightStdDev);
  }
}

function isIncomingConnectionToUnit(genome: SpawnerGenome, candidate: LegalConnectionCandidate, targetUnit: HiddenUnitGene) {
  if (candidate.target.kind !== "hidden" || candidate.target.unitId !== targetUnit.unitId) return false;
  if (candidate.source.kind === "input") return true;
  if (candidate.source.kind !== "hidden") return false;
  if (candidate.source.mode !== "current") return false;
  const sourceRef = candidate.source;
  const source = genome.units.find((unit) => unit.unitId === sourceRef.unitId);
  return !!source && source.layerIndex < targetUnit.layerIndex;
}

function isOutgoingConnectionFromUnit(genome: SpawnerGenome, candidate: LegalConnectionCandidate, sourceUnit: HiddenUnitGene) {
  if (candidate.source.kind !== "hidden" || candidate.source.unitId !== sourceUnit.unitId || candidate.source.mode !== "current") return false;
  if (candidate.target.kind === "output") return true;
  if (candidate.target.kind !== "hidden") return false;
  const targetRef = candidate.target;
  const target = genome.units.find((unit) => unit.unitId === targetRef.unitId);
  return !!target && sourceUnit.layerIndex < target.layerIndex;
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
