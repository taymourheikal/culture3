import { buildTimelineSamples, getTimelineSampleAtRenderTick } from "../marketTimeline";
import type { ChartFoodMarker, MarketChartPacket, MarketWorkerSessionId } from "../marketWorkerProtocol";
import { getVisibleSpawnerFoods } from "../spawnerSimulation";
import type { MarketSimulationState } from "../simulationRuntime";
import { createTelemetryWindow } from "./telemetryWindow";
import { createEmptyUniquenessTelemetryWindow, type UniquenessTelemetryWindow } from "./uniquenessTelemetryWindow";

export const CHART_TICKS_VISIBLE = 89;
export const CHART_SAMPLE_INTERVAL_TICKS = 0.5;

export function createMarketChartPacket({
  sessionId,
  simulation,
  version,
  centerTick,
  uniquenessWindow,
}: {
  sessionId: MarketWorkerSessionId;
  simulation: MarketSimulationState;
  version: number;
  centerTick?: number;
  uniquenessWindow?: UniquenessTelemetryWindow;
}): MarketChartPacket {
  const requestedTick = centerTick ?? simulation.timeline.tick;
  const renderTick = Math.max(0, Math.min(requestedTick, simulation.timeline.tick, simulation.world.tick));
  const current = getTimelineSampleAtRenderTick(simulation.timeline, renderTick);
  const visibleSignalSamples = buildAnchoredSignalSamples(simulation, renderTick);
  return {
    sessionId,
    version,
    renderTick,
    marketSource: simulation.timeline.source,
    currentSignal: current.signal,
    currentNoise: current.noise,
    currentPrice: current.price,
    sourceTimestamp: current.sourceTimestamp,
    sourceDatetime: current.sourceDatetime,
    ticksVisible: CHART_TICKS_VISIBLE,
    signalSamples: visibleSignalSamples.map((sample) => ({
      tick: sample.tick,
      signal: sample.signal,
      noise: sample.noise,
      parameters: sample.parameters,
      price: sample.price,
      sourceTimestamp: sample.sourceTimestamp,
      sourceDatetime: sample.sourceDatetime,
    })),
    priceSamples:
      simulation.timeline.source === "generated"
        ? undefined
        : visibleSignalSamples
            .filter((sample) => sample.price !== undefined)
            .map((sample) => ({
              tick: sample.tick,
              price: sample.price!,
              sourceTimestamp: sample.sourceTimestamp,
              sourceDatetime: sample.sourceDatetime,
            })),
    visibleFoods: getVisibleSpawnerFoods(simulation.world, renderTick, CHART_TICKS_VISIBLE).map(toChartFoodMarker),
    ...createTelemetryWindow(simulation.world.telemetry, simulation.world.tick),
    ...(uniquenessWindow ?? createEmptyUniquenessTelemetryWindow(simulation.world.tick)),
  };
}

function buildAnchoredSignalSamples(simulation: MarketSimulationState, centerTick: number) {
  const count = Math.ceil(CHART_TICKS_VISIBLE / CHART_SAMPLE_INTERVAL_TICKS) + 1;
  return buildTimelineSamples(simulation.timeline, centerTick, CHART_TICKS_VISIBLE, count);
}

function toChartFoodMarker(food: ReturnType<typeof getVisibleSpawnerFoods>[number]): ChartFoodMarker {
  return {
    id: food.id,
    creatorSpawnerId: food.creatorSpawnerId,
    creatorLineageId: food.creatorLineageId,
    spawnTick: food.spawnTick,
    resolveTick: food.resolveTick,
    direction: food.direction,
    strength: food.strength,
    horizonTicks: food.horizonTicks,
    entrySignal: food.entrySignal,
    exitSignal: food.exitSignal,
    payoff: food.payoff,
    status: food.status,
  };
}
