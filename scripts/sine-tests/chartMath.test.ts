import { strict as assert } from "node:assert";
import { cumulativePayoffDomain, normalizeCumulativePayoff } from "../../src/sine/charts/tradingPerformanceScale";
import type { SineTest } from "./helpers";

function testFlatZeroCumulativePayoffCentersZero() {
  const domain = cumulativePayoffDomain(0, 0);

  assert.deepEqual(domain, { min: -1, max: 1 });
  assert.equal(normalizeCumulativePayoff(0, domain), 0.5);
}

function testPositiveOnlyCumulativePayoffUsesZeroFloor() {
  const domain = cumulativePayoffDomain(2, 8);

  assert.deepEqual(domain, { min: 0, max: 8 });
  assert.equal(normalizeCumulativePayoff(0, domain), 0);
  assert.equal(normalizeCumulativePayoff(4, domain), 0.5);
  assert.equal(normalizeCumulativePayoff(8, domain), 1);
}

function testNegativeOnlyCumulativePayoffUsesZeroCeiling() {
  const domain = cumulativePayoffDomain(-8, -2);

  assert.deepEqual(domain, { min: -8, max: 0 });
  assert.equal(normalizeCumulativePayoff(-8, domain), 0);
  assert.equal(normalizeCumulativePayoff(-4, domain), 0.5);
  assert.equal(normalizeCumulativePayoff(0, domain), 1);
}

function testMixedCumulativePayoffPreservesRange() {
  const domain = cumulativePayoffDomain(-3, 9);

  assert.deepEqual(domain, { min: -3, max: 9 });
  assert.equal(normalizeCumulativePayoff(-3, domain), 0);
  assert.equal(normalizeCumulativePayoff(3, domain), 0.5);
  assert.equal(normalizeCumulativePayoff(9, domain), 1);
}

function testCumulativePayoffNormalizationStaysFiniteAndClamped() {
  const domain = cumulativePayoffDomain(Number.NaN, Number.POSITIVE_INFINITY);

  for (const value of [Number.NaN, Number.NEGATIVE_INFINITY, -10, 0, 10, Number.POSITIVE_INFINITY]) {
    const normalized = normalizeCumulativePayoff(value, domain);
    assert.equal(Number.isFinite(normalized), true);
    assert.ok(normalized >= 0 && normalized <= 1);
  }
}

export const tests: SineTest[] = [
  { name: "Flat Zero Cumulative Payoff Centers Zero", run: testFlatZeroCumulativePayoffCentersZero },
  { name: "Positive Only Cumulative Payoff Uses Zero Floor", run: testPositiveOnlyCumulativePayoffUsesZeroFloor },
  { name: "Negative Only Cumulative Payoff Uses Zero Ceiling", run: testNegativeOnlyCumulativePayoffUsesZeroCeiling },
  { name: "Mixed Cumulative Payoff Preserves Range", run: testMixedCumulativePayoffPreservesRange },
  { name: "Cumulative Payoff Normalization Stays Finite And Clamped", run: testCumulativePayoffNormalizationStaysFiniteAndClamped },
];
