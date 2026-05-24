import { INPUT_COUNT, OUTPUT_COUNT, OUTPUT_LABELS } from "./config";
import { createGenomeIndex } from "./genomeIndex";
import type { SpawnerAgent } from "./types";
import {
  absMean,
  buildFeatureContext,
  feature,
  finite,
  mean,
  normalizedEntropy,
  positiveRatio,
  possibleRecurrentConnections,
  possibleSkipConnections,
  ratio,
  std,
  UNIQUENESS_GATES,
  UNIQUENESS_OUTPUT_LABELS,
  weight,
} from "./uniquenessVectorModel";

export const FUNCTIONAL_GENOME_VECTOR_VERSION = "functional-genome-v3";

export type UniquenessFeature = {
  key: string;
  label: string;
  value: number;
};

export function buildFunctionalGenomeVector(spawner: SpawnerAgent): UniquenessFeature[] {
  const genome = spawner.genome;
  const genomeIndex = createGenomeIndex(genome);
  const units = genomeIndex.units;
  const connections = genomeIndex.connections;
  const { layerIndexes, layerCounts, connectionGroups, recurrence, reachability } = buildFeatureContext(
    genome,
    units,
    connections,
    genomeIndex.unitById,
  );
  const gateCounts = UNIQUENESS_GATES.map((gate) => connections.filter((connection) => connection.target.kind === "hidden" && connection.target.gate === gate).length);
  const outputCounts = Array.from({ length: OUTPUT_COUNT }, (_, index) =>
    connections.filter((connection) => connection.target.kind === "output" && connection.target.index === index).length,
  );

  const features: UniquenessFeature[] = [
    feature("units.layer1", "Units in layer 1", units.filter((unit) => unit.layerIndex === 1).length),
    feature("units.layer2", "Units in layer 2", units.filter((unit) => unit.layerIndex === 2).length),
    feature("units.layer3Plus", "Units in layers 3+", units.filter((unit) => unit.layerIndex >= 3).length),
    feature("layers.active", "Active layers", layerIndexes.length),
    feature("layers.maxIndex", "Max layer index", Math.max(0, ...layerIndexes)),
    feature("layers.widthStd", "Layer width std", std(layerCounts)),

    feature("connections.inputToHidden", "Input to hidden links", connectionGroups.inputToHidden.length),
    feature("connections.recurrent", "Recurrent links", connectionGroups.recurrent.length),
    feature("connections.hiddenCurrentToHidden", "Current hidden to hidden links", connectionGroups.hiddenCurrentToHidden.length),
    feature("connections.hiddenToOutput", "Hidden to output links", connectionGroups.hiddenToOutput.length),
    feature("connections.inputToOutput", "Input to output links", connectionGroups.inputToOutput.length),
    feature("connections.skip", "Skip links", connectionGroups.skip.length),

    feature("density.inputToHidden", "Input to hidden density", ratio(connectionGroups.inputToHidden.length, INPUT_COUNT * units.length * UNIQUENESS_GATES.length)),
    feature("density.recurrent", "Recurrent density", ratio(connectionGroups.recurrent.length, possibleRecurrentConnections(units))),
    feature("density.hiddenToOutput", "Hidden to output density", ratio(connectionGroups.hiddenToOutput.length, units.length * OUTPUT_COUNT)),
    feature("density.skip", "Skip link density", ratio(connectionGroups.skip.length, possibleSkipConnections(units))),

    feature("recurrence.unitsWithInputRatio", "Units with recurrent input", recurrence.unitsWithRecurrentInputRatio),
    feature("recurrence.unitsWithSelfRatio", "Units with self recurrence", recurrence.unitsWithSelfRecurrenceRatio),
    feature("recurrence.meanInputsPerUnit", "Mean recurrent inputs per unit", recurrence.meanRecurrentInputsPerUnit),
    feature("recurrence.maxInputsPerUnit", "Max recurrent inputs per unit", recurrence.maxRecurrentInputsPerUnit),

    feature("gate.balanceEntropy", "Gate balance entropy", normalizedEntropy(gateCounts)),

    feature("bias.update.mean", "Update bias mean", mean(units.map((unit) => unit.updateBias))),
    feature("bias.update.std", "Update bias std", std(units.map((unit) => unit.updateBias))),
    feature("bias.reset.mean", "Reset bias mean", mean(units.map((unit) => unit.resetBias))),
    feature("bias.reset.std", "Reset bias std", std(units.map((unit) => unit.resetBias))),
    feature("bias.candidate.mean", "Candidate bias mean", mean(units.map((unit) => unit.candidateBias))),
    feature("bias.candidate.std", "Candidate bias std", std(units.map((unit) => unit.candidateBias))),
  ];

  for (let input = 0; input < INPUT_COUNT; input += 1) {
    const outgoing = connections.filter((connection) => connection.source.kind === "input" && connection.source.index === input);
    features.push(feature(`input.${input}.outgoingCount`, `Input ${input + 1} outgoing links`, outgoing.length));
    features.push(feature(`input.${input}.absWeightMean`, `Input ${input + 1} mean absolute weight`, absMean(outgoing.map((connection) => connection.weight))));
  }

  for (let output = 0; output < OUTPUT_COUNT; output += 1) {
    const incoming = connections.filter((connection) => connection.target.kind === "output" && connection.target.index === output);
    const label = UNIQUENESS_OUTPUT_LABELS[output] ?? `Output ${output + 1}`;
    features.push(feature(`output.${output}.incomingCount`, `${label} incoming links`, incoming.length));
    features.push(feature(`output.${output}.absWeightMean`, `${label} mean absolute weight`, absMean(incoming.map((connection) => connection.weight))));
  }

  features.push(
    feature("output.connectionEntropy", "Output connection entropy", normalizedEntropy(outputCounts)),
    ...OUTPUT_LABELS.map((label, index) => feature(`output.${label.toLowerCase()}.bias`, `${label} output bias`, genome.outputBias[index] ?? 0)),
    feature("control.thresholdBias", "Threshold bias", genome.thresholdBias),
    feature("control.minHorizonTicks", "Minimum horizon ticks", genome.minHorizonTicks),
    feature("control.maxHorizonTicks", "Maximum horizon ticks", genome.maxHorizonTicks),
    feature("control.cooldownBaseTicks", "Cooldown base ticks", genome.cooldownBaseTicks),
    ...genome.perception.deltaLagPairs.flatMap((pair, index) => [
      feature(`perception.delta${index + 1}.fromTicks`, `Perception delta ${index + 1} from ticks`, pair.fromTicks),
      feature(`perception.delta${index + 1}.toTicks`, `Perception delta ${index + 1} to ticks`, pair.toTicks),
    ]),
    feature("perception.rollingWindowTicks", "Perception rolling window ticks", genome.perception.rollingWindowTicks),
    feature("perception.localScaleWindowTicks", "Perception local scale window ticks", genome.perception.localScaleWindowTicks),
    feature("perception.localScaleSampleStepTicks", "Perception local scale sample step", genome.perception.localScaleSampleStepTicks),
    feature("perception.trendWindowTicks", "Perception trend window ticks", genome.perception.trendWindowTicks),
    feature("perception.cycleWindowTicks", "Perception cycle window ticks", genome.perception.cycleWindowTicks),
    feature("perception.roughnessSensitivity", "Perception roughness sensitivity", genome.perception.roughnessSensitivity),
    feature("perception.pendingDensityScale", "Perception pending-density scale", genome.perception.pendingDensityScale),
    feature("mutationProfile.addUnitRate", "Mutation add-unit rate", genome.mutationProfile.addUnitRate),
    feature("mutationProfile.addConnectionRate", "Mutation add-connection rate", genome.mutationProfile.addConnectionRate),
    feature("mutationProfile.disableConnectionRate", "Mutation disable-connection rate", genome.mutationProfile.disableConnectionRate),
    feature("mutationProfile.weightMutationRate", "Mutation weight rate", genome.mutationProfile.weightMutationRate),
    feature("mutationProfile.weightMutationStdDev", "Mutation weight stddev", genome.mutationProfile.weightMutationStdDev),
    feature("mutationProfile.gateBiasMutationStdDev", "Mutation gate-bias stddev", genome.mutationProfile.gateBiasMutationStdDev),
    feature("mutationProfile.perceptionMutationRate", "Mutation perception rate", genome.mutationProfile.perceptionMutationRate),
    feature("mutationProfile.mutationProfileMutationStdDev", "Mutation-profile drift stddev", genome.mutationProfile.mutationProfileMutationStdDev),

    feature("weights.inputToHidden.absMean", "Input-hidden absolute weight mean", absMean(connectionGroups.inputToHidden.map(weight))),
    feature("weights.recurrent.absMean", "Recurrent absolute weight mean", absMean(connectionGroups.recurrent.map(weight))),
    feature("weights.hiddenToOutput.absMean", "Hidden-output absolute weight mean", absMean(connectionGroups.hiddenToOutput.map(weight))),
    feature("weights.skip.absMean", "Skip absolute weight mean", absMean(connectionGroups.skip.map(weight))),
    feature("weights.inputToHidden.std", "Input-hidden weight std", std(connectionGroups.inputToHidden.map(weight))),
    feature("weights.recurrent.std", "Recurrent weight std", std(connectionGroups.recurrent.map(weight))),
    feature("weights.hiddenToOutput.std", "Hidden-output weight std", std(connectionGroups.hiddenToOutput.map(weight))),
    feature("weights.skip.std", "Skip weight std", std(connectionGroups.skip.map(weight))),
    feature("weights.positiveRatio", "Positive weight ratio", positiveRatio(connections.map(weight))),
    feature("weights.recurrentPositiveRatio", "Recurrent positive weight ratio", positiveRatio(connectionGroups.recurrent.map(weight))),
    feature("weights.hiddenToOutputPositiveRatio", "Hidden-output positive weight ratio", positiveRatio(connectionGroups.hiddenToOutput.map(weight))),

    feature("reach.inputReachableUnitRatio", "Input-reachable unit ratio", reachability.inputReachableUnitRatio),
    feature("reach.outputReachableUnitRatio", "Output-reachable unit ratio", reachability.outputReachableUnitRatio),
    feature("reach.deadUnitRatio", "Dead unit ratio", reachability.deadUnitRatio),
    feature("reach.averagePathLength", "Average input-output path length", reachability.averageInputToOutputPathLength),
    feature("reach.maxPathLength", "Max input-output path length", reachability.maxInputToOutputPathLength),

    feature("disabled.unitRatio", "Disabled unit ratio", ratio(genome.units.filter((unit) => !unit.enabled).length, genome.units.length)),
    feature("disabled.connectionRatio", "Disabled connection ratio", ratio(genome.connections.filter((connection) => !connection.enabled).length, genome.connections.length)),
  );

  return features.map((item) => ({ ...item, value: finite(item.value) }));
}
