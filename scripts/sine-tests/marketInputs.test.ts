import { strict as assert } from "node:assert";
import { advanceMarketTimeline, createCandleMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { DEFAULT_SPAWNER_CONFIG } from "../../src/sine/spawner/config";
import { buildVolumeRsiInputs, computeRsiSignal } from "../../src/sine/spawner/marketFeatureInputs";
import { createMarketFeatureContext, MARKET_FEATURE_INPUT_COUNT } from "../../src/sine/spawner/marketFeatureContext";
import { buildMarketInputs, createMarketInputResolver } from "../../src/sine/spawner/marketInputs";
import { defaultPerceptionFromConfig, perceptionCacheKey } from "../../src/sine/spawner/perception";
import { summarizeLocalNumericScale } from "../../src/sine/spawner/localSignalScale";
import type { SineTest } from "./helpers";

function testMarketInputsAreScaleRelative() {
  const values = Array.from({ length: 80 }, (_, tick) => {
    const centeredTick = tick - 40;
    return 1.6 * Math.sin(centeredTick / 4) + 0.4 * Math.cos(centeredTick / 9);
  });
  const small = inputsForRocValues(values);
  const large = inputsForRocValues(values.map((value) => value * 5));

  assert.equal(small.length, 19);
  assert.equal(large.length, 19);
  for (let index = 0; index < 13; index += 1) {
    assert(Math.abs((small[index] ?? 0) - (large[index] ?? 0)) < 0.000001, `input ${index} should be scale relative`);
  }
}

function testMarketInputsStayFiniteForFlatHistory() {
  const inputs = inputsForRocValues(Array.from({ length: 80 }, () => 0), 36);

  assert.equal(inputs.length, 19);
  assert(inputs.every(Number.isFinite));
  assert.equal(inputs[8], 0);
  assert.equal(inputs[13], 0);
  assert.equal(inputs[14], 0);
  assert.equal(inputs[15], 0);
  assert.equal(inputs[16], 0);
  assert.equal(inputs[17], 0);
  assert.equal(inputs[18], 0.45);
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

function testMarketFeatureContextKeepsPendingDensitySeparate() {
  const values = Array.from({ length: 120 }, (_, tick) => Math.sin(tick / 5) + Math.cos(tick / 9) * 0.3);
  const timeline = createTimeline(values);
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  const context = createMarketFeatureContext(timeline, timeline.tick);
  const lowPending = context.resolveInputs(perception, 2);
  const highPending = context.resolveInputs(perception, 20);
  const repeatedFeatures = context.resolveMarketFeatures({ ...perception });

  assert.equal(repeatedFeatures, context.resolveMarketFeatures(perception));
  assert.equal(repeatedFeatures.length, MARKET_FEATURE_INPUT_COUNT);
  assert.deepEqual(lowPending.slice(0, MARKET_FEATURE_INPUT_COUNT), highPending.slice(0, MARKET_FEATURE_INPUT_COUNT));
  assert.notEqual(lowPending[MARKET_FEATURE_INPUT_COUNT], highPending[MARKET_FEATURE_INPUT_COUNT]);
  assert.equal(context.getFeatureComputeCount(), 1);
  assert.equal(context.getFeatureCacheSize(), 1);
  assert.ok(context.getSampleCacheSize() > 0);
}

function testMarketInputResolverCachesVolumeAndRsiTraits() {
  const values = Array.from({ length: 120 }, (_, tick) => Math.sin(tick / 5));
  const timeline = createTimeline(values);
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  const resolver = createMarketInputResolver(timeline, timeline.tick, 12);
  const first = resolver.resolve(perception);
  const changed = resolver.resolve({
    ...perception,
    volumeDeltaLagTicks: perception.volumeDeltaLagTicks + 1,
  });

  assert.notEqual(perceptionCacheKey(perception), perceptionCacheKey({ ...perception, volumeDeltaLagTicks: perception.volumeDeltaLagTicks + 1 }));
  assert.notEqual(first, changed);
  assert.equal(resolver.getComputeCount(), 2);
}

function testMarketInputsUseVolumeAndRsiTraits() {
  const values = Array.from({ length: 80 }, (_, tick) => Math.sin(tick / 7));
  const volumes = Array.from({ length: 80 }, (_, tick) => 100 + tick * 3 + Math.sin(tick / 4) * 20);
  const closes = Array.from({ length: 80 }, (_, tick) => 100 + tick * 0.5 + Math.sin(tick / 5) * 2);
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  const defaultInputs = inputsForRocValues(values, 20, perception, volumes, closes);
  const customInputs = inputsForRocValues(values, 20, {
    ...perception,
    volumeScaleWindowTicks: 21,
    volumeDeltaLagTicks: 3,
    volumeAccelerationLagTicks: 5,
    rsiWindowTicks: 7,
    volumePriceAgreementLagTicks: 4,
  }, volumes, closes);

  assert(defaultInputs.slice(13, 18).every(Number.isFinite));
  assert.notDeepEqual(customInputs.slice(13, 18).map((value) => value.toFixed(4)), defaultInputs.slice(13, 18).map((value) => value.toFixed(4)));
}

function testVolumeRsiHelpersAreFiniteAndDirectional() {
  const risingResolver = sampleResolverFromSeries({
    signals: [0, 0.1, 0.3, 0.5, 0.8, 1],
    prices: [100, 101, 102, 104, 105, 107],
    volumes: [100, 120, 150, 190, 250, 320],
  });
  const fallingResolver = sampleResolverFromSeries({
    signals: [1, 0.8, 0.5, 0.2, -0.1, -0.4],
    prices: [107, 105, 104, 102, 101, 100],
    volumes: [320, 250, 190, 150, 120, 100],
  });
  const perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG);
  const signalStats = summarizeLocalNumericScale([0, 0.1, 0.3, 0.5, 0.8, 1]);
  const rising = buildVolumeRsiInputs({
    tick: 5,
    perception,
    signalStats,
    sampleAtTick: risingResolver,
  });
  const missingVolume = buildVolumeRsiInputs({
    tick: 5,
    perception,
    signalStats,
    sampleAtTick: sampleResolverFromSeries({
      signals: [0, 0.1, 0.3, 0.5, 0.8, 1],
      prices: [100, 101, 102, 104, 105, 107],
    }),
  });

  assert(rising.rsiSignal > 0);
  assert(computeRsiSignal(5, perception.rsiWindowTicks, fallingResolver) < 0);
  assert(Object.values(rising).every(Number.isFinite));
  assert.equal(missingVolume.relativeVolume, 0);
  assert.equal(missingVolume.volumeDelta, 0);
  assert.equal(missingVolume.volumeAcceleration, 0);
  assert.equal(missingVolume.volumePriceAgreement, 0);
  assert(missingVolume.rsiSignal > 0);
}

function testMarketInputsGoldenVector() {
  const values = Array.from({ length: 96 }, (_, tick) => Math.sin(tick / 5) * 1.7 + Math.cos(tick / 11) * 0.35 + (tick % 9) / 30);
  const inputs = inputsForRocValues(values, 17).map((value) => Number(value.toFixed(6)));

  assert.deepEqual(inputs, [
    0.091386, 0.53224, 0.307437, -0.269525, -1.512023, 0.31149, 0.109721, 0.624531, -0.115911, -0.395696, 0.629749, 0.119127,
    0.084175, 0, 0, 0, 0, 0, 0.2125,
  ]);
}

function testGeneratedMarketInputsGoldenVector() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  advanceMarketTimeline(timeline, 64, 64);
  const inputs = buildMarketInputs(timeline, timeline.tick, 20, defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG)).map((value) =>
    Number(value.toFixed(6)),
  );

  assert.deepEqual(inputs, [
    -1.158985, -0.023899, -0.51326, -0.676729, 0.009641, -0.693519, -0.198852, 0.605773, -1, -0.976292, 0.485346, 0.132674,
    0.084175, 0, 0, 0, 0, 0, 0.25,
  ]);
}

function inputsForRocValues(
  values: number[],
  pendingFoodCount = 20,
  perception = defaultPerceptionFromConfig(DEFAULT_SPAWNER_CONFIG),
  volumes?: number[],
  closes?: number[],
) {
  const timeline = createTimeline(values, volumes, closes);
  return buildMarketInputs(timeline, timeline.tick, pendingFoodCount, perception);
}

function createTimeline(values: number[], volumes?: number[], closes?: number[]) {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
    candles: values.map((roc, index) => ({
      timestamp: index,
      datetime: new Date(index * 60_000).toISOString(),
      open: closes?.[index] ?? 100,
      high: closes?.[index] ?? 100,
      low: closes?.[index] ?? 100,
      close: closes?.[index] ?? 100,
      volume: volumes?.[index],
      roc,
      isStart: index === 0,
    })),
  });
  advanceMarketTimeline(timeline, values.length - 1, values.length);
  return timeline;
}

function sampleResolverFromSeries({
  signals,
  prices,
  volumes,
}: {
  signals: number[];
  prices: number[];
  volumes?: number[];
}) {
  return (tick: number) => {
    const index = Math.min(Math.max(0, Math.round(tick)), signals.length - 1);
    return {
      tick: index,
      phase: 0,
      trend: 0,
      signal: signals[index] ?? 0,
      noise: 0,
      parameters: {
        amplitude: 0,
        frequency: 0,
        slope: 0,
        noiseAmplitude: 0,
        noiseFrequency: 0,
      },
      settings: {
        amplitude: 0,
        frequency: 0,
        phase: 0,
        slope: 0,
        noiseAmplitude: 0,
        noiseFrequency: 0,
        noiseSeed: 0,
        amplitudeDrift: 0,
        frequencyDrift: 0,
        slopeDrift: 0,
        noiseAmplitudeDrift: 0,
        noiseFrequencyDrift: 0,
        regimeSpeed: 0,
        regimeSeed: 0,
      },
      price: prices[index],
      volume: volumes?.[index],
    };
  };
}

export const tests: SineTest[] = [
  { name: "Market Inputs Are Scale Relative", run: testMarketInputsAreScaleRelative },
  { name: "Market Inputs Stay Finite For Flat History", run: testMarketInputsStayFiniteForFlatHistory },
  { name: "Market Inputs Use Per Agent Perception", run: testMarketInputsUsePerAgentPerception },
  { name: "Market Input Resolver Caches Identical Perception", run: testMarketInputResolverCachesIdenticalPerception },
  { name: "Market Feature Context Keeps Pending Density Separate", run: testMarketFeatureContextKeepsPendingDensitySeparate },
  { name: "Market Input Resolver Caches Volume And RSI Traits", run: testMarketInputResolverCachesVolumeAndRsiTraits },
  { name: "Market Inputs Use Volume And RSI Traits", run: testMarketInputsUseVolumeAndRsiTraits },
  { name: "Volume RSI Helpers Are Finite And Directional", run: testVolumeRsiHelpersAreFiniteAndDirectional },
  { name: "Market Inputs Golden Vector", run: testMarketInputsGoldenVector },
  { name: "Generated Market Inputs Golden Vector", run: testGeneratedMarketInputsGoldenVector },
];
