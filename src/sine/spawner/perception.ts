import { mutateIntegerByRate, mutateNumberByRate, mutationChance } from "./profileMutation";
import type { SeededRng } from "./rng";
import { finiteOr, sanitizeIntegerTick, sanitizeNonNegative as sanitizeNonNegativeNumber } from "./sanitize";
import type { SpawnerConfig, SpawnerPerception, SpawnerPerceptionLagPair } from "./types";

export const PERCEPTION_MAX_TICKS = 1000;
export const ROLLING_SAMPLE_COUNT = 7;

type PerceptionScalarKey = Exclude<keyof SpawnerPerception, "deltaLagPairs">;
type PerceptionMutationStdDevGroup = "lag" | "window" | "sensitivity" | "density";

type PerceptionScalarDescriptor = {
  key: PerceptionScalarKey;
  label: string;
  fallback: number;
  sanitizer: "tick" | "nonNegative";
  min?: number;
  mutationStdDevGroup: PerceptionMutationStdDevGroup;
  cacheKey: true;
  longestWindow: boolean;
  format: (value: number) => string;
};

const DEFAULT_DELTA_LAG_PAIRS: SpawnerPerceptionLagPair[] = [
  { fromTicks: 0, toTicks: 3 },
  { fromTicks: 3, toTicks: 7 },
  { fromTicks: 7, toTicks: 13 },
  { fromTicks: 13, toTicks: 27 },
  { fromTicks: 27, toTicks: 53 },
];

const PERCEPTION_SCALAR_DESCRIPTORS: readonly PerceptionScalarDescriptor[] = [
  tickDescriptor("rollingWindowTicks", "Rolling window", 53, "window", true),
  tickDescriptor("localScaleWindowTicks", "Local scale window", 53, "window", true),
  tickDescriptor("localScaleSampleStepTicks", "Local sample step", 3, "window", false, 1),
  tickDescriptor("volumeScaleWindowTicks", "Volume scale window", 53, "window", true),
  tickDescriptor("volumeScaleSampleStepTicks", "Volume sample step", 3, "window", false, 1),
  tickDescriptor("volumeDeltaLagTicks", "Volume delta lag", 7, "lag", true),
  tickDescriptor("volumeAccelerationLagTicks", "Volume acceleration lag", 7, "lag", true),
  tickDescriptor("rsiWindowTicks", "RSI window", 14, "window", true, 1),
  tickDescriptor("volumePriceAgreementLagTicks", "Volume-price agreement lag", 7, "lag", true),
  tickDescriptor("trendWindowTicks", "Trend window", 53, "window", true),
  tickDescriptor("cycleWindowTicks", "Cycle window", 53, "window", true),
  {
    key: "roughnessSensitivity",
    label: "Roughness sensitivity",
    fallback: 0.02,
    sanitizer: "nonNegative",
    mutationStdDevGroup: "sensitivity",
    cacheKey: true,
    longestWindow: false,
    format: (value) => value.toFixed(4),
  },
  tickDescriptor("pendingDensityScale", "Pending density scale", 80, "density", false, 1),
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
    volumeScaleWindowTicks: config.defaultVolumeScaleWindowTicks,
    volumeScaleSampleStepTicks: config.defaultVolumeScaleSampleStepTicks,
    volumeDeltaLagTicks: config.defaultVolumeDeltaLagTicks,
    volumeAccelerationLagTicks: config.defaultVolumeAccelerationLagTicks,
    rsiWindowTicks: config.defaultRsiWindowTicks,
    volumePriceAgreementLagTicks: config.defaultVolumePriceAgreementLagTicks,
    trendWindowTicks: config.defaultTrendWindowTicks,
    cycleWindowTicks: config.defaultCycleWindowTicks,
    roughnessSensitivity: config.defaultRoughnessSensitivity,
    pendingDensityScale: config.defaultPendingDensityScale,
  });
}

export function sanitizePerception(perception: Partial<SpawnerPerception> | undefined): SpawnerPerception {
  const deltaLagPairs = sanitizeDeltaLagPairs(perception?.deltaLagPairs);
  const sanitized = { deltaLagPairs } as SpawnerPerception;
  for (const descriptor of PERCEPTION_SCALAR_DESCRIPTORS) {
    sanitized[descriptor.key] = sanitizePerceptionScalar(descriptor, perception?.[descriptor.key]);
  }
  return sanitized;
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
  const mutated = { ...next } as SpawnerPerception;
  mutated.deltaLagPairs = next.deltaLagPairs.map((pair) => ({
    fromTicks: mutateIntegerByRate(pair.fromTicks, chance, lagStdDev, rng),
    toTicks: mutateIntegerByRate(pair.toTicks, chance, lagStdDev, rng),
  }));
  for (const descriptor of PERCEPTION_SCALAR_DESCRIPTORS) {
    mutated[descriptor.key] = mutatePerceptionScalar(descriptor, next[descriptor.key], chance, {
      lag: lagStdDev,
      window: windowStdDev,
      sensitivity: sensitivityStdDev,
      density: densityScaleStdDev,
    }, rng);
  }

  return sanitizePerception(mutated);
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
    ...PERCEPTION_SCALAR_DESCRIPTORS.filter((descriptor) => descriptor.cacheKey).map((descriptor) => sanitized[descriptor.key]),
  ].join("|");
}

export function summarizePerception(perception: SpawnerPerception) {
  const sanitized = sanitizePerception(perception);
  const lagEndpoints = sanitized.deltaLagPairs.flatMap((pair) => [pair.fromTicks, pair.toTicks]);
  const averageLag = lagEndpoints.reduce((sum, value) => sum + value, 0) / Math.max(1, lagEndpoints.length);
  const longestWindow = Math.max(
    ...PERCEPTION_SCALAR_DESCRIPTORS.filter((descriptor) => descriptor.longestWindow).map((descriptor) => sanitized[descriptor.key]),
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
    ...PERCEPTION_SCALAR_DESCRIPTORS.map((descriptor) => ({
      label: descriptor.label,
      value: descriptor.format(sanitized[descriptor.key]),
    })),
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

function tickDescriptor(
  key: PerceptionScalarKey,
  label: string,
  fallback: number,
  mutationStdDevGroup: PerceptionMutationStdDevGroup,
  longestWindow: boolean,
  min?: number,
): PerceptionScalarDescriptor {
  return {
    key,
    label,
    fallback,
    sanitizer: "tick",
    min,
    mutationStdDevGroup,
    cacheKey: true,
    longestWindow,
    format: (value) => `${value} ticks`,
  };
}

function sanitizePerceptionScalar(descriptor: PerceptionScalarDescriptor, value: number | undefined) {
  const sanitized = descriptor.sanitizer === "tick"
    ? sanitizeTick(value, descriptor.fallback)
    : sanitizeNonNegative(value, descriptor.fallback);
  return descriptor.min !== undefined ? Math.max(descriptor.min, sanitized) : sanitized;
}

function mutatePerceptionScalar(
  descriptor: PerceptionScalarDescriptor,
  value: number,
  chance: number,
  stddevs: Record<PerceptionMutationStdDevGroup, number>,
  rng: SeededRng,
) {
  const stdDev = stddevs[descriptor.mutationStdDevGroup];
  return descriptor.sanitizer === "nonNegative"
    ? mutateNumberByRate(value, chance, stdDev, rng)
    : mutateIntegerByRate(value, chance, stdDev, rng);
}
