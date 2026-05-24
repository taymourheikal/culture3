export type SineSessionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "paused" | "stopped";
  births: number;
  deaths: number;
  stateSnapshots: number;
  latestTick: number;
  settings?: Record<string, unknown>;
};

export type SineSessionAnalysis = {
  session: {
    id: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    settings: Record<string, unknown>;
    spawnerConfig: Record<string, number>;
  };
  telemetry: Array<{ tick: number; population: number; rollingLoss: number }>;
  topSpawners: Array<{
    spawnerId: number;
    lineageId: number;
    generation: number;
    status: string;
    averagePayoff: number;
    hitRate: number;
    children: number;
    resolvedCount: number;
  }>;
  lineages: Array<{
    lineageId: number;
    livingPopulation: number;
    births: number;
    deaths: number;
    maxGeneration: number;
    averagePayoff: number;
  }>;
  outcome: {
    spawned: number;
    resolved: number;
    pending: number;
    wins: number;
    losses: number;
    hitRate: number;
    averagePayoff: number;
  };
  uniqueness: {
    mostUnique: Array<{ spawnerId: number; score: number; rawDistance: number; comparisonTick: number }>;
    mostTypical: Array<{ spawnerId: number; score: number; rawDistance: number; comparisonTick: number }>;
  };
};
