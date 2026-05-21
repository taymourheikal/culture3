import type { BatchRunSummary, SurvivingLineageSummary } from "../sim/batch";
import type { FrequencyItem, LineageScope } from "./charts";
import type { WeightSample } from "./batchAnalysisTypes";

export function flattenLineages(runs: BatchRunSummary[]) {
  return runs.flatMap((run) => run.survivingLineages);
}

export function filterLineages(lineages: SurvivingLineageSummary[], scope: LineageScope) {
  if (scope === "founders") return lineages.filter((lineage) => lineage.foundingLineage);
  if (scope === "rescue") return lineages.filter((lineage) => !lineage.foundingLineage);
  return lineages;
}

export function filterWeightSamples(samples: WeightSample[], scope: LineageScope) {
  if (scope === "founders") return samples.filter((sample) => sample.foundingLineage);
  if (scope === "rescue") return samples.filter((sample) => !sample.foundingLineage);
  return samples;
}

export function architectureDistribution(lineages: SurvivingLineageSummary[]): FrequencyItem[] {
  const counts = new Map<string, number>();
  for (const lineage of lineages) {
    const label = architectureLabel(lineage);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function architectureCounts(samples: WeightSample[]) {
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const sample of samples) {
    const current = counts.get(sample.architectureKey);
    if (current) {
      current.count += 1;
    } else {
      counts.set(sample.architectureKey, {
        key: sample.architectureKey,
        label: sample.architectureLabel,
        count: 1,
      });
    }
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildWeightSamples(runs: BatchRunSummary[]): WeightSample[] {
  return runs.flatMap((run) =>
    run.survivingLineages.map((lineage) => ({
      key: `${run.runIndex}:${lineage.lineageId}`,
      label: `R${run.runIndex + 1} L${lineage.lineageId}`,
      runIndex: run.runIndex,
      lineageId: lineage.lineageId,
      foundingLineage: lineage.foundingLineage,
      architectureKey: architectureKey(lineage),
      architectureLabel: architectureLabel(lineage),
      neuralWeights: lineage.neuralWeights,
      vector: lineage.neuralWeights.flatWeightVector,
    })),
  );
}

export function collectWeights(samples: WeightSample[]) {
  const weights: number[] = [];
  for (const sample of samples) {
    for (const weight of sample.vector) {
      weights.push(weight);
    }
  }
  return weights;
}

export function architectureKey(lineage: SurvivingLineageSummary) {
  const architecture = lineage.neuralWeights.architecture;
  return [
    architecture.activation,
    `h1:${architecture.hiddenCount}`,
    architecture.secondLayerEnabled ? `h2:${architecture.secondHiddenCount}` : "h2:off",
  ].join("|");
}

export function architectureLabel(lineage: SurvivingLineageSummary) {
  const architecture = lineage.neuralWeights.architecture;
  return [
    architecture.activation,
    `H1 ${architecture.hiddenCount}`,
    architecture.secondLayerEnabled ? `H2 ${architecture.secondHiddenCount}` : "H2 off",
  ].join(" | ");
}
