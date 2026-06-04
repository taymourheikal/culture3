import type { SelectedSpawnerTimeline } from "../marketWorkerProtocol";
import { getTimelineSampleAtRenderTick } from "../marketTimeline";
import { createFoodRuntimeIndex, createSpawnerRuntimeIndex, type FoodRuntimeIndex, type SpawnerRuntimeIndex } from "../spawner/runtimeIndex";
import type { SpawnerAgent } from "../spawnerSimulation";
import type { createSelectedSpawnerTimelineService } from "./selectedSpawnerTimelineService";
import type { createStrategyMapService } from "./strategyMapService";
import type { createUniquenessRuntimeService } from "./uniquenessRuntimeService";
import type { WorkerPacketPosterState } from "./workerPacketPoster";

export type PacketRuntimeContext = ReturnType<typeof createPacketRuntimeContext>;

export function createPacketRuntimeContext({
  state,
  uniquenessRuntime,
  strategyMap,
  selectedSpawnerTimeline,
}: {
  state: WorkerPacketPosterState;
  uniquenessRuntime: ReturnType<typeof createUniquenessRuntimeService>;
  strategyMap: ReturnType<typeof createStrategyMapService>;
  selectedSpawnerTimeline: ReturnType<typeof createSelectedSpawnerTimelineService>;
}) {
  let foodIndex: FoodRuntimeIndex | null = null;
  let spawnerIndex: SpawnerRuntimeIndex | null = null;
  let selectedSpawner: SpawnerAgent | null | undefined;
  let selectedTimeline: SelectedSpawnerTimeline | null | undefined;
  let uniquenessWindow: ReturnType<typeof uniquenessRuntime.window> | null = null;
  let strategyMapWindow: ReturnType<typeof strategyMap.window> | null = null;
  const chartRenderTick = Math.max(0, Math.min(state.targetTick, state.simulation.timeline.tick, state.simulation.world.tick));
  const statsRenderTick = Math.min(state.simulation.timeline.tick, state.simulation.world.tick);
  const getFoodIndex = () => {
    if (!foodIndex) foodIndex = createFoodRuntimeIndex(state.simulation.world.foods);
    return foodIndex;
  };
  const getSpawnerIndex = () => {
    if (!spawnerIndex) spawnerIndex = createSpawnerRuntimeIndex(state.simulation.world.spawners, state.activeSpawnerConfig);
    return spawnerIndex;
  };
  const ensureRosterUniquenessScores = () => {
    uniquenessRuntime.ensureRosterScores(state.simulation, state.selectedSpawnerId, getFoodIndex().pendingByCreatorId);
    return uniquenessRuntime.scores();
  };

  return {
    state,
    chartRenderTick,
    statsRenderTick,
    prepareForPacketBatch() {
      ensureRosterUniquenessScores();
      strategyMap.prepare(state.simulation);
    },
    chartCurrentSample: () => getTimelineSampleAtRenderTick(state.simulation.timeline, chartRenderTick),
    statsCurrentSample: () => getTimelineSampleAtRenderTick(state.simulation.timeline, statsRenderTick),
    foodIndex: getFoodIndex,
    spawnerIndex: getSpawnerIndex,
    selectedSpawner() {
      if (selectedSpawner !== undefined) return selectedSpawner;
      selectedSpawner =
        state.selectedSpawnerId === null
          ? null
          : getSpawnerIndex().byId.get(state.selectedSpawnerId) ?? null;
      return selectedSpawner;
    },
    uniquenessWindow() {
      if (!uniquenessWindow) uniquenessWindow = uniquenessRuntime.window(state.simulation.world.tick);
      return uniquenessWindow;
    },
    ensureRosterUniquenessScores() {
      return ensureRosterUniquenessScores();
    },
    uniquenessScores() {
      return uniquenessRuntime.scores();
    },
    lastUniquenessTick() {
      return uniquenessRuntime.lastTick();
    },
    strategyMapWindow() {
      if (!strategyMapWindow) strategyMapWindow = strategyMap.window(state.simulation.world.tick);
      return strategyMapWindow;
    },
    selectedSpawnerTimeline() {
      if (selectedTimeline !== undefined) return selectedTimeline;
      selectedTimeline = selectedSpawnerTimeline.sample(state.simulation, getFoodIndex(), getSpawnerIndex());
      return selectedTimeline;
    },
  };
}
