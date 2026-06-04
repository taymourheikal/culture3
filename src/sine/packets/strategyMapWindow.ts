import type { StrategyMapWindow } from "../marketWorkerProtocol";

export function createEmptyStrategyMapWindow(renderTick: number, skippedReason?: "population_limit", sampleIntervalTicks = 250): StrategyMapWindow {
  return {
    tick: Math.max(0, Math.floor(renderTick)),
    status: skippedReason ? "skipped" : "waiting",
    skippedReason,
    populationSize: 0,
    sampleIntervalTicks,
    points: [],
    clusters: [],
  };
}
