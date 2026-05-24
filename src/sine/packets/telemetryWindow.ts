import type { LeanTelemetrySample } from "../marketWorkerProtocol";

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

  const tickStep = Math.ceil((lastTick - firstTick) / Math.max(1, TELEMETRY_SAMPLE_LIMIT - 1));
  const samples: LeanTelemetrySample[] = [];
  const byTick = new Map(telemetry.map((sample) => [sample.tick, sample]));
  const first = telemetry[0];
  if (first) samples.push(toLeanTelemetry(first));

  for (let tick = firstTickAtOrAfter(firstTick, tickStep); tick < lastTick; tick += tickStep) {
    const sample = byTick.get(tick) ?? firstSampleAtOrAfter(telemetry, tick);
    if (sample && samples.at(-1)?.tick !== sample.tick) samples.push(toLeanTelemetry(sample));
  }

  const last = telemetry.at(-1);
  if (last && samples.at(-1)?.tick !== last.tick) samples.push(toLeanTelemetry(last));
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

function firstTickAtOrAfter(tick: number, step: number) {
  return Math.ceil(tick / step) * step;
}

function firstSampleAtOrAfter(samples: LeanTelemetrySample[], tick: number) {
  let low = 0;
  let high = samples.length - 1;
  let match: LeanTelemetrySample | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sample = samples[middle];
    if (!sample) break;
    if (sample.tick >= tick) {
      match = sample;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return match;
}
