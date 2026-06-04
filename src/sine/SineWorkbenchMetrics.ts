import type { MarketStatsPacket } from "./marketWorkerProtocol";

export function reproductionRequirementMeterPercent(
  stats: Pick<MarketStatsPacket, "activeSpawnerConfig" | "currentReproductionEnergyRequirement">,
) {
  const config = stats.activeSpawnerConfig;
  const maxMultiplier = Math.max(
    finiteNonNegative(config.reproductionCostMinMultiplier, 1),
    finiteNonNegative(config.reproductionCostMaxMultiplier, 1),
  );
  const maxRequirement = Math.max(
    finiteNonNegative(config.reproductionEnergy, 0),
    finiteNonNegative(config.reproductionCost, 0) * maxMultiplier,
  );
  const currentRequirement = finiteNonNegative(stats.currentReproductionEnergyRequirement, 0);
  return Math.min(100, (currentRequirement / Math.max(0.000001, maxRequirement)) * 100);
}

export function reproductionCostMultiplierMeterPercent(
  stats: Pick<MarketStatsPacket, "activeSpawnerConfig" | "reproductionCostMultiplier">,
) {
  const config = stats.activeSpawnerConfig;
  const maxMultiplier = Math.max(
    finiteNonNegative(config.reproductionCostMinMultiplier, 1),
    finiteNonNegative(config.reproductionCostMaxMultiplier, 1),
  );
  return Math.min(100, (finiteNonNegative(stats.reproductionCostMultiplier, 0) / maxMultiplier) * 100);
}

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
