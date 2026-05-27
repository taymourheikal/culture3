import { strict as assert } from "node:assert";
import { advanceMarketTimeline, createCandleMarketTimeline } from "../../src/sine/marketTimeline";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawner/config";
import { buildMarketInputs, createMarketInputResolver } from "../../src/sine/spawner/marketInputs";
import { defaultPerceptionFromConfig, perceptionCacheKey } from "../../src/sine/spawner/perception";
import type { SineTest } from "./helpers";

function testMarketInputsAreScaleRelative() {
  const values = Array.from({ length: 80 }, (_, tick) => {
    const centeredTick = tick - 40;
    return 1.6 * Math.sin(centeredTick / 4) + 0.4 * Math.cos(centeredTick / 9);
  });
  const small = inputsForRocValues(values);
  const large = inputsForRocValues(values.map((value) => value * 5));

  assert.equal(small.length, 14);
  assert.equal(large.length, 14);
  for (let index = 0; index < 13; index += 1) {
    assert(Math.abs((small[index] ?? 0) - (large[index] ?? 0)) < 0.000001, `input ${index} should be scale relative`);
  }
}

function testMarketInputsStayFiniteForFlatHistory() {
  const inputs = inputsForRocValues(Array.from({ length: 80 }, () => 0), 36);

  assert.equal(inputs.length, 14);
  assert(inputs.every(Number.isFinite));
  assert.equal(inputs[8], 0);
  assert.equal(inputs[13], 0.45);
}

function testMarketInputsUsePerAgentPerception() {
  const values = Array.from({ length: 120 }, (_, tick) => Math.sin(tick / 3) * 2);
  const defaultInputs = inputsForRocValues(values);
  const customInputs = inputsForRocValues(values, 20, {
    ...defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG),
    deltaLagPairs: [
      { fromTicks: 0, toTicks: 11 },
      { fromTicks: 11, toTicks: 23 },
      { fromTicks: 23, toTicks: 41 },
      { fromTicks: 41, toTicks: 67 },
      { fromTicks: 67, toTicks: 91 },
    ],
    rollingWindowTicks: 91,
    localScaleWindowTicks: 91,
    trendWindowTicks: 91,
    cycleWindowTicks: 91,
  });

  assert.notDeepEqual(customInputs.slice(0, 13).map((value) => value.toFixed(4)), defaultInputs.slice(0, 13).map((value) => value.toFixed(4)));
}

function testMarketInputResolverCachesIdenticalPerception() {
  const values = Array.from({ length: 120 }, (_, tick) => Math.sin(tick / 5));
  const timeline = createTimeline(values);
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  const samePerception = {
    ...perception,
    deltaLagPairs: perception.deltaLagPairs.map((pair) => ({ ...pair })),
  };
  const resolver = createMarketInputResolver(timeline, timeline.tick, 12);
  const first = resolver.resolve(perception);
  const second = resolver.resolve(samePerception);
  const changed = resolver.resolve({
    ...perception,
    deltaLagPairs: perception.deltaLagPairs.map((pair, index) => (index === 0 ? { fromTicks: 0, toTicks: 11 } : { ...pair })),
  });

  assert.equal(perceptionCacheKey(perception), perceptionCacheKey(samePerception));
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.equal(resolver.getComputeCount(), 2);
  assert.equal(resolver.getCacheSize(), 2);
}

function testMarketInputsGoldenVector() {
  const values = Array.from({ length: 96 }, (_, tick) => Math.sin(tick / 5) * 1.7 + Math.cos(tick / 11) * 0.35 + (tick % 9) / 30);
  const inputs = inputsForRocValues(values, 17).map((value) => Number(value.toFixed(6)));

  assert.deepEqual(inputs, [
    0.091386, 0.53224, 0.307437, -0.269525, -1.512023, 0.31149, 0.109721, 0.624531, -0.115911, -0.395696, 0.629749, 0.119127,
    0.084175, 0.2125,
  ]);
}

function inputsForRocValues(values: number[], pendingFoodCount = 20, perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG)) {
  const timeline = createTimeline(values);
  return buildMarketInputs(timeline, timeline.tick, pendingFoodCount, perception);
}

function createTimeline(values: number[]) {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
    candles: values.map((roc, index) => ({
      timestamp: index,
      datetime: new Date(index * 60_000).toISOString(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      roc,
      isStart: index === 0,
    })),
  });
  advanceMarketTimeline(timeline, values.length - 1, values.length);
  return timeline;
}

export const tests: SineTest[] = [
  { name: "Market Inputs Are Scale Relative", run: testMarketInputsAreScaleRelative },
  { name: "Market Inputs Stay Finite For Flat History", run: testMarketInputsStayFiniteForFlatHistory },
  { name: "Market Inputs Use Per Agent Perception", run: testMarketInputsUsePerAgentPerception },
  { name: "Market Input Resolver Caches Identical Perception", run: testMarketInputResolverCachesIdenticalPerception },
  { name: "Market Inputs Golden Vector", run: testMarketInputsGoldenVector },
];
