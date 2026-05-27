import { appendMarketCandles, candleBufferRemaining, latestLoadedCandle } from "../marketTimeline";
import {
  isBtcSource,
  sameMarketRuntimeConfig,
  type MarketRuntimeConfig,
} from "../marketRuntimeConfig";
import { createCandleSimulationState, type MarketSimulationState } from "../simulationRuntime";
import type { WaveSettings } from "../marketSignal";
import type { SpawnerConfig } from "../spawnerSimulation";
import { fetchMarketCandles } from "./marketDataLoader";

export function createMarketDataCoordinator() {
  let loading = false;
  let requestId = 0;

  return {
    isLoading() {
      return loading;
    },
    invalidateRequests() {
      requestId += 1;
    },
    reset() {
      requestId += 1;
      loading = false;
    },
    async initializeCandleSimulation({
      configForRun,
      spawnerConfigForRun,
      attemptId,
      currentAttemptId,
      pendingMarketConfig,
      setActiveMarketConfig,
      setActiveSpawnerConfig,
      setSimulation,
      setSettings,
    }: {
      configForRun: MarketRuntimeConfig;
      spawnerConfigForRun: SpawnerConfig;
      attemptId: number;
      currentAttemptId: () => number;
      pendingMarketConfig: () => MarketRuntimeConfig;
      setActiveMarketConfig: (config: MarketRuntimeConfig) => void;
      setActiveSpawnerConfig: (config: SpawnerConfig) => void;
      setSimulation: (simulation: MarketSimulationState) => void;
      setSettings: (settings: WaveSettings) => void;
    }) {
      const activeRequestId = requestId + 1;
      requestId = activeRequestId;
      loading = true;
      try {
        const response = await fetchMarketCandles(configForRun, configForRun.playback.startDateTime, 5000);
        if (
          activeRequestId !== requestId ||
          attemptId !== currentAttemptId() ||
          !sameMarketRuntimeConfig(configForRun, pendingMarketConfig())
        ) {
          return { status: "superseded" as const };
        }
        const activeMarketConfig = {
          ...configForRun,
          playback: {
            ...configForRun.playback,
            startDateTime: response.snappedStartDatetime,
          },
        };
        setActiveMarketConfig(activeMarketConfig);
        setActiveSpawnerConfig(spawnerConfigForRun);
        setSimulation(
          createCandleSimulationState({
            marketConfig: activeMarketConfig,
            spawnerConfig: spawnerConfigForRun,
            candles: response.candles,
            snappedStartTimestamp: response.snappedStartTimestamp,
            snappedStartDatetime: response.snappedStartDatetime,
          }),
        );
        setSettings(activeMarketConfig.generated);
        return { status: "ready" as const };
      } finally {
        if (activeRequestId === requestId) loading = false;
      }
    },
    async maybeLoadMoreCandles(activeMarketConfig: MarketRuntimeConfig, simulation: MarketSimulationState) {
      if (!isBtcSource(activeMarketConfig.source) || loading || simulation.timeline.candleEndReached) return;
      if (candleBufferRemaining(simulation.timeline) > 1000) return;
      const latest = latestLoadedCandle(simulation.timeline);
      if (!latest?.timestamp) return;
      const activeRequestId = requestId + 1;
      requestId = activeRequestId;
      loading = true;
      try {
        const response = await fetchMarketCandles(activeMarketConfig, String(latest.timestamp + 1), 5000);
        if (activeRequestId !== requestId) return;
        appendMarketCandles(simulation.timeline, response.candles);
      } finally {
        if (activeRequestId === requestId) loading = false;
      }
    },
  };
}
