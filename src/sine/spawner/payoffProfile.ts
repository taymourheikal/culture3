import { mutateIntegerByRate, mutationChance } from "./profileMutation";
import { sanitizeIntegerTick } from "./sanitize";
import type { SeededRng } from "./rng";
import type { SpawnerConfig, SpawnerPayoffProfile } from "./types";

export const PAYOFF_PROFILE_MAX_TICKS = 1000;

export function defaultPayoffProfileFromConfig(config: SpawnerConfig): SpawnerPayoffProfile {
  return sanitizePayoffProfile({
    scaleWindowTicks: config.defaultPayoffScaleWindowTicks,
    scaleSampleStepTicks: config.defaultPayoffScaleSampleStepTicks,
  });
}

export function sanitizePayoffProfile(profile: Partial<SpawnerPayoffProfile> | undefined): SpawnerPayoffProfile {
  return {
    scaleWindowTicks: sanitizeIntegerTick(profile?.scaleWindowTicks, 53, PAYOFF_PROFILE_MAX_TICKS),
    scaleSampleStepTicks: Math.max(1, sanitizeIntegerTick(profile?.scaleSampleStepTicks, 3, PAYOFF_PROFILE_MAX_TICKS)),
  };
}

export function mutatePayoffProfile(
  profile: SpawnerPayoffProfile,
  rng: SeededRng,
  {
    rate,
    windowStdDev,
    sampleStepStdDev,
  }: {
    rate: number;
    windowStdDev: number;
    sampleStepStdDev: number;
  },
): SpawnerPayoffProfile {
  const chance = mutationChance(rate);
  const current = sanitizePayoffProfile(profile);

  return sanitizePayoffProfile({
    scaleWindowTicks: mutateIntegerByRate(current.scaleWindowTicks, chance, windowStdDev, rng),
    scaleSampleStepTicks: mutateIntegerByRate(current.scaleSampleStepTicks, chance, sampleStepStdDev, rng),
  });
}

export function payoffProfileDetailRows(profile: SpawnerPayoffProfile) {
  const sanitized = sanitizePayoffProfile(profile);
  return [
    { label: "Payoff scale window", value: `${sanitized.scaleWindowTicks} ticks` },
    { label: "Payoff sample step", value: `${sanitized.scaleSampleStepTicks} ticks` },
  ];
}
