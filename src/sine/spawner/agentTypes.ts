import type { SpawnerGenome } from "./genomeTypes";
import type { SpawnerLearnedState, SpawnerTraceStore } from "./plasticity";

export type SpawnerAgent = {
  id: number;
  lineageId: number;
  generation: number;
  birthTick: number;
  parentSpawnerId?: number;
  genome: SpawnerGenome;
  learnedState: SpawnerLearnedState;
  traceStore: SpawnerTraceStore;
  hiddenState: Record<number, number>;
  energy: number;
  health: number;
  ageTicks: number;
  cooldownTicks: number;
  spawnedCount: number;
  resolvedCount: number;
  wins: number;
  losses: number;
  totalPayoff: number;
  children: number;
  lastAction: "long" | "short" | "wait";
  recentPayoffs: number[];
};
