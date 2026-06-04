import { INPUT_COUNT, OUTPUT_COUNT, OUTPUT_LABELS } from "./config";
import { createEffectiveGenomeView, type EffectiveGenomeView } from "./effectiveGenome";
import { createGenomeIndex, type GenomeIndex } from "./genomeIndex";
import { sanitizePlasticityProfile } from "./plasticity";
import type { ConnectionGene, GateType, SpawnerAgent, SpawnerPlasticityProfile } from "./types";
import {
  absMean,
  buildFeatureContextFromIndex,
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
} from "./uniquenessVectorModel";

export const FUNCTIONAL_GENOME_VECTOR_VERSION = "functional-genome-v8";

export type UniquenessFeature = {
  key: string;
  label: string;
  value: number;
};

export function buildFunctionalGenomeVector(spawner: SpawnerAgent): UniquenessFeature[] {
  const summary = buildFunctionalGenomeSummary(spawner);
  const { genome, effectiveGenome, plasticity, genomeIndex, featureContext } = summary;
  const { units, connectionGroups } = genomeIndex;
  const { layerIndexes, layerCounts, recurrence, reachability } = featureContext;

  const features: UniquenessFeature[] = [
    feature("units.layer1", "Units in layer 1", summary.layer1UnitCount),
    feature("units.layer2", "Units in layer 2", summary.layer2UnitCount),
    feature("units.layer3Plus", "Units in layers 3+", summary.layer3PlusUnitCount),
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

    feature("gate.balanceEntropy", "Gate balance entropy", normalizedEntropy(summary.gateCounts)),

    feature("bias.update.mean", "Update bias mean", mean(summary.gateBiasValues.update)),
    feature("bias.update.std", "Update bias std", std(summary.gateBiasValues.update)),
    feature("bias.reset.mean", "Reset bias mean", mean(summary.gateBiasValues.reset)),
    feature("bias.reset.std", "Reset bias std", std(summary.gateBiasValues.reset)),
    feature("bias.candidate.mean", "Candidate bias mean", mean(summary.gateBiasValues.candidate)),
    feature("bias.candidate.std", "Candidate bias std", std(summary.gateBiasValues.candidate)),
  ];

  for (let input = 0; input < INPUT_COUNT; input += 1) {
    const outgoing = summary.inputOutgoing[input] ?? [];
    features.push(feature(`input.${input}.outgoingCount`, `Input ${input + 1} outgoing links`, outgoing.length));
    features.push(
      feature(`input.${input}.absWeightMean`, `Input ${input + 1} mean absolute weight`, absMean(summary.inputOutgoingWeights[input] ?? [])),
    );
  }

  for (let output = 0; output < OUTPUT_COUNT; output += 1) {
    const incoming = summary.outputIncoming[output] ?? [];
    const label = UNIQUENESS_OUTPUT_LABELS[output] ?? `Output ${output + 1}`;
    features.push(feature(`output.${output}.incomingCount`, `${label} incoming links`, incoming.length));
    features.push(feature(`output.${output}.absWeightMean`, `${label} mean absolute weight`, absMean(summary.outputIncomingWeights[output] ?? [])));
  }

  features.push(
    feature("output.connectionEntropy", "Output connection entropy", normalizedEntropy(summary.outputCounts)),
    ...OUTPUT_LABELS.map((label, index) => feature(`output.${label.toLowerCase()}.bias`, `${label} output bias`, effectiveGenome.getOutputBias(index))),
    feature("control.thresholdBias", "Threshold bias", genome.thresholdBias),
    feature("tradingPolicy.spawnThreshold", "Trading policy spawn threshold", genome.tradingPolicy.spawnThreshold),
    feature("tradingPolicy.minSignalStrength", "Trading policy min signal strength", genome.tradingPolicy.minSignalStrength),
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
    feature("perception.volumeScaleWindowTicks", "Perception volume scale window ticks", genome.perception.volumeScaleWindowTicks),
    feature("perception.volumeScaleSampleStepTicks", "Perception volume scale sample step", genome.perception.volumeScaleSampleStepTicks),
    feature("perception.volumeDeltaLagTicks", "Perception volume delta lag ticks", genome.perception.volumeDeltaLagTicks),
    feature("perception.volumeAccelerationLagTicks", "Perception volume acceleration lag ticks", genome.perception.volumeAccelerationLagTicks),
    feature("perception.rsiWindowTicks", "Perception RSI window ticks", genome.perception.rsiWindowTicks),
    feature("perception.volumePriceAgreementLagTicks", "Perception volume-price agreement lag ticks", genome.perception.volumePriceAgreementLagTicks),
    feature("perception.trendWindowTicks", "Perception trend window ticks", genome.perception.trendWindowTicks),
    feature("perception.cycleWindowTicks", "Perception cycle window ticks", genome.perception.cycleWindowTicks),
    feature("perception.roughnessSensitivity", "Perception roughness sensitivity", genome.perception.roughnessSensitivity),
    feature("perception.pendingDensityScale", "Perception pending-density scale", genome.perception.pendingDensityScale),
    feature("payoffProfile.scaleWindowTicks", "Payoff scale window ticks", genome.payoffProfile.scaleWindowTicks),
    feature("payoffProfile.scaleSampleStepTicks", "Payoff scale sample step", genome.payoffProfile.scaleSampleStepTicks),
    feature("mutationProfile.addUnitRate", "Mutation add-unit rate", genome.mutationProfile.addUnitRate),
    feature("mutationProfile.addConnectionRate", "Mutation add-connection rate", genome.mutationProfile.addConnectionRate),
    feature("mutationProfile.disableConnectionRate", "Mutation disable-connection rate", genome.mutationProfile.disableConnectionRate),
    feature("mutationProfile.weightMutationRate", "Mutation weight rate", genome.mutationProfile.weightMutationRate),
    feature("mutationProfile.weightMutationStdDev", "Mutation weight stddev", genome.mutationProfile.weightMutationStdDev),
    feature("mutationProfile.gateBiasMutationStdDev", "Mutation gate-bias stddev", genome.mutationProfile.gateBiasMutationStdDev),
    feature("mutationProfile.perceptionMutationRate", "Mutation perception rate", genome.mutationProfile.perceptionMutationRate),
    feature("mutationProfile.payoffScaleMutationRate", "Mutation payoff scale rate", genome.mutationProfile.payoffScaleMutationRate),
    feature("mutationProfile.payoffScaleWindowMutationStdDev", "Mutation payoff window stddev", genome.mutationProfile.payoffScaleWindowMutationStdDev),
    feature(
      "mutationProfile.payoffScaleSampleStepMutationStdDev",
      "Mutation payoff sample-step stddev",
      genome.mutationProfile.payoffScaleSampleStepMutationStdDev,
    ),
    feature("mutationProfile.tradingPolicyMutationRate", "Mutation trading policy rate", genome.mutationProfile.tradingPolicyMutationRate),
    feature("mutationProfile.spawnThresholdMutationStdDev", "Mutation spawn-threshold stddev", genome.mutationProfile.spawnThresholdMutationStdDev),
    feature(
      "mutationProfile.minSignalStrengthMutationStdDev",
      "Mutation min-strength stddev",
      genome.mutationProfile.minSignalStrengthMutationStdDev,
    ),
    feature("mutationProfile.mutationProfileMutationStdDev", "Mutation-profile drift stddev", genome.mutationProfile.mutationProfileMutationStdDev),
    feature("plasticity.weightLearningRate", "Plasticity weight learning rate", plasticity.weightLearningRate),
    feature("plasticity.biasLearningRate", "Plasticity bias learning rate", plasticity.biasLearningRate),
    feature("plasticity.positiveRewardMultiplier", "Plasticity positive reward multiplier", plasticity.positiveRewardMultiplier),
    feature("plasticity.negativeRewardMultiplier", "Plasticity negative reward multiplier", plasticity.negativeRewardMultiplier),
    feature("plasticity.reproductionRewardStrength", "Plasticity reproduction reward", plasticity.reproductionRewardStrength),
    feature("plasticity.experienceDecayRate", "Plasticity experience decay", plasticity.experienceDecayRate),
    feature("plasticity.maxLearnedDelta", "Plasticity max learned delta", plasticity.maxLearnedDelta),
    feature("plasticity.eligibilityTraceStrength", "Plasticity eligibility trace strength", plasticity.eligibilityTraceStrength),
    feature("plasticity.plasticityMutationStdDev", "Plasticity drift stddev", plasticity.plasticityMutationStdDev),

    feature("weights.inputToHidden.absMean", "Input-hidden absolute weight mean", absMean(summary.weights.inputToHidden)),
    feature("weights.recurrent.absMean", "Recurrent absolute weight mean", absMean(summary.weights.recurrent)),
    feature("weights.hiddenToOutput.absMean", "Hidden-output absolute weight mean", absMean(summary.weights.hiddenToOutput)),
    feature("weights.skip.absMean", "Skip absolute weight mean", absMean(summary.weights.skip)),
    feature("weights.inputToHidden.std", "Input-hidden weight std", std(summary.weights.inputToHidden)),
    feature("weights.recurrent.std", "Recurrent weight std", std(summary.weights.recurrent)),
    feature("weights.hiddenToOutput.std", "Hidden-output weight std", std(summary.weights.hiddenToOutput)),
    feature("weights.skip.std", "Skip weight std", std(summary.weights.skip)),
    feature("weights.positiveRatio", "Positive weight ratio", positiveRatio(summary.weights.all)),
    feature("weights.recurrentPositiveRatio", "Recurrent positive weight ratio", positiveRatio(summary.weights.recurrent)),
    feature(
      "weights.hiddenToOutputPositiveRatio",
      "Hidden-output positive weight ratio",
      positiveRatio(summary.weights.hiddenToOutput),
    ),

    feature("reach.inputReachableUnitRatio", "Input-reachable unit ratio", reachability.inputReachableUnitRatio),
    feature("reach.outputReachableUnitRatio", "Output-reachable unit ratio", reachability.outputReachableUnitRatio),
    feature("reach.deadUnitRatio", "Dead unit ratio", reachability.deadUnitRatio),
    feature("reach.averagePathLength", "Average input-output path length", reachability.averageInputToOutputPathLength),
    feature("reach.maxPathLength", "Max input-output path length", reachability.maxInputToOutputPathLength),

    feature("disabled.unitRatio", "Disabled unit ratio", ratio(genomeIndex.disabledUnits.length, genome.units.length)),
    feature("disabled.connectionRatio", "Disabled connection ratio", ratio(genomeIndex.disabledConnections.length, genome.connections.length)),
  );

  return features.map((item) => ({ ...item, value: finite(item.value) }));
}

type FunctionalGenomeSummary = {
  genome: SpawnerAgent["genome"];
  effectiveGenome: EffectiveGenomeView;
  plasticity: SpawnerPlasticityProfile;
  genomeIndex: GenomeIndex;
  featureContext: ReturnType<typeof buildFeatureContextFromIndex>;
  layer1UnitCount: number;
  layer2UnitCount: number;
  layer3PlusUnitCount: number;
  gateCounts: number[];
  outputCounts: number[];
  gateBiasValues: Record<GateType, number[]>;
  inputOutgoing: ConnectionGene[][];
  inputOutgoingWeights: number[][];
  outputIncoming: ConnectionGene[][];
  outputIncomingWeights: number[][];
  weights: {
    all: number[];
    inputToHidden: number[];
    recurrent: number[];
    hiddenToOutput: number[];
    skip: number[];
  };
};

function buildFunctionalGenomeSummary(spawner: SpawnerAgent): FunctionalGenomeSummary {
  const genome = spawner.genome;
  const effectiveGenome = createEffectiveGenomeView(genome, spawner.learnedState);
  const plasticity = sanitizePlasticityProfile(genome.plasticityProfile);
  const genomeIndex = createGenomeIndex(genome);
  const featureContext = buildFeatureContextFromIndex(genomeIndex);
  const gateCounts = Array.from({ length: UNIQUENESS_GATES.length }, () => 0);
  const outputCounts = Array.from({ length: OUTPUT_COUNT }, () => 0);
  const inputOutgoing = Array.from({ length: INPUT_COUNT }, () => [] as ConnectionGene[]);
  const inputOutgoingWeights = Array.from({ length: INPUT_COUNT }, () => [] as number[]);
  const outputIncoming = Array.from({ length: OUTPUT_COUNT }, () => [] as ConnectionGene[]);
  const outputIncomingWeights = Array.from({ length: OUTPUT_COUNT }, () => [] as number[]);
  const weights = {
    all: [] as number[],
    inputToHidden: weightsFor(featureContext.connectionGroups.inputToHidden, effectiveGenome),
    recurrent: weightsFor(featureContext.connectionGroups.recurrent, effectiveGenome),
    hiddenToOutput: weightsFor(featureContext.connectionGroups.hiddenToOutput, effectiveGenome),
    skip: weightsFor(featureContext.connectionGroups.skip, effectiveGenome),
  };

  let layer1UnitCount = 0;
  let layer2UnitCount = 0;
  let layer3PlusUnitCount = 0;
  const gateBiasValues: Record<GateType, number[]> = {
    update: [],
    reset: [],
    candidate: [],
  };
  for (const unit of genomeIndex.units) {
    if (unit.layerIndex === 1) layer1UnitCount += 1;
    else if (unit.layerIndex === 2) layer2UnitCount += 1;
    else if (unit.layerIndex >= 3) layer3PlusUnitCount += 1;
    gateBiasValues.update.push(effectiveGenome.getGateBias(unit, "update"));
    gateBiasValues.reset.push(effectiveGenome.getGateBias(unit, "reset"));
    gateBiasValues.candidate.push(effectiveGenome.getGateBias(unit, "candidate"));
  }

  for (const connection of genomeIndex.connections) {
    const weight = effectiveGenome.getConnectionWeight(connection);
    weights.all.push(weight);
    if (connection.source.kind === "input") {
      inputOutgoing[connection.source.index]?.push(connection);
      inputOutgoingWeights[connection.source.index]?.push(weight);
    }
    if (connection.target.kind === "hidden") {
      const gateIndex = UNIQUENESS_GATES.indexOf(connection.target.gate);
      if (gateIndex >= 0) gateCounts[gateIndex] = (gateCounts[gateIndex] ?? 0) + 1;
    } else {
      outputCounts[connection.target.index] = (outputCounts[connection.target.index] ?? 0) + 1;
      outputIncoming[connection.target.index]?.push(connection);
      outputIncomingWeights[connection.target.index]?.push(weight);
    }
  }

  return {
    genome,
    effectiveGenome,
    plasticity,
    genomeIndex,
    featureContext,
    layer1UnitCount,
    layer2UnitCount,
    layer3PlusUnitCount,
    gateCounts,
    outputCounts,
    gateBiasValues,
    inputOutgoing,
    inputOutgoingWeights,
    outputIncoming,
    outputIncomingWeights,
    weights,
  };
}

function weightsFor(connections: ConnectionGene[], effectiveGenome: EffectiveGenomeView) {
  return connections.map((connection) => effectiveGenome.getConnectionWeight(connection));
}
