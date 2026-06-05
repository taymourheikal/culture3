import type { BrainTraceInstrumentation } from "../../src/sine/spawner/worldBrainEvaluation";
import { round } from "./cli";

export function createTraceInstrumentation(): BrainTraceInstrumentation {
  return {
    evaluatedAgents: 0,
    firstPassBatches: 0,
    firstPassMs: 0,
    waitActions: 0,
    longActions: 0,
    shortActions: 0,
    reproductionTraces: 0,
    optimizedTraceMaterializations: 0,
    optimizedTraceMaterializationMs: 0,
    fallbackTraceEvaluations: 0,
    fallbackTraceMs: 0,
  };
}

export function summarizeTraceInstrumentation(stats: BrainTraceInstrumentation) {
  const actionCount = stats.longActions + stats.shortActions;
  return {
    ...stats,
    actionCount,
    firstPassMsPerAgent: round(stats.evaluatedAgents > 0 ? stats.firstPassMs / stats.evaluatedAgents : 0),
    optimizedTraceMaterializationMsPerEvaluation: round(
      stats.optimizedTraceMaterializations > 0 ? stats.optimizedTraceMaterializationMs / stats.optimizedTraceMaterializations : 0,
    ),
    fallbackTraceMsPerEvaluation: round(stats.fallbackTraceEvaluations > 0 ? stats.fallbackTraceMs / stats.fallbackTraceEvaluations : 0),
  };
}
