import { appendMarketCandles, candleBufferRemaining, latestLoadedCandle, type MarketCandle } from "../marketTimeline";
import { isBtcSource, type MarketRuntimeConfig } from "../marketRuntimeConfig";
import { type SpawnerConfig } from "../spawnerSimulation";
import { createCandleSimulationState, createSimulationState, type MarketSimulationState } from "../simulationRuntime";

export type HeadlessCandleLoadResult = {
  candles: MarketCandle[];
  snappedStartTimestamp?: number;
  snappedStartDatetime?: string;
};

export type HeadlessCandleLoader = (config: MarketRuntimeConfig, start: string, limit: number) => Promise<HeadlessCandleLoadResult>;

const CANDLE_LOAD_LIMIT = 5000;
const CANDLE_BUFFER_LOW_WATER = 1000;

export async function createHeadlessSimulation({
  marketConfig,
  spawnerConfig,
  seed,
  candleLoader,
}: {
  marketConfig: MarketRuntimeConfig;
  spawnerConfig: SpawnerConfig;
  seed: number;
  candleLoader?: HeadlessCandleLoader;
}) {
  if (!isBtcSource(marketConfig.source)) {
    return createSimulationState(marketConfig, spawnerConfig, { seed });
  }
  if (!candleLoader) throw new Error(`Headless source ${marketConfig.source} requires a candle loader`);
  const response = await candleLoader(marketConfig, marketConfig.playback.startDateTime, CANDLE_LOAD_LIMIT);
  if (response.candles.length === 0) throw new Error(`No candles loaded for ${marketConfig.source}`);
  const activeMarketConfig = {
    ...marketConfig,
    playback: {
      ...marketConfig.playback,
      startDateTime: response.snappedStartDatetime ?? marketConfig.playback.startDateTime,
    },
  };
  return createCandleSimulationState({
    marketConfig: activeMarketConfig,
    spawnerConfig,
    candles: response.candles,
    snappedStartTimestamp: response.snappedStartTimestamp,
    snappedStartDatetime: response.snappedStartDatetime,
    seed,
  });
}

export async function maybeLoadMoreHeadlessCandles(
  simulation: MarketSimulationState,
  marketConfig: MarketRuntimeConfig,
  candleLoader: HeadlessCandleLoader | undefined,
) {
  if (!candleLoader || simulation.timeline.candleEndReached || candleBufferRemaining(simulation.timeline) > CANDLE_BUFFER_LOW_WATER) return;
  const latest = latestLoadedCandle(simulation.timeline);
  if (!latest?.timestamp) return;
  const response = await candleLoader(marketConfig, String(latest.timestamp + 1), CANDLE_LOAD_LIMIT);
  if (response.candles.length > 0) appendMarketCandles(simulation.timeline, response.candles);
}
