import { clamp } from "./math";
import type { SpawnerConfig } from "./types";

export function populationRoomRatio(livingPopulation: number, maxSpawners: number) {
  const cap = Math.max(0, Math.floor(Number.isFinite(maxSpawners) ? maxSpawners : 0));
  if (cap <= 0) return 0;
  const population = Math.max(0, Number.isFinite(livingPopulation) ? livingPopulation : 0);
  return clamp((cap - population) / cap, 0, 1);
}

export function populationPressure(livingPopulation: number, maxSpawners: number) {
  return 1 - populationRoomRatio(livingPopulation, maxSpawners);
}

export function reproductionCostMultiplier(config: SpawnerConfig, livingPopulation: number) {
  const min = finiteNonNegative(config.reproductionCostMinMultiplier, 1);
  const max = Math.max(min, finiteNonNegative(config.reproductionCostMaxMultiplier, min));
  const curve = finiteNonNegative(config.reproductionCostPressureCurve, 0);
  const pressure = populationPressure(livingPopulation, config.maxSpawners);
  const shapedPressure = exponentialPressure(pressure, curve);
  return min + (max - min) * shapedPressure;
}

export function currentReproductionCost(config: SpawnerConfig, livingPopulation: number) {
  return Math.max(0, config.reproductionCost) * reproductionCostMultiplier(config, livingPopulation);
}

export function currentReproductionEnergyRequirement(config: SpawnerConfig, livingPopulation: number) {
  return Math.max(Math.max(0, config.reproductionEnergy), currentReproductionCost(config, livingPopulation));
}

function exponentialPressure(pressure: number, curve: number) {
  const boundedPressure = clamp(pressure, 0, 1);
  if (curve <= 0.000001) return boundedPressure;
  const denominator = Math.exp(curve) - 1;
  if (denominator <= 0 || !Number.isFinite(denominator)) return boundedPressure;
  return clamp((Math.exp(curve * boundedPressure) - 1) / denominator, 0, 1);
}

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
