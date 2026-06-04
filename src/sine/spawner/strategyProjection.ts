import { finiteZero } from "../stats";
import type { PreparedPopulationFeatureSpace } from "./populationFeatureSpace";

export type StrategyProjectionPoint = {
  spawnerId: number;
  x: number;
  y: number;
};

const POWER_ITERATIONS = 36;
const EPSILON = 1e-9;

export function projectPopulationStrategySpace(featureSpace: PreparedPopulationFeatureSpace): StrategyProjectionPoint[] {
  const rows = featureSpace.spawners.map((spawner) => ({
    spawnerId: spawner.id,
    row: featureSpace.normalizedRows.get(spawner.id) ?? [],
  }));
  if (rows.length === 0) return [];
  const width = rows[0]?.row.length ?? 0;
  if (rows.length < 2 || width === 0) {
    return rows.map(({ spawnerId }) => ({ spawnerId, x: 0, y: 0 }));
  }

  const centered = centerRows(rows.map((entry) => entry.row), width);
  const covariance = covarianceMatrix(centered, width);
  const firstAxis = stabilizeAxis(powerIteration(covariance, 1));
  const firstValue = eigenValue(covariance, firstAxis);
  const deflated = deflate(covariance, firstAxis, firstValue);
  const secondAxis = stabilizeAxis(orthogonalize(powerIteration(deflated, 2), firstAxis));
  const projected = centered.map((row) => ({
    x: dot(row, firstAxis),
    y: dot(row, secondAxis),
  }));
  const normalized = normalizeProjection(projected);
  return rows.map(({ spawnerId }, index) => ({
    spawnerId,
    x: finiteZero(normalized[index]?.x ?? 0),
    y: finiteZero(normalized[index]?.y ?? 0),
  }));
}

function centerRows(rows: number[][], width: number) {
  const means = Array.from({ length: width }, (_, index) => rows.reduce((sum, row) => sum + (row[index] ?? 0), 0) / Math.max(1, rows.length));
  return rows.map((row) => means.map((mean, index) => finiteZero((row[index] ?? 0) - mean)));
}

function covarianceMatrix(rows: number[][], width: number) {
  const covariance = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const denominator = Math.max(1, rows.length - 1);
  for (const row of rows) {
    for (let i = 0; i < width; i += 1) {
      const covarianceRow = covariance[i];
      if (!covarianceRow) continue;
      for (let j = i; j < width; j += 1) {
        covarianceRow[j] = (covarianceRow[j] ?? 0) + (row[i] ?? 0) * (row[j] ?? 0);
      }
    }
  }
  for (let i = 0; i < width; i += 1) {
    const covarianceRow = covariance[i];
    if (!covarianceRow) continue;
    for (let j = i; j < width; j += 1) {
      const value = finiteZero((covarianceRow[j] ?? 0) / denominator);
      covarianceRow[j] = value;
      const mirrorRow = covariance[j];
      if (mirrorRow) mirrorRow[i] = value;
    }
  }
  return covariance;
}

function powerIteration(matrix: number[][], salt: number) {
  const size = matrix.length;
  if (size === 0) return [];
  let vector = normalize(Array.from({ length: size }, (_, index) => deterministicSeed(index, salt)));
  for (let iteration = 0; iteration < POWER_ITERATIONS; iteration += 1) {
    const next = normalize(matrixVector(matrix, vector));
    if (norm(next) <= EPSILON) return zeroVector(size);
    vector = next;
  }
  return vector;
}

function deterministicSeed(index: number, salt: number) {
  return Math.sin((index + 1) * (12.9898 + salt * 3.17)) + Math.cos((index + 1) * (78.233 + salt * 5.11));
}

function matrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0));
}

function eigenValue(matrix: number[][], vector: number[]) {
  return dot(vector, matrixVector(matrix, vector));
}

function deflate(matrix: number[][], axis: number[], value: number) {
  return matrix.map((row, rowIndex) => row.map((cell, columnIndex) => finiteZero(cell - value * (axis[rowIndex] ?? 0) * (axis[columnIndex] ?? 0))));
}

function orthogonalize(vector: number[], axis: number[]) {
  const projection = dot(vector, axis);
  return normalize(vector.map((value, index) => value - projection * (axis[index] ?? 0)));
}

function stabilizeAxis(axis: number[]) {
  let pivot = 0;
  for (let index = 1; index < axis.length; index += 1) {
    if (Math.abs(axis[index] ?? 0) > Math.abs(axis[pivot] ?? 0)) pivot = index;
  }
  const sign = (axis[pivot] ?? 0) < 0 ? -1 : 1;
  return axis.map((value) => finiteZero(value * sign));
}

function normalize(vector: number[]) {
  const length = norm(vector);
  if (length <= EPSILON) return zeroVector(vector.length);
  return vector.map((value) => finiteZero(value / length));
}

function norm(vector: number[]) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function dot(left: number[], right: number[]) {
  return finiteZero(left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0));
}

function zeroVector(size: number) {
  return Array.from({ length: size }, () => 0);
}

function normalizeProjection(points: Array<{ x: number; y: number }>) {
  const maxAbs = Math.max(1e-9, ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]));
  return points.map((point) => ({
    x: finiteZero(point.x / maxAbs),
    y: finiteZero(point.y / maxAbs),
  }));
}
