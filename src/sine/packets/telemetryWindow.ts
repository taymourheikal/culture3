import type { LeanTelemetrySample } from "../marketWorkerProtocol";
import { downsampleByTick, firstSampleAtOrAfter } from "./seriesWindow";

export const TELEMETRY_SAMPLE_LIMIT = 180;

export function createTelemetryWindow(telemetry: LeanTelemetrySample[], renderTick: number) {
  const firstTick = telemetry[0]?.tick ?? 1;
  const lastTelemetryTick = telemetry.at(-1)?.tick ?? 20;
  const lastTick = Math.max(20, lastTelemetryTick, Math.floor(renderTick));
  const populationMax = Math.max(20, ...telemetry.map((sample) => sample.population));
  const lossMax = Math.max(0.1, ...telemetry.map((sample) => sample.rollingLoss)) * 1.18;
  const payoffAbsMax = Math.max(0.1, ...telemetry.map((sample) => Math.abs(sample.rollingAveragePayoff))) * 1.18;
  const resolvedVolumeMax = Math.max(1, ...telemetry.map((sample) => sample.resolvedVolume));
  const cumulativePayoffs = telemetry.map((sample) => sample.cumulativeNetPayoff);
  const cumulativePayoffMin = Math.min(0, ...cumulativePayoffs);
  const cumulativePayoffMax = Math.max(0, ...cumulativePayoffs);

  if (telemetry.length <= TELEMETRY_SAMPLE_LIMIT) {
    return {
      telemetrySamples: telemetry.map(toLeanTelemetry),
      telemetryStartTick: firstTick,
      telemetryEndTick: lastTick,
      telemetryPopulationMax: populationMax,
      telemetryLossMax: lossMax,
      telemetryPayoffAbsMax: payoffAbsMax,
      telemetryResolvedVolumeMax: resolvedVolumeMax,
      telemetryCumulativePayoffMin: cumulativePayoffMin,
      telemetryCumulativePayoffMax: cumulativePayoffMax,
    };
  }

  const byTick = new Map(telemetry.map((sample) => [sample.tick, sample]));
  const samples = downsampleByTick({
    samples: telemetry,
    firstTick,
    lastTick,
    limit: TELEMETRY_SAMPLE_LIMIT,
    cloneSample: toLeanTelemetry,
    sampleAtTick: (candidates, tick) => byTick.get(tick) ?? firstSampleAtOrAfter(candidates, tick),
  });
  return {
    telemetrySamples: samples,
    telemetryStartTick: firstTick,
    telemetryEndTick: lastTick,
    telemetryPopulationMax: populationMax,
    telemetryLossMax: lossMax,
    telemetryPayoffAbsMax: payoffAbsMax,
    telemetryResolvedVolumeMax: resolvedVolumeMax,
    telemetryCumulativePayoffMin: cumulativePayoffMin,
    telemetryCumulativePayoffMax: cumulativePayoffMax,
  };
}

function toLeanTelemetry(sample: LeanTelemetrySample): LeanTelemetrySample {
  return {
    tick: sample.tick,
    population: sample.population,
    rollingLoss: sample.rollingLoss,
    rollingHitRate: finiteOr(sample.rollingHitRate, 0),
    rollingAveragePayoff: finiteOr(sample.rollingAveragePayoff, 0),
    resolvedVolume: finiteOr(sample.resolvedVolume, 0),
    totalResolved: finiteOr(sample.totalResolved, 0),
    cumulativeNetPayoff: finiteOr(sample.cumulativeNetPayoff, 0),
  };
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
