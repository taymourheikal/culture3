import type { StrategyMapWindow } from "../marketWorkerProtocol";
import { createEmptyStrategyMapWindow } from "../packets/strategyMapWindow";
import { buildPopulationStrategyMap } from "../spawner/strategyMap";
import type { StrategyClusterState } from "../spawner/strategyClustering";
import { preparePopulationFeatureSpace } from "../spawner/populationFeatureSpace";
import type { MarketSimulationState } from "../simulationRuntime";
import { UNIQUENESS_INTERVAL_TICKS } from "./uniquenessInspectionService";

export function createStrategyMapService() {
  let cachedWindow: StrategyMapWindow | null = null;
  let lastTick = Number.NEGATIVE_INFINITY;
  let clusterState: StrategyClusterState | null = null;

  return {
    reset() {
      cachedWindow = null;
      lastTick = Number.NEGATIVE_INFINITY;
      clusterState = null;
    },

    prepare(simulation: MarketSimulationState, force = false) {
      if (simulation.world.spawners.length > simulation.world.config.uniquenessPopulationLimit) {
        cachedWindow = createEmptyStrategyMapWindow(simulation.world.tick, "population_limit", UNIQUENESS_INTERVAL_TICKS);
        lastTick = simulation.world.tick;
        return cachedWindow;
      }
      if (!force && cachedWindow?.status === "ready" && simulation.world.tick - lastTick < UNIQUENESS_INTERVAL_TICKS) return cachedWindow;

      const featureSpace = preparePopulationFeatureSpace(simulation.world.spawners);
      const result = buildPopulationStrategyMap(featureSpace, clusterState);
      clusterState = result.state;
      lastTick = simulation.world.tick;
      cachedWindow = {
        tick: Math.max(0, Math.floor(simulation.world.tick)),
        status: "ready",
        populationSize: simulation.world.spawners.length,
        sampleIntervalTicks: UNIQUENESS_INTERVAL_TICKS,
        points: result.points,
        clusters: result.clusters,
      };
      return cachedWindow;
    },

    window(renderTick: number) {
      return cachedWindow ?? createEmptyStrategyMapWindow(renderTick, undefined, UNIQUENESS_INTERVAL_TICKS);
    },

    lastTick() {
      return lastTick;
    },
  };
}
