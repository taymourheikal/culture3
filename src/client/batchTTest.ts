import { mean, round, sampleDeviation, sampleVariance } from "./batchAnalysisMath";
import type { GroupStats, TTestResult } from "./batchAnalysisTypes";

export function groupStats(values: number[]): GroupStats {
  const finite = values.filter(Number.isFinite);
  const n = finite.length;
  if (n === 0) {
    return { n: 0, mean: 0, standardDeviation: 0, standardError: 0 };
  }
  const meanValue = mean(finite);
  const standardDeviation = sampleDeviation(finite, meanValue);
  return {
    n,
    mean: round(meanValue),
    standardDeviation: round(standardDeviation),
    standardError: n > 1 ? round(standardDeviation / Math.sqrt(n)) : 0,
  };
}

export function welchTTest(leftValues: number[], rightValues: number[]): TTestResult | null {
  const left = leftValues.filter(Number.isFinite);
  const right = rightValues.filter(Number.isFinite);
  if (left.length < 2 || right.length < 2) return null;

  const leftMean = mean(left);
  const rightMean = mean(right);
  const leftVariance = sampleVariance(left, leftMean);
  const rightVariance = sampleVariance(right, rightMean);
  const leftTerm = leftVariance / left.length;
  const rightTerm = rightVariance / right.length;
  const standardError = Math.sqrt(leftTerm + rightTerm);
  const meanDifference = leftMean - rightMean;

  if (standardError === 0) {
    return {
      t: meanDifference === 0 ? 0 : meanDifference > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
      degreesOfFreedom: Number.POSITIVE_INFINITY,
      pValue: meanDifference === 0 ? 1 : 0,
      meanDifference: round(meanDifference),
      effectSize: meanDifference === 0 ? 0 : meanDifference > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
    };
  }

  const numerator = (leftTerm + rightTerm) ** 2;
  const denominator =
    (leftTerm ** 2) / Math.max(1, left.length - 1) +
    (rightTerm ** 2) / Math.max(1, right.length - 1);
  const degreesOfFreedom = denominator === 0 ? Number.POSITIVE_INFINITY : numerator / denominator;
  const t = meanDifference / standardError;
  const pooledVariance =
    ((left.length - 1) * leftVariance + (right.length - 1) * rightVariance) /
    Math.max(1, left.length + right.length - 2);
  const pooledDeviation = Math.sqrt(pooledVariance);

  return {
    t: round(t),
    degreesOfFreedom: round(degreesOfFreedom),
    pValue: twoTailedStudentPValue(t, degreesOfFreedom),
    meanDifference: round(meanDifference),
    effectSize: pooledDeviation === 0 ? 0 : round(meanDifference / pooledDeviation),
  };
}

function twoTailedStudentPValue(t: number, degreesOfFreedom: number) {
  const absT = Math.abs(t);
  if (!Number.isFinite(absT)) return 0;
  if (!Number.isFinite(degreesOfFreedom)) return 2 * (1 - normalCdf(absT));
  const cdf = studentTCdf(absT, degreesOfFreedom);
  return Math.max(0, Math.min(1, 2 * (1 - cdf)));
}

function studentTCdf(t: number, degreesOfFreedom: number) {
  if (degreesOfFreedom <= 0) return Number.NaN;
  const x = degreesOfFreedom / (degreesOfFreedom + t * t);
  const ib = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return 1 - 0.5 * ib;
}

function regularizedIncompleteBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (bt * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaContinuedFraction(x: number, a: number, b: number) {
  const maxIterations = 100;
  const epsilon = 3e-7;
  const fpMin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const m2 = 2 * iteration;
    let aa = (iteration * (b - iteration) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + iteration) * (qab + iteration) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }

  return h;
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  let x = 0.9999999999998099;
  const adjusted = value - 1;
  for (let index = 0; index < coefficients.length; index += 1) {
    x += (coefficients[index] ?? 0) / (adjusted + index + 1);
  }
  const t = adjusted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(t) - t + Math.log(x);
}

function normalCdf(value: number) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return sign * y;
}
