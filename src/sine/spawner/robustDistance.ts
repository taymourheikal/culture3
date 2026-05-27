import { finiteZero, median as medianValue, percentileRank as rankPercentile } from "../stats";

export const ROBUST_DISTANCE_EPSILON = 1e-9;

export function mahalanobisDistance(row: number[], inverseCovariance: number[][]) {
  if (row.length === 0 || inverseCovariance.length === 0) return 0;
  return quadraticDistance(row, row, inverseCovariance);
}

export function whitenedDistance(left: number[], right: number[], inverseCovariance: number[][]) {
  const delta = left.map((value, index) => value - (right[index] ?? 0));
  return quadraticDistance(delta, delta, inverseCovariance);
}

export function buildShrunkInverseCovariance(rows: number[][], width: number, shrinkage: number) {
  return invertMatrix(shrunkCovariance(rows, width, shrinkage));
}

export function percentileRank(value: number, values: number[]) {
  return rankPercentile(value, values, ROBUST_DISTANCE_EPSILON);
}

export function median(values: number[]) {
  return medianValue(values);
}

export function finite(value: number) {
  return finiteZero(value);
}

function quadraticDistance(left: number[], right: number[], inverseCovariance: number[][]) {
  let squared = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      squared += (left[i] ?? 0) * (inverseCovariance[i]?.[j] ?? 0) * (right[j] ?? 0);
    }
  }
  return Math.sqrt(Math.max(0, finite(squared)));
}

function shrunkCovariance(rows: number[][], width: number, shrinkage: number) {
  const denominator = Math.max(1, rows.length - 1);
  const covariance = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  for (const row of rows) {
    for (let i = 0; i < width; i += 1) {
      for (let j = i; j < width; j += 1) {
        const covarianceRow = covariance[i];
        if (covarianceRow) covarianceRow[j] = (covarianceRow[j] ?? 0) + (row[i] ?? 0) * (row[j] ?? 0);
      }
    }
  }
  for (let i = 0; i < width; i += 1) {
    for (let j = i; j < width; j += 1) {
      const covarianceRow = covariance[i];
      const mirrorRow = covariance[j];
      const value = (covarianceRow?.[j] ?? 0) / denominator;
      const shrunk = i === j ? (1 - shrinkage) * value + shrinkage : (1 - shrinkage) * value;
      if (covarianceRow) covarianceRow[j] = shrunk;
      if (mirrorRow) mirrorRow[i] = shrunk;
    }
  }
  return covariance;
}

function invertMatrix(matrix: number[][]) {
  const size = matrix.length;
  if (size === 0) return [];
  const augmented = matrix.map((row, index) => [
    ...row.map((value, column) => finite(value) + (index === column ? ROBUST_DISTANCE_EPSILON : 0)),
    ...Array.from({ length: size }, (_, column) => (column === index ? 1 : 0)),
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[column] ?? 0) > Math.abs(augmented[pivot]?.[column] ?? 0)) pivot = row;
    }
    if (Math.abs(augmented[pivot]?.[column] ?? 0) < ROBUST_DISTANCE_EPSILON) {
      const columnRow = augmented[column];
      if (columnRow) columnRow[column] = ROBUST_DISTANCE_EPSILON;
      pivot = column;
    }
    if (pivot !== column) [augmented[column], augmented[pivot]] = [augmented[pivot] ?? [], augmented[column] ?? []];

    const pivotValue = augmented[column]?.[column] ?? ROBUST_DISTANCE_EPSILON;
    const normalizedRow = augmented[column];
    if (!normalizedRow) continue;
    for (let col = 0; col < size * 2; col += 1) normalizedRow[col] = (normalizedRow[col] ?? 0) / pivotValue;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]?.[column] ?? 0;
      if (Math.abs(factor) <= ROBUST_DISTANCE_EPSILON) continue;
      for (let col = 0; col < size * 2; col += 1) {
        const eliminationRow = augmented[row];
        if (eliminationRow) eliminationRow[col] = (eliminationRow[col] ?? 0) - factor * (augmented[column]?.[col] ?? 0);
      }
    }
  }

  return augmented.map((row) => row.slice(size).map(finite));
}
