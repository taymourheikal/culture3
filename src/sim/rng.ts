export type Rng = {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  chance: (probability: number) => boolean;
  gaussian: (mean?: number, standardDeviation?: number) => number;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  let spare: number | null = null;

  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const gaussian = (mean = 0, standardDeviation = 1) => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return mean + value * standardDeviation;
    }

    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();

    const magnitude = Math.sqrt(-2 * Math.log(u));
    const z0 = magnitude * Math.cos(2 * Math.PI * v);
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return mean + z0 * standardDeviation;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    gaussian,
  };
}
