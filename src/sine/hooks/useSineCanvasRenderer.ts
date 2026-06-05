import { useEffect, type RefObject } from "react";
import { drawBtcPriceChart } from "../charts/btcPriceChart";
import { drawNoiseChart } from "../charts/noiseChart";
import { drawParameterChart } from "../charts/parameterChart";
import { drawSignalChart } from "../charts/signalChart";
import { drawStrategyMapChart, type StrategyMapViewOptions } from "../charts/strategyMapChart";
import { drawTelemetryChart } from "../charts/telemetryChart";
import { drawTradingPerformanceChart } from "../charts/tradingPerformanceChart";
import { drawUniquenessChart } from "../charts/uniquenessChart";
import type { MarketChartPacket, MarketRunState } from "../marketWorkerProtocol";

type DrawRefs = {
  priceCanvasRef: RefObject<HTMLCanvasElement | null>;
  noiseCanvasRef: RefObject<HTMLCanvasElement | null>;
  parameterCanvasRef: RefObject<HTMLCanvasElement | null>;
  telemetryCanvasRef: RefObject<HTMLCanvasElement | null>;
  tradingPerformanceCanvasRef: RefObject<HTMLCanvasElement | null>;
  uniquenessCanvasRef: RefObject<HTMLCanvasElement | null>;
  strategyMapCanvasRef: RefObject<HTMLCanvasElement | null>;
  latestChartPacketRef: RefObject<MarketChartPacket | null>;
  selectedSpawnerIdRef: RefObject<number | null>;
  strategyMapViewOptions: StrategyMapViewOptions;
  strategyMapViewKey: string;
  chartRevision: number;
  runState: MarketRunState;
  selectedSpawnerId: number | null;
  lastCanvasDrawRef: RefObject<{ version: number; renderTick: number; selectedSpawnerId: number | null; strategyMapViewKey: string }>;
};

export function useSineCanvasRenderer({
  priceCanvasRef,
  noiseCanvasRef,
  parameterCanvasRef,
  telemetryCanvasRef,
  tradingPerformanceCanvasRef,
  uniquenessCanvasRef,
  strategyMapCanvasRef,
  latestChartPacketRef,
  selectedSpawnerIdRef,
  strategyMapViewOptions,
  strategyMapViewKey,
  chartRevision,
  runState,
  selectedSpawnerId,
  lastCanvasDrawRef,
}: DrawRefs) {
  useEffect(() => {
    let animationId: number | null = null;
    const shouldLoop = () => runState === "running" && !document.hidden;
    const schedule = () => {
      if (animationId === null) animationId = requestAnimationFrame(draw);
    };
    const draw = () => {
      animationId = null;
      if (document.hidden) return;
      drawIfChanged({
        priceCanvasRef,
        noiseCanvasRef,
        parameterCanvasRef,
        telemetryCanvasRef,
        tradingPerformanceCanvasRef,
        uniquenessCanvasRef,
        strategyMapCanvasRef,
        latestChartPacketRef,
        selectedSpawnerIdRef,
        strategyMapViewOptions,
        strategyMapViewKey,
        chartRevision,
        runState,
        selectedSpawnerId,
        lastCanvasDrawRef,
      });
      if (shouldLoop()) schedule();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [
    chartRevision,
    lastCanvasDrawRef,
    latestChartPacketRef,
    noiseCanvasRef,
    parameterCanvasRef,
    priceCanvasRef,
    selectedSpawnerIdRef,
    selectedSpawnerId,
    telemetryCanvasRef,
    tradingPerformanceCanvasRef,
    uniquenessCanvasRef,
    strategyMapCanvasRef,
    strategyMapViewOptions,
    strategyMapViewKey,
    runState,
  ]);

  useEffect(() => {
    const resize = () => {
      drawCanvases({
        priceCanvasRef,
        noiseCanvasRef,
        parameterCanvasRef,
        telemetryCanvasRef,
        tradingPerformanceCanvasRef,
        uniquenessCanvasRef,
        strategyMapCanvasRef,
        latestChartPacketRef,
        selectedSpawnerIdRef,
        strategyMapViewOptions,
        strategyMapViewKey,
        chartRevision,
        runState,
        selectedSpawnerId,
        lastCanvasDrawRef,
      });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [
    lastCanvasDrawRef,
    latestChartPacketRef,
    noiseCanvasRef,
    parameterCanvasRef,
    priceCanvasRef,
    selectedSpawnerIdRef,
    selectedSpawnerId,
    telemetryCanvasRef,
    tradingPerformanceCanvasRef,
    uniquenessCanvasRef,
    strategyMapCanvasRef,
    strategyMapViewOptions,
    strategyMapViewKey,
    chartRevision,
    runState,
  ]);
}

function drawIfChanged(refs: DrawRefs) {
  const packet = refs.latestChartPacketRef.current;
  if (!packet) return;
  const selectedSpawnerId = refs.selectedSpawnerIdRef.current;
  const lastDraw = refs.lastCanvasDrawRef.current;
  if (
    lastDraw.version === packet.version &&
    lastDraw.renderTick === packet.renderTick &&
    lastDraw.selectedSpawnerId === selectedSpawnerId &&
    lastDraw.strategyMapViewKey === refs.strategyMapViewKey
  ) {
    return;
  }
  drawCanvases(refs);
}

function drawCanvases({
  priceCanvasRef,
  noiseCanvasRef,
  parameterCanvasRef,
  telemetryCanvasRef,
  tradingPerformanceCanvasRef,
  uniquenessCanvasRef,
  strategyMapCanvasRef,
  latestChartPacketRef,
  selectedSpawnerIdRef,
  strategyMapViewOptions,
  strategyMapViewKey,
  lastCanvasDrawRef,
}: DrawRefs) {
  const packet = latestChartPacketRef.current;
  if (!packet) return;
  const selectedSpawnerId = selectedSpawnerIdRef.current;
  if (priceCanvasRef.current) drawSignalChart(priceCanvasRef.current, packet, selectedSpawnerId);
  if (packet.marketSource === "generated") {
    if (noiseCanvasRef.current) drawNoiseChart(noiseCanvasRef.current, packet);
    if (parameterCanvasRef.current) drawParameterChart(parameterCanvasRef.current, packet);
  } else if (noiseCanvasRef.current) {
    drawBtcPriceChart(noiseCanvasRef.current, packet);
  }
  if (telemetryCanvasRef.current) {
    drawTelemetryChart(
      telemetryCanvasRef.current,
      packet.telemetrySamples,
      packet.telemetryStartTick,
      packet.telemetryEndTick,
      packet.telemetryPopulationMax,
      packet.telemetryLossMax,
    );
  }
  if (tradingPerformanceCanvasRef.current) {
    drawTradingPerformanceChart(
      tradingPerformanceCanvasRef.current,
      packet.telemetrySamples,
      packet.telemetryStartTick,
      packet.telemetryEndTick,
      packet.telemetryPayoffAbsMax,
      packet.telemetryResolvedVolumeMax,
      packet.telemetryCumulativePayoffMin,
      packet.telemetryCumulativePayoffMax,
    );
  }
  if (uniquenessCanvasRef.current) {
    drawUniquenessChart(
      uniquenessCanvasRef.current,
      packet.uniquenessSamples,
      packet.selectedSpawnerUniquenessSamples,
      packet.uniquenessStartTick,
      packet.uniquenessEndTick,
      packet.uniquenessRawDistanceMax,
      packet.uniquenessSkippedReason,
    );
  }
  if (strategyMapCanvasRef.current) {
    drawStrategyMapChart(strategyMapCanvasRef.current, packet.strategyMap, selectedSpawnerId, strategyMapViewOptions);
  }
  lastCanvasDrawRef.current = { version: packet.version, renderTick: packet.renderTick, selectedSpawnerId, strategyMapViewKey };
}
