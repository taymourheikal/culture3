import type { SeededRng } from "./rng";
import { finiteOr } from "./sanitize";

export function mutationChance(rate: number) {
  return Math.max(0, Math.min(1, finiteOr(rate, 0)));
}

export function mutateNumberByRate(value: number, chance: number, stdDev: number, rng: SeededRng) {
  return rng.next() < chance ? value + rng.gaussian(0, Math.max(0, finiteOr(stdDev, 0))) : value;
}

export function mutateIntegerByRate(value: number, chance: number, stdDev: number, rng: SeededRng) {
  return mutateNumberByRate(value, chance, stdDev, rng);
}
