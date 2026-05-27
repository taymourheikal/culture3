import type { SpawnerAgent } from "./types";
import { finiteOr, nonNegativeInteger } from "../numeric";

export type SpawnerPerformanceSource = Partial<
  Pick<
    SpawnerAgent,
    "resolvedCount" | "wins" | "losses" | "totalPayoff" | "recentPayoffs" | "children" | "spawnedCount"
  >
> & {
  learnedDeltaNorm?: number;
  learningUpdateCount?: number;
  reproductionLearningCount?: number;
  plasticityLearningRateMean?: number;
};

export function summarizeSpawnerPerformance(source: SpawnerPerformanceSource) {
  const resolvedCount = nonNegativeInteger(source.resolvedCount, 0);
  const wins = nonNegativeInteger(source.wins, 0);
  const losses = nonNegativeInteger(source.losses, 0);
  const totalPayoff = finiteOr(source.totalPayoff, 0);
  const recentPayoffs = Array.isArray(source.recentPayoffs) ? source.recentPayoffs.map((payoff) => finiteOr(payoff, 0)) : [];
  return {
    spawnedCount: nonNegativeInteger(source.spawnedCount, 0),
    resolvedCount,
    wins,
    losses,
    totalPayoff,
    children: nonNegativeInteger(source.children, 0),
    hitRate: resolvedCount > 0 ? wins / resolvedCount : 0,
    averagePayoff: resolvedCount > 0 ? totalPayoff / resolvedCount : 0,
    recentAveragePayoff: recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / Math.max(1, recentPayoffs.length),
    learnedDeltaNorm: finiteOr(source.learnedDeltaNorm, 0),
    learningUpdateCount: nonNegativeInteger(source.learningUpdateCount, 0),
    reproductionLearningCount: nonNegativeInteger(source.reproductionLearningCount, 0),
    plasticityLearningRateMean: finiteOr(source.plasticityLearningRateMean, 0),
  };
}
