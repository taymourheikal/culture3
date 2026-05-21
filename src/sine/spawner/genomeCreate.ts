import { INPUT_COUNT, OUTPUT_COUNT } from "./config";
import { addFounderConnections, allocateInnovationId, choose, createUnitGene, randomGate, randomInt, randomRange, vector } from "./genomeCommon";
import { addConnectionIfMissing } from "./genomeConnections";
import type { InnovationRegistry, SpawnerConfig, SpawnerGenome } from "./types";
import type { SeededRng } from "./rng";

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
