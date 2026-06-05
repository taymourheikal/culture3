import type { SpawnerConfig } from "../../src/sine/spawnerSimulation";

export type SineBenchmarkScenario = {
  name: string;
  config: Partial<SpawnerConfig>;
  maxSpawners?: (population: number) => number;
};

export function sineBenchmarkScenarios(): SineBenchmarkScenario[] {
  return [
    { name: "baseline", config: {} },
    {
      name: "mostly-waiting",
      config: {
        defaultSpawnThreshold: 2,
        initialReproductionOutputBias: -20,
      },
    },
    {
      name: "high-action",
      config: {
        defaultSpawnThreshold: 0,
        defaultMinSignalStrength: 0,
        initialCooldownMaxTicks: 0,
        cooldownBaseTicksInitialMin: 0,
        cooldownBaseTicksInitialMax: 0,
        cooldownOutputMultiplierTicks: 0,
        initialEnergyMin: 100,
        initialEnergyMax: 100,
        initialReproductionOutputBias: -20,
      },
    },
    {
      name: "high-reproduction",
      maxSpawners: (population) => population * 2,
      config: {
        initialEnergyMin: 220,
        initialEnergyMax: 220,
        reproductionEnergy: 0,
        reproductionCost: 0,
        reproductionCostMinMultiplier: 0,
        reproductionCostMaxMultiplier: 0,
        initialReproductionOutputBias: 2,
        defaultSpawnThreshold: 2,
      },
    },
  ];
}
