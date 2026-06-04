import type { SpawnerAgent } from "./types";
import {
  finite,
  mahalanobisDistance,
  percentileRank,
  ROBUST_DISTANCE_EPSILON,
  whitenedDistance,
} from "./robustDistance";
import { FUNCTIONAL_GENOME_VECTOR_VERSION } from "./uniquenessVector";
import { MIN_MAD, preparePopulationFeatureSpace, type PreparedPopulationFeatureSpace } from "./populationFeatureSpace";

export const UNIQUENESS_VERSION = "mahalanobis-v1";

export type UniquenessFeatureDeviation = {
  key: string;
  label: string;
  value: number;
  populationMedian: number;
  populationMad: number;
  zScore: number;
};

export type SpawnerUniquenessScore = {
  version: typeof UNIQUENESS_VERSION;
  vectorVersion: typeof FUNCTIONAL_GENOME_VECTOR_VERSION;
  score: number;
  rawDistance: number;
  comparisonTick: number;
  comparisonPopulationSize: number;
  activeFeatureCount: number;
  droppedFeatureCount: number;
  nearestNeighborIds: number[];
  mostSimilarFeatures: UniquenessFeatureDeviation[];
  mostDissimilarFeatures: UniquenessFeatureDeviation[];
};

const NEIGHBOR_COUNT = 5;
const EXPLANATION_COUNT = 8;

export function computeSpawnerUniqueness(
  spawners: SpawnerAgent[],
  comparisonTick = 0,
  options: { detailSpawnerId?: number; includeDetailsForAll?: boolean } = {},
): Map<number, SpawnerUniquenessScore> {
  const scores = new Map<number, SpawnerUniquenessScore>();
  if (spawners.length === 0) return scores;

  const prepared = preparePopulationFeatureSpace(spawners);
  const distances = new Map(spawners.map((spawner) => [spawner.id, mahalanobisDistance(prepared.normalizedRows.get(spawner.id) ?? [], prepared.inverseCovariance)]));
  const allDistances = [...distances.values()];
  const allZero = allDistances.every((distance) => Math.abs(distance) <= ROBUST_DISTANCE_EPSILON);

  for (const spawner of spawners) {
    const rawDistance = distances.get(spawner.id) ?? 0;
    const includeDetails = options.includeDetailsForAll === true || options.detailSpawnerId === spawner.id;
    scores.set(spawner.id, {
      version: UNIQUENESS_VERSION,
      vectorVersion: FUNCTIONAL_GENOME_VECTOR_VERSION,
      score: allZero ? 0 : percentileRank(rawDistance, allDistances),
      rawDistance,
      comparisonTick,
      comparisonPopulationSize: spawners.length,
      activeFeatureCount: prepared.activeIndexes.length,
      droppedFeatureCount: prepared.stats.length - prepared.activeIndexes.length,
      nearestNeighborIds: includeDetails ? nearestNeighbors(spawner, prepared) : [],
      ...(includeDetails
        ? featureExplanations(spawner, prepared)
        : { mostSimilarFeatures: [], mostDissimilarFeatures: [] }),
    });
  }

  return scores;
}

function nearestNeighbors(spawner: SpawnerAgent, prepared: PreparedPopulationFeatureSpace) {
  const target = prepared.normalizedRows.get(spawner.id) ?? [];
  return prepared.spawners
    .filter((candidate) => candidate.id !== spawner.id)
    .map((candidate) => ({
      id: candidate.id,
      distance: whitenedDistance(target, prepared.normalizedRows.get(candidate.id) ?? [], prepared.inverseCovariance),
    }))
    .sort((left, right) => left.distance - right.distance || left.id - right.id)
    .slice(0, NEIGHBOR_COUNT)
    .map((neighbor) => neighbor.id);
}

function featureExplanations(spawner: SpawnerAgent, prepared: PreparedPopulationFeatureSpace) {
  const features = prepared.featuresById.get(spawner.id) ?? [];
  const deviations = features.map((feature, index) => {
    const stat = prepared.stats[index];
    const mad = stat?.mad ?? 0;
    const zScore = mad > MIN_MAD ? (feature.value - (stat?.median ?? 0)) / mad : 0;
    return {
      key: feature.key,
      label: feature.label,
      value: finite(feature.value),
      populationMedian: finite(stat?.median ?? 0),
      populationMad: finite(mad),
      zScore: finite(zScore),
    };
  });
  const active = deviations.filter((deviation) => Math.abs(deviation.zScore) > ROBUST_DISTANCE_EPSILON);
  const typicalCandidates = deviations.filter((_, index) => prepared.stats[index]?.active);
  return {
    mostSimilarFeatures: [...(typicalCandidates.length > 0 ? typicalCandidates : deviations)]
      .sort((left, right) => Math.abs(left.zScore) - Math.abs(right.zScore) || left.key.localeCompare(right.key))
      .slice(0, EXPLANATION_COUNT),
    mostDissimilarFeatures: [...active]
      .sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore) || left.key.localeCompare(right.key))
      .slice(0, EXPLANATION_COUNT),
  };
}
