import { mutateIntegerByRate, mutateNumberByRate, mutationChance } from "./profileMutation";
import type { SeededRng } from "./rng";
import { finiteOr, sanitizeIntegerTick, sanitizeNonNegative as sanitizeNonNegativeNumber } from "./sanitize";
import type { SpawnerConfig, SpawnerPerception, SpawnerPerceptionLagPair } from "./types";

export const PERCEPTION_MAX_TICKS = 1000;
export const ROLLING_SAMPLE_COUNT = 7;

const DEFAULT_DELTA_LAG_PAIRS: SpawnerPerceptionLagPair[] = [
  { fromTicks: 0, toTicks: 3 },
  { fromTicks: 3, toTicks: 7 },
  { fromTicks: 7, toTicks: 13 },
  { fromTicks: 13, toTicks: 27 },
  { fromTicks: 27, toTicks: 53 },
];

export function defaultPerceptionFromConfig(config: SpawnerConfig): SpawnerPerception {
  return sanitizePerception({
    deltaLagPairs: [
      { fromTicks: config.defaultDeltaLag1FromTicks, toTicks: config.defaultDeltaLag1ToTicks },
      { fromTicks: config.defaultDeltaLag2FromTicks, toTicks: config.defaultDeltaLag2ToTicks },
      { fromTicks: config.defaultDeltaLag3FromTicks, toTicks: config.defaultDeltaLag3ToTicks },
      { fromTicks: config.defaultDeltaLag4FromTicks, toTicks: config.defaultDeltaLag4ToTicks },
      { fromTicks: config.defaultDeltaLag5FromTicks, toTicks: config.defaultDeltaLag5ToTicks },
    ],
    rollingWindowTicks: config.defaultRollingWindowTicks,
    localScaleWindowTicks: config.defaultLocalScaleWindowTicks,
    localScaleSampleStepTicks: config.defaultLocalScaleSampleStepTicks,
    trendWindowTicks: config.defaultTrendWindowTicks,
    cycleWindowTicks: config.defaultCycleWindowTicks,
    roughnessSensitivity: config.defaultRoughnessSensitivity,
    pendingDensityScale: config.defaultPendingDensityScale,
  });
}

export function sanitizePerception(perception: Partial<SpawnerPerception> | undefined): SpawnerPerception {
  const deltaLagPairs = sanitizeDeltaLagPairs(perception?.deltaLagPairs);
  return {
    deltaLagPairs,
    rollingWindowTicks: sanitizeTick(perception?.rollingWindowTicks, 53),
    localScaleWindowTicks: sanitizeTick(perception?.localScaleWindowTicks, 53),
    localScaleSampleStepTicks: Math.max(1, sanitizeTick(perception?.localScaleSampleStepTicks, 3)),
    trendWindowTicks: sanitizeTick(perception?.trendWindowTicks, 53),
    cycleWindowTicks: sanitizeTick(perception?.cycleWindowTicks, 53),
    roughnessSensitivity: sanitizeNonNegative(perception?.roughnessSensitivity, 0.02),
    pendingDensityScale: Math.max(1, sanitizeTick(perception?.pendingDensityScale, 80)),
  };
}

export function randomizeFounderPerception(config: SpawnerConfig, rng: SeededRng) {
  const breadth = Math.max(0, finiteOr(config.founderPerceptionRandomizationTicks, 0));
  return sanitizePerception(mutatePerception(defaultPerceptionFromConfig(config), rng, {
    rate: breadth > 0 ? 1 : 0,
    lagStdDev: breadth,
    windowStdDev: breadth,
    sensitivityStdDev: breadth * 0.001,
    densityScaleStdDev: breadth,
  }));
}

export function mutatePerception(
  perception: SpawnerPerception,
  rng: SeededRng,
  {
    rate,
    lagStdDev,
    windowStdDev,
    sensitivityStdDev,
    densityScaleStdDev,
  }: {
    rate: number;
    lagStdDev: number;
    windowStdDev: number;
    sensitivityStdDev: number;
    densityScaleStdDev: number;
  },
): SpawnerPerception {
  const chance = mutationChance(rate);
  const next = sanitizePerception(perception);

  return sanitizePerception({
    ...next,
    deltaLagPairs: next.deltaLagPairs.map((pair) => ({
      fromTicks: mutateIntegerByRate(pair.fromTicks, chance, lagStdDev, rng),
      toTicks: mutateIntegerByRate(pair.toTicks, chance, lagStdDev, rng),
    })),
    rollingWindowTicks: mutateIntegerByRate(next.rollingWindowTicks, chance, windowStdDev, rng),
    localScaleWindowTicks: mutateIntegerByRate(next.localScaleWindowTicks, chance, windowStdDev, rng),
    localScaleSampleStepTicks: mutateIntegerByRate(next.localScaleSampleStepTicks, chance, windowStdDev, rng),
    trendWindowTicks: mutateIntegerByRate(next.trendWindowTicks, chance, windowStdDev, rng),
    cycleWindowTicks: mutateIntegerByRate(next.cycleWindowTicks, chance, windowStdDev, rng),
    roughnessSensitivity: mutateNumberByRate(next.roughnessSensitivity, chance, sensitivityStdDev, rng),
    pendingDensityScale: mutateIntegerByRate(next.pendingDensityScale, chance, densityScaleStdDev, rng),
  });
}

export function rollingLags(perception: SpawnerPerception) {
  const sanitized = sanitizePerception(perception);
  const window = sanitized.rollingWindowTicks;
  return Array.from({ length: ROLLING_SAMPLE_COUNT }, (_, index) =>
    sanitizeTick((window * index) / Math.max(1, ROLLING_SAMPLE_COUNT - 1), window),
  );
}

export function perceptionCacheKey(perception: SpawnerPerception) {
  const sanitized = sanitizePerception(perception);
  return [
    ...sanitized.deltaLagPairs.flatMap((pair) => [pair.fromTicks, pair.toTicks]),
    sanitized.rollingWindowTicks,
    sanitized.localScaleWindowTicks,
    sanitized.localScaleSampleStepTicks,
    sanitized.trendWindowTicks,
    sanitized.cycleWindowTicks,
    sanitized.roughnessSensitivity,
    sanitized.pendingDensityScale,
  ].join("|");
}

export function summarizePerception(perception: SpawnerPerception) {
  const sanitized = sanitizePerception(perception);
  const lagEndpoints = sanitized.deltaLagPairs.flatMap((pair) => [pair.fromTicks, pair.toTicks]);
  const averageLag = lagEndpoints.reduce((sum, value) => sum + value, 0) / Math.max(1, lagEndpoints.length);
  const longestWindow = Math.max(
    sanitized.rollingWindowTicks,
    sanitized.localScaleWindowTicks,
    sanitized.trendWindowTicks,
    sanitized.cycleWindowTicks,
    ...lagEndpoints,
  );
  return {
    averageLag,
    longestWindow,
    pendingDensityScale: sanitized.pendingDensityScale,
  };
}

export function perceptionDetailRows(perception: SpawnerPerception) {
  const sanitized = sanitizePerception(perception);
  return [
    ...sanitized.deltaLagPairs.map((pair, index) => ({
      label: `Delta pair ${index + 1}`,
      value: `${pair.fromTicks}-${pair.toTicks} ticks`,
    })),
    { label: "Rolling window", value: `${sanitized.rollingWindowTicks} ticks` },
    { label: "Local scale window", value: `${sanitized.localScaleWindowTicks} ticks` },
    { label: "Local sample step", value: `${sanitized.localScaleSampleStepTicks} ticks` },
    { label: "Trend window", value: `${sanitized.trendWindowTicks} ticks` },
    { label: "Cycle window", value: `${sanitized.cycleWindowTicks} ticks` },
    { label: "Roughness sensitivity", value: sanitized.roughnessSensitivity.toFixed(4) },
    { label: "Pending density scale", value: `${sanitized.pendingDensityScale} ticks` },
  ];
}

function sanitizeDeltaLagPairs(pairs: SpawnerPerception["deltaLagPairs"] | undefined): SpawnerPerceptionLagPair[] {
  return DEFAULT_DELTA_LAG_PAIRS.map((fallback, index) => {
    const pair = pairs?.[index];
    return {
      fromTicks: sanitizeTick(pair?.fromTicks, fallback.fromTicks),
      toTicks: sanitizeTick(pair?.toTicks, fallback.toTicks),
    };
  });
}

function sanitizeTick(value: number | undefined, fallback: number) {
  return sanitizeIntegerTick(value, fallback, PERCEPTION_MAX_TICKS);
}

function sanitizeNonNegative(value: number | undefined, fallback: number) {
  return sanitizeNonNegativeNumber(value, fallback);
}
