import type { SpawnerAgent } from "../spawnerSimulation";

export type SeedBankReseedPolicy = {
  preserved: {
    genome: SpawnerAgent["genome"];
    hiddenState: SpawnerAgent["hiddenState"];
    learnedState: SpawnerAgent["learnedState"];
  };
  resetRuntimeState: {
    energy: true;
    health: true;
    cooldownTicks: true;
    openTrades: true;
    traceStore: true;
  };
};

export function seedBankReseedPolicy(snapshot: SpawnerAgent): SeedBankReseedPolicy {
  return {
    preserved: {
      genome: snapshot.genome,
      hiddenState: snapshot.hiddenState,
      learnedState: snapshot.learnedState,
    },
    resetRuntimeState: {
      energy: true,
      health: true,
      cooldownTicks: true,
      openTrades: true,
      traceStore: true,
    },
  };
}

