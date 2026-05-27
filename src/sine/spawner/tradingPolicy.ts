import { clamp } from "./math";
import { mutateNumberByRate, mutationChance } from "./profileMutation";
import type { SeededRng } from "./rng";
import { finiteOr } from "./sanitize";
import type { SpawnerConfig, SpawnerTradingPolicy } from "./types";

export const TRADING_POLICY_DEFAULT_SPAWN_THRESHOLD = 0.56;
export const TRADING_POLICY_DEFAULT_MIN_SIGNAL_STRENGTH = 0.05;
export const TRADING_POLICY_SPAWN_THRESHOLD_MAX = 1.5;
export const TRADING_POLICY_MIN_SIGNAL_STRENGTH_MAX = 1;

export function defaultTradingPolicyFromConfig(config: SpawnerConfig): SpawnerTradingPolicy {
  return sanitizeTradingPolicy({
    spawnThreshold: config.defaultSpawnThreshold,
    minSignalStrength: config.defaultMinSignalStrength,
  });
}

export function sanitizeTradingPolicy(policy: Partial<SpawnerTradingPolicy> | undefined): SpawnerTradingPolicy {
  return {
    spawnThreshold: clamp(
      finiteOr(policy?.spawnThreshold, TRADING_POLICY_DEFAULT_SPAWN_THRESHOLD),
      0,
      TRADING_POLICY_SPAWN_THRESHOLD_MAX,
    ),
    minSignalStrength: clamp(
      finiteOr(policy?.minSignalStrength, TRADING_POLICY_DEFAULT_MIN_SIGNAL_STRENGTH),
      0,
      TRADING_POLICY_MIN_SIGNAL_STRENGTH_MAX,
    ),
  };
}

export function mutateTradingPolicy(
  policy: SpawnerTradingPolicy,
  rng: SeededRng,
  {
    rate,
    spawnThresholdStdDev,
    minSignalStrengthStdDev,
  }: {
    rate: number;
    spawnThresholdStdDev: number;
    minSignalStrengthStdDev: number;
  },
): SpawnerTradingPolicy {
  const chance = mutationChance(rate);
  const current = sanitizeTradingPolicy(policy);
  return sanitizeTradingPolicy({
    spawnThreshold: mutateNumberByRate(current.spawnThreshold, chance, spawnThresholdStdDev, rng),
    minSignalStrength: mutateNumberByRate(current.minSignalStrength, chance, minSignalStrengthStdDev, rng),
  });
}

export function tradingPolicyDetailRows(policy: SpawnerTradingPolicy) {
  const sanitized = sanitizeTradingPolicy(policy);
  return [
    { label: "Spawn threshold", value: sanitized.spawnThreshold.toFixed(3) },
    { label: "Min signal strength", value: sanitized.minSignalStrength.toFixed(3) },
  ];
}
