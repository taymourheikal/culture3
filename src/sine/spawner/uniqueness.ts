import { forwardSpawner } from "./brain";
import { OUTPUT_COUNT } from "./config";
import { architectureMetrics } from "./genome";
import { clamp, interpolate, sigmoid } from "./math";
import type { SpawnerAgent, SpawnerConfig } from "./types";

export type SpawnerUniquenessScore = {
  genome: number;
  behavior: number;
  complexity: number;
  overall: number;
  nearestNeighborIds: number[];
};

type DistanceRows = Map<number, Array<{ id: number; distance: number }>>;
type GenomeProfile = {
  structural: Set<string>;
  numeric: number[];
  controls: number[];
};

const NEIGHBOR_COUNT = 5;
const SIGMA_GENOME = 1;
const SIGMA_BEHAVIOR = 1;
const SIGMA_COMPLEXITY = 1;
const EPSILON = 1e-9;

const BEHAVIOR_SCENARIOS = [
  [-0.15, 0.35, 0.2, -0.1, 0.05, 0.1, 0.45, 0.42, 0.35, 0.02, 0.18, 0.22, 0.05, 0.7, 0.9],
  [0.55, 0.45, 0.2, -0.2, -0.3, 0.2, 0.62, 0.58, 0.4, 0.04, 0.24, 0.3, 0.18, 1.25, 0.85],
  [-0.6, -0.45, -0.2, 0.1, 0.35, -0.05, -0.5, -0.44, 0.28, -0.03, 0.32, 0.48, 0.1, 0.45, 0.55],
  [0.1, -0.25, -0.4, -0.28, -0.12, -0.18, 0.35, 0.3, 0.58, 0.01, 0.68, 0.72, 0.22, 1.6, 0.4],
  [0.82, 0.2, -0.05, 0.05, 0.18, 0.24, 0.18, 0.16, 0.2, 0.08, 0.12, 0.2, 0.38, 0.95, 1],
  [-0.72, -0.1, 0.22, 0.18, -0.08, -0.16, -0.25, -0.2, 0.52, -0.07, 0.56, 0.65, 0.32, 0.62, 0.75],
] as const;

export function computeSpawnerUniqueness(spawners: SpawnerAgent[], config: SpawnerConfig): Map<number, SpawnerUniquenessScore> {
  const scores = new Map<number, SpawnerUniquenessScore>();
  if (spawners.length <= 1) {
    for (const spawner of spawners) scores.set(spawner.id, zeroScore());
    return scores;
  }

  const genomeProfiles = buildGenomeProfiles(spawners);
  const genomeRows = pairwiseRows(spawners, (left, right) => genomeDistance(genomeProfiles.get(left.id), genomeProfiles.get(right.id)));
  const behaviorVectors = new Map(spawners.map((spawner) => [spawner.id, behaviorVector(spawner, config)]));
  const behaviorRows = pairwiseRows(spawners, (left, right) => rmse(behaviorVectors.get(left.id) ?? [], behaviorVectors.get(right.id) ?? []));
  const complexityVectors = normalizedMetricVectors(spawners);
  const complexityRows = pairwiseRows(spawners, (left, right) => rmse(complexityVectors.get(left.id) ?? [], complexityVectors.get(right.id) ?? []));

  for (const spawner of spawners) {
    const genomeRaw = nearestMean(genomeRows.get(spawner.id) ?? []);
    const behaviorRaw = nearestMean(behaviorRows.get(spawner.id) ?? []);
    const complexityRaw = nearestMean(complexityRows.get(spawner.id) ?? []);
    const genome = squash(genomeRaw, SIGMA_GENOME);
    const behavior = squash(behaviorRaw, SIGMA_BEHAVIOR);
    const complexity = squash(complexityRaw, SIGMA_COMPLEXITY);
    const nearestNeighborIds = nearestByCombined(spawner.id, genomeRows, behaviorRows, complexityRows);
    scores.set(spawner.id, {
      genome,
      behavior,
      complexity,
      overall: clamp(0.4 * genome + 0.4 * behavior + 0.2 * complexity, 0, 1),
      nearestNeighborIds,
    });
  }

  return scores;
}

function buildGenomeProfiles(spawners: SpawnerAgent[]) {
  const numericVectors = normalizedFeatureVectors(spawners, numericGenomeFeatures);
  const controlVectors = normalizedFeatureVectors(spawners, controlGenomeFeatures);
  return new Map(
    spawners.map((spawner) => [
      spawner.id,
      {
        structural: structuralFeatures(spawner),
        numeric: numericVectors.get(spawner.id) ?? [],
        controls: controlVectors.get(spawner.id) ?? [],
      },
    ]),
  );
}

function genomeDistance(left?: GenomeProfile, right?: GenomeProfile) {
  if (!left || !right) return 0;
  const structural = jaccardDistance(left.structural, right.structural);
  const numeric = rmse(left.numeric, right.numeric);
  const controls = rmse(left.controls, right.controls);
  return 0.45 * structural + 0.45 * numeric + 0.1 * controls;
}

function structuralFeatures(spawner: SpawnerAgent) {
  const features = new Set<string>();
  for (const unit of spawner.genome.units) {
    features.add(`unit:${unit.innovationId}:${unit.enabled ? "active" : "disabled"}`);
  }
  for (const connection of spawner.genome.connections) {
    features.add(`connection:${connection.innovationId}:${connection.enabled ? "active" : "disabled"}`);
  }
  return features;
}

function numericGenomeFeatures(spawner: SpawnerAgent) {
  const features = new Map<string, number>();
  for (const unit of spawner.genome.units) {
    features.set(`unit:${unit.innovationId}:layer`, unit.layerIndex);
    features.set(`unit:${unit.innovationId}:updateBias`, unit.updateBias);
    features.set(`unit:${unit.innovationId}:resetBias`, unit.resetBias);
    features.set(`unit:${unit.innovationId}:candidateBias`, unit.candidateBias);
  }
  for (const connection of spawner.genome.connections) {
    features.set(`connection:${connection.innovationId}:weight`, connection.weight);
  }
  for (let index = 0; index < OUTPUT_COUNT; index += 1) {
    features.set(`outputBias:${index}`, spawner.genome.outputBias[index] ?? 0);
  }
  return features;
}

function controlGenomeFeatures(spawner: SpawnerAgent) {
  return new Map([
    ["mutationStd", spawner.genome.mutationStd],
    ["thresholdBias", spawner.genome.thresholdBias],
    ["minHorizon", spawner.genome.minHorizon],
    ["maxHorizon", spawner.genome.maxHorizon],
    ["cooldownBase", spawner.genome.cooldownBase],
  ]);
}

function behaviorVector(spawner: SpawnerAgent, config: SpawnerConfig) {
  const vector: number[] = [];
  for (const scenario of BEHAVIOR_SCENARIOS) {
    const clone = cloneSpawnerForBehavior(spawner);
    const outputs = forwardSpawner(clone, [...scenario]);
    vector.push(
      sigmoid(outputs[0] ?? 0) + clone.genome.thresholdBias,
      sigmoid(outputs[1] ?? 0) + clone.genome.thresholdBias,
      clamp(sigmoid(outputs[2] ?? 0), config.minSignalStrength, 1),
      interpolate(clone.genome.minHorizon, clone.genome.maxHorizon, sigmoid(outputs[3] ?? 0)),
      clone.genome.cooldownBase + sigmoid(outputs[4] ?? 0) * config.cooldownOutputMultiplier,
    );
  }
  return vector;
}

function cloneSpawnerForBehavior(spawner: SpawnerAgent): SpawnerAgent {
  return {
    ...spawner,
    genome: {
      ...spawner.genome,
      units: spawner.genome.units.map((unit) => ({ ...unit })),
      connections: spawner.genome.connections.map((connection) => ({
        ...connection,
        source: { ...connection.source },
        target: { ...connection.target },
      })),
      outputBias: [...spawner.genome.outputBias],
    },
    hiddenState: Object.fromEntries(spawner.genome.units.map((unit) => [unit.unitId, 0])),
    recentPayoffs: [...spawner.recentPayoffs],
  };
}

function normalizedMetricVectors(spawners: SpawnerAgent[]) {
  const rows = spawners.map((spawner) => {
    const metrics = architectureMetrics(spawner.genome);
    return {
      id: spawner.id,
      values: [
        metrics.activeUnits,
        metrics.activeLayers,
        metrics.activeConnections,
        metrics.recurrentConnections,
        metrics.skipConnections,
        metrics.outputConnections,
        metrics.disabledUnits,
        metrics.disabledConnections,
      ],
    };
  });
  const medians = columnStats(rows.map((row) => row.values)).map((stat) => stat.median);
  const mads = columnStats(rows.map((row) => row.values)).map((stat) => stat.mad);
  return new Map(rows.map((row) => [row.id, row.values.map((value, index) => (value - (medians[index] ?? 0)) / ((mads[index] ?? 0) + EPSILON))]));
}

function normalizedFeatureVectors(spawners: SpawnerAgent[], getFeatures: (spawner: SpawnerAgent) => Map<string, number>) {
  const rows = spawners.map((spawner) => ({ id: spawner.id, features: getFeatures(spawner) }));
  const featureRows = rows.map((row) => row.features);
  const keys = [...new Set(featureRows.flatMap((features) => [...features.keys()]))].sort();
  if (keys.length === 0) return new Map(spawners.map((spawner) => [spawner.id, []]));
  const stats = keys.map((key) => {
    const values = featureRows.map((features) => features.get(key) ?? 0);
    return medianMad(values);
  });
  return new Map(
    rows.map((row) => [
      row.id,
      keys.map((key, index) => {
        const stat = stats[index];
        return ((row.features.get(key) ?? 0) - (stat?.median ?? 0)) / ((stat?.mad ?? 0) + EPSILON);
      }),
    ]),
  );
}

function pairwiseRows(spawners: SpawnerAgent[], distance: (left: SpawnerAgent, right: SpawnerAgent) => number): DistanceRows {
  const rows: DistanceRows = new Map(spawners.map((spawner) => [spawner.id, []]));
  for (let leftIndex = 0; leftIndex < spawners.length; leftIndex += 1) {
    const left = spawners[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < spawners.length; rightIndex += 1) {
      const right = spawners[rightIndex];
      if (!right) continue;
      const value = finite(distance(left, right));
      rows.get(left.id)?.push({ id: right.id, distance: value });
      rows.get(right.id)?.push({ id: left.id, distance: value });
    }
  }
  return rows;
}

function nearestByCombined(spawnerId: number, genomeRows: DistanceRows, behaviorRows: DistanceRows, complexityRows: DistanceRows) {
  const byId = new Map<number, number>();
  for (const row of genomeRows.get(spawnerId) ?? []) byId.set(row.id, (byId.get(row.id) ?? 0) + 0.4 * squash(row.distance, SIGMA_GENOME));
  for (const row of behaviorRows.get(spawnerId) ?? []) byId.set(row.id, (byId.get(row.id) ?? 0) + 0.4 * squash(row.distance, SIGMA_BEHAVIOR));
  for (const row of complexityRows.get(spawnerId) ?? []) byId.set(row.id, (byId.get(row.id) ?? 0) + 0.2 * squash(row.distance, SIGMA_COMPLEXITY));
  return [...byId.entries()]
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])
    .slice(0, NEIGHBOR_COUNT)
    .map(([id]) => id);
}

function nearestMean(rows: Array<{ distance: number }>) {
  const nearest = [...rows].sort((left, right) => left.distance - right.distance).slice(0, Math.min(NEIGHBOR_COUNT, rows.length));
  if (nearest.length === 0) return 0;
  return nearest.reduce((sum, row) => sum + row.distance, 0) / nearest.length;
}

function jaccardDistance(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return 1 - intersection / union.size;
}

function rmse(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  if (length === 0) return 0;
  let squared = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    squared += delta * delta;
  }
  return Math.sqrt(squared / length);
}

function columnStats(rows: number[][]) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: width }, (_, index) => medianMad(rows.map((row) => row[index] ?? 0)));
}

function medianMad(values: number[]) {
  const medianValue = median(values);
  return {
    median: medianValue,
    mad: median(values.map((value) => Math.abs(value - medianValue))),
  };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function squash(distance: number, sigma: number) {
  const value = finite(distance);
  return clamp(value / (value + sigma), 0, 1);
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function zeroScore(): SpawnerUniquenessScore {
  return {
    genome: 0,
    behavior: 0,
    complexity: 0,
    overall: 0,
    nearestNeighborIds: [],
  };
}
