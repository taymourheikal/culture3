import { buildShrunkInverseCovariance, median } from "./robustDistance";
import { buildFunctionalGenomeVector, type UniquenessFeature } from "./uniquenessVector";
import type { SpawnerAgent } from "./types";

export type PopulationFeatureStats = {
  key: string;
  label: string;
  median: number;
  mad: number;
  active: boolean;
};

export type PreparedPopulationFeatureSpace = {
  spawners: SpawnerAgent[];
  featuresById: Map<number, UniquenessFeature[]>;
  stats: PopulationFeatureStats[];
  normalizedRows: Map<number, number[]>;
  activeIndexes: number[];
  inverseCovariance: number[][];
};

export const MIN_MAD = 1e-7;
const SHRINKAGE = 0.15;

export function preparePopulationFeatureSpace(spawners: SpawnerAgent[]): PreparedPopulationFeatureSpace {
  const featuresById = new Map(spawners.map((spawner) => [spawner.id, buildFunctionalGenomeVector(spawner)]));
  const firstFeatures = featuresById.get(spawners[0]?.id ?? -1) ?? [];
  const stats = firstFeatures.map((feature, index) => {
    const values = spawners.map((spawner) => featuresById.get(spawner.id)?.[index]?.value ?? 0);
    const medianValue = median(values);
    const madValue = median(values.map((value) => Math.abs(value - medianValue)));
    const rangeScale = (Math.max(...values) - Math.min(...values)) / 2;
    const scale = madValue > MIN_MAD ? madValue : rangeScale;
    return {
      key: feature.key,
      label: feature.label,
      median: medianValue,
      mad: scale,
      active: scale > MIN_MAD,
    };
  });
  const activeIndexes = stats.map((stat, index) => (stat.active ? index : -1)).filter((index) => index >= 0);
  const normalizedRows = new Map(
    spawners.map((spawner) => [
      spawner.id,
      activeIndexes.map((index) => {
        const stat = stats[index];
        const value = featuresById.get(spawner.id)?.[index]?.value ?? 0;
        return stat ? (value - stat.median) / stat.mad : 0;
      }),
    ]),
  );
  const inverseCovariance = activeIndexes.length > 0 ? buildShrunkInverseCovariance([...normalizedRows.values()], activeIndexes.length, SHRINKAGE) : [];
  return { spawners, featuresById, stats, normalizedRows, activeIndexes, inverseCovariance };
}
