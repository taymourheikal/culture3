import type { LeanTelemetrySample } from "../marketWorkerProtocol";
import { downsampleByTick, firstSampleAtOrAfter } from "./seriesWindow";

export const TELEMETRY_SAMPLE_LIMIT = 180;

export function createTelemetryWindow(telemetry: LeanTelemetrySample[], renderTick: number) {
  const firstTick = telemetry[0]?.tick ?? 1;
  const lastTelemetryTick = telemetry.at(-1)?.tick ?? 20;
  const lastTick = Math.max(20, lastTelemetryTick, Math.floor(renderTick));
  const populationMax = Math.max(20, ...telemetry.map((sample) => sample.population));
  const lossMax = Math.max(0.1, ...telemetry.map((sample) => sample.rollingLoss)) * 1.18;

  if (telemetry.length <= TELEMETRY_SAMPLE_LIMIT) {
    return {
      telemetrySamples: telemetry.map(toLeanTelemetry),
      telemetryStartTick: firstTick,
      telemetryEndTick: lastTick,
      telemetryPopulationMax: populationMax,
      telemetryLossMax: lossMax,
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
  };
}

function toLeanTelemetry(sample: LeanTelemetrySample): LeanTelemetrySample {
  return {
    tick: sample.tick,
    population: sample.population,
    rollingLoss: sample.rollingLoss,
  };
}
