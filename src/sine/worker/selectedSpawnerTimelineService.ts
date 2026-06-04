import type { SelectedSpawnerTimeline, SelectedSpawnerTimelineSample } from "../marketWorkerProtocol";
import { finiteOr } from "../numeric";
import { learnedStateNorm } from "../spawner/plasticity";
import { createFoodRuntimeIndex, pendingFoodCountForCreator, type FoodRuntimeIndex, type SpawnerRuntimeIndex } from "../spawner/runtimeIndex";
import type { SpawnerAgent } from "../spawner/types";
import type { MarketSimulationState } from "../simulationRuntime";

export const SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT = 181;

type SpawnerAction = SpawnerAgent["lastAction"];
type ActionCounts = Record<SpawnerAction, number>;

export function createSelectedSpawnerTimelineService() {
  let selectedSpawnerId: number | null = null;
  let samples: SelectedSpawnerTimelineSample[] = [];
  let actionWindow: SpawnerAction[] = [];
  let actionCounts: ActionCounts = emptyActionCounts();
  let lastSampleTick: number | null = null;

  const clearSamples = () => {
    samples = [];
    actionWindow = [];
    actionCounts = emptyActionCounts();
    lastSampleTick = null;
  };

  return {
    setSelectedSpawner(spawnerId: number | null) {
      const nextId = spawnerId !== null && Number.isFinite(spawnerId) ? Math.floor(spawnerId) : null;
      if (nextId === selectedSpawnerId) return;
      selectedSpawnerId = nextId;
      clearSamples();
    },
    reset() {
      selectedSpawnerId = null;
      clearSamples();
    },
    clearSamples,
    sample(simulation: MarketSimulationState, foodIndex?: FoodRuntimeIndex, spawnerIndex?: SpawnerRuntimeIndex): SelectedSpawnerTimeline | null {
      if (selectedSpawnerId === null) return null;
      const spawner = selectedSpawner(spawnerIndex, simulation, selectedSpawnerId);
      if (spawner && simulation.world.tick !== lastSampleTick) {
        const runtimeFoodIndex = foodIndex ?? createFoodRuntimeIndex(simulation.world.foods);
        appendSample(createTimelineSample(spawner, simulation.world.tick, pendingFoodCountForCreator(runtimeFoodIndex, spawner.id)), spawner.lastAction);
        lastSampleTick = simulation.world.tick;
      }
      return {
        spawnerId: selectedSpawnerId,
        status: spawner ? "alive" : "missing",
        samples: samples.map((sample) => ({ ...sample })),
      };
    },
  };

  function appendSample(sample: SelectedSpawnerTimelineSample, action: SpawnerAction) {
    actionWindow.push(action);
    actionCounts[action] += 1;
    if (actionWindow.length > SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT) {
      const removed = actionWindow.shift();
      if (removed) actionCounts[removed] = Math.max(0, actionCounts[removed] - 1);
    }
    samples.push({ ...sample, ...actionRates(actionCounts, actionWindow.length) });
    if (samples.length > SELECTED_SPAWNER_TIMELINE_SAMPLE_LIMIT) samples.shift();
  }

  function createTimelineSample(spawner: SpawnerAgent, tick: number, openTrades: number): SelectedSpawnerTimelineSample {
    const recentPayoffs = spawner.recentPayoffs.map((payoff) => finiteOr(payoff, 0));
    const recentCount = Math.max(1, recentPayoffs.length);
    const rollingAveragePayoff = recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / recentCount;
    const rollingLoss = recentPayoffs.reduce((sum, payoff) => sum + Math.max(0, -payoff), 0) / recentCount;
    const rollingHitRate = recentPayoffs.filter((payoff) => payoff > 0).length / recentCount;
    return {
      tick: finiteOr(tick, 0),
      rollingHitRate: finiteOr(rollingHitRate, 0),
      rollingAveragePayoff: finiteOr(rollingAveragePayoff, 0),
      rollingLoss: finiteOr(rollingLoss, 0),
      energy: finiteOr(spawner.energy, 0),
      health: finiteOr(spawner.health, 0),
      openTrades: Math.max(0, Math.round(finiteOr(openTrades, 0))),
      longRate: 0,
      shortRate: 0,
      waitRate: 0,
      learnedDeltaNorm: finiteOr(learnedStateNorm(spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta), 0),
    };
  }

}

function selectedSpawner(spawnerIndex: SpawnerRuntimeIndex | undefined, simulation: MarketSimulationState, spawnerId: number) {
  return spawnerIndex?.byId.get(spawnerId) ?? simulation.world.spawners.find((candidate) => candidate.id === spawnerId) ?? null;
}

function emptyActionCounts(): ActionCounts {
  return { long: 0, short: 0, wait: 0 };
}

function actionRates(actionCounts: ActionCounts, actionCount: number) {
  const total = Math.max(1, actionCount);
  return {
    longRate: actionCounts.long / total,
    shortRate: actionCounts.short / total,
    waitRate: actionCounts.wait / total,
  };
}
