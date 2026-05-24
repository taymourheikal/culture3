import { useEffect, type RefObject } from "react";
import { drawBtcPriceChart } from "../charts/btcPriceChart";
import { drawNoiseChart } from "../charts/noiseChart";
import { drawParameterChart } from "../charts/parameterChart";
import { drawSignalChart } from "../charts/signalChart";
import { drawTelemetryChart } from "../charts/telemetryChart";
import { drawUniquenessChart } from "../charts/uniquenessChart";
import type { MarketChartPacket } from "../marketWorkerProtocol";

type DrawRefs = {
  priceCanvasRef: RefObject<HTMLCanvasElement | null>;
  noiseCanvasRef: RefObject<HTMLCanvasElement | null>;
  parameterCanvasRef: RefObject<HTMLCanvasElement | null>;
  telemetryCanvasRef: RefObject<HTMLCanvasElement | null>;
  uniquenessCanvasRef: RefObject<HTMLCanvasElement | null>;
  latestChartPacketRef: RefObject<MarketChartPacket | null>;
  selectedSpawnerIdRef: RefObject<number | null>;
  lastCanvasDrawRef: RefObject<{ version: number; renderTick: number; selectedSpawnerId: number | null }>;
};

export function useSineCanvasRenderer({
  priceCanvasRef,
  noiseCanvasRef,
  parameterCanvasRef,
  telemetryCanvasRef,
  uniquenessCanvasRef,
  latestChartPacketRef,
  selectedSpawnerIdRef,
  lastCanvasDrawRef,
}: DrawRefs) {
  useEffect(() => {
    let animationId: number | null = null;
    const draw = () => {
      drawIfChanged({
        priceCanvasRef,
        noiseCanvasRef,
        parameterCanvasRef,
        telemetryCanvasRef,
        uniquenessCanvasRef,
        latestChartPacketRef,
        selectedSpawnerIdRef,
        lastCanvasDrawRef,
      });
      animationId = requestAnimationFrame(draw);
    };
    animationId = requestAnimationFrame(draw);
    return () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
    };
  }, [lastCanvasDrawRef, latestChartPacketRef, noiseCanvasRef, parameterCanvasRef, priceCanvasRef, selectedSpawnerIdRef, telemetryCanvasRef, uniquenessCanvasRef]);

  useEffect(() => {
    const resize = () => {
      drawCanvases({
        priceCanvasRef,
        noiseCanvasRef,
        parameterCanvasRef,
        telemetryCanvasRef,
        uniquenessCanvasRef,
        latestChartPacketRef,
        selectedSpawnerIdRef,
        lastCanvasDrawRef,
      });
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [lastCanvasDrawRef, latestChartPacketRef, noiseCanvasRef, parameterCanvasRef, priceCanvasRef, selectedSpawnerIdRef, telemetryCanvasRef, uniquenessCanvasRef]);
}

function drawIfChanged(refs: DrawRefs) {
  const packet = refs.latestChartPacketRef.current;
  if (!packet) return;
  const selectedSpawnerId = refs.selectedSpawnerIdRef.current;
  const lastDraw = refs.lastCanvasDrawRef.current;
  if (lastDraw.version === packet.version && lastDraw.renderTick === packet.renderTick && lastDraw.selectedSpawnerId === selectedSpawnerId) return;
  drawCanvases(refs);
}

function drawCanvases({
  priceCanvasRef,
  noiseCanvasRef,
  parameterCanvasRef,
  telemetryCanvasRef,
  uniquenessCanvasRef,
  latestChartPacketRef,
  selectedSpawnerIdRef,
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
  lastCanvasDrawRef.current = { version: packet.version, renderTick: packet.renderTick, selectedSpawnerId };
}
