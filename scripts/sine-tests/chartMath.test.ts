import { strict as assert } from "node:assert";
import { cumulativePayoffDomain, normalizeCumulativePayoff } from "../../src/sine/charts/tradingPerformanceScale";
import { miniChartBarHeight, miniChartBarMax, miniChartGeometry, miniChartX, miniChartY } from "../../src/sine/history/miniChartGeometry";
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

function testMiniChartGeometryUsesVisibleTickDomain() {
  const geometry = miniChartGeometry(
    [
      { tick: 40, value: 1 },
      { tick: 70, value: 2 },
      { tick: 100, value: 3 },
    ],
    [1, 2, 3],
    { width: 320, height: 110 },
  );

  assert.equal(geometry.xMin, 40);
  assert.equal(geometry.xMax, 100);
  assert.equal(miniChartX(0, geometry), 0);
  assert.equal(miniChartX(2, geometry), 320);
}

function testMiniChartGeometryKeepsIndexDomainForIndexCharts() {
  const geometry = miniChartGeometry(
    [{ tick: 100 }, { tick: 200 }, { tick: 300 }],
    [1, 2, 3],
    { width: 320, height: 110, xValue: (_row, index) => index },
  );

  assert.equal(geometry.xMin, 0);
  assert.equal(geometry.xMax, 2);
  assert.equal(miniChartX(0, geometry), 0);
  assert.equal(miniChartX(2, geometry), 320);
}

function testMiniChartRenderingMathStaysFiniteForMalformedValues() {
  const geometry = miniChartGeometry(
    [{ tick: 1 }, { tick: 2 }, { tick: 3 }],
    [Number.NaN, Number.POSITIVE_INFINITY, -1],
    { width: 320, height: 110 },
  );

  assert.equal(Number.isFinite(miniChartY(Number.NaN, geometry)), true);
  assert.equal(Number.isFinite(miniChartY(Number.POSITIVE_INFINITY, geometry)), true);
  assert.equal(Number.isFinite(miniChartY(Number.NEGATIVE_INFINITY, geometry)), true);

  const maxBar = miniChartBarMax([Number.NaN, Number.POSITIVE_INFINITY, -5]);
  assert.equal(Number.isFinite(maxBar), true);
  assert.equal(maxBar, 1);
  assert.equal(miniChartBarHeight(Number.NaN, maxBar, 42), 0);
  assert.equal(miniChartBarHeight(Number.POSITIVE_INFINITY, maxBar, 42), 0);
  assert.equal(miniChartBarHeight(-10, maxBar, 42), 0);
  assert.equal(Number.isFinite(miniChartBarHeight(1, Number.NaN, Number.POSITIVE_INFINITY)), true);
}

export const tests: SineTest[] = [
  { name: "Flat Zero Cumulative Payoff Centers Zero", run: testFlatZeroCumulativePayoffCentersZero },
  { name: "Positive Only Cumulative Payoff Uses Zero Floor", run: testPositiveOnlyCumulativePayoffUsesZeroFloor },
  { name: "Negative Only Cumulative Payoff Uses Zero Ceiling", run: testNegativeOnlyCumulativePayoffUsesZeroCeiling },
  { name: "Mixed Cumulative Payoff Preserves Range", run: testMixedCumulativePayoffPreservesRange },
  { name: "Cumulative Payoff Normalization Stays Finite And Clamped", run: testCumulativePayoffNormalizationStaysFiniteAndClamped },
  { name: "Mini Chart Geometry Uses Visible Tick Domain", run: testMiniChartGeometryUsesVisibleTickDomain },
  { name: "Mini Chart Geometry Keeps Index Domain For Index Charts", run: testMiniChartGeometryKeepsIndexDomainForIndexCharts },
  { name: "Mini Chart Rendering Math Stays Finite For Malformed Values", run: testMiniChartRenderingMathStaysFiniteForMalformedValues },
];
