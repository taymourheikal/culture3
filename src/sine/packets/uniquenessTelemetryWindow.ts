import type { LeanSelectedUniquenessSample, LeanUniquenessTelemetrySample } from "../marketWorkerProtocol";

export const UNIQUENESS_TELEMETRY_SAMPLE_LIMIT = 180;

export type UniquenessTelemetryWindow = {
  uniquenessSamples: LeanUniquenessTelemetrySample[];
  selectedSpawnerUniquenessSamples: LeanSelectedUniquenessSample[];
  uniquenessStartTick: number;
  uniquenessEndTick: number;
  uniquenessRawDistanceMax: number;
  uniquenessSkippedReason?: "population_limit";
};

export function createEmptyUniquenessTelemetryWindow(renderTick: number, skippedReason?: "population_limit"): UniquenessTelemetryWindow {
  return {
    uniquenessSamples: [],
    selectedSpawnerUniquenessSamples: [],
    uniquenessStartTick: 1,
    uniquenessEndTick: Math.max(20, Math.floor(renderTick)),
    uniquenessRawDistanceMax: 1,
    uniquenessSkippedReason: skippedReason,
  };
}

export function createUniquenessTelemetryWindow({
  aggregateSamples,
  selectedSamples,
  renderTick,
  skippedReason,
}: {
  aggregateSamples: LeanUniquenessTelemetrySample[];
  selectedSamples: LeanSelectedUniquenessSample[];
  renderTick: number;
  skippedReason?: "population_limit";
}): UniquenessTelemetryWindow {
  if (aggregateSamples.length === 0) return createEmptyUniquenessTelemetryWindow(renderTick, skippedReason);

  const firstTick = aggregateSamples[0]?.tick ?? 1;
  const lastAggregateTick = aggregateSamples.at(-1)?.tick ?? 20;
  const lastTick = Math.max(20, lastAggregateTick, Math.floor(renderTick));
  const uniquenessSamples = downsampleByTick(aggregateSamples, firstTick, lastTick, UNIQUENESS_TELEMETRY_SAMPLE_LIMIT);
  const selectedSpawnerUniquenessSamples = downsampleByTick(
    selectedSamples.filter((sample) => sample.tick >= firstTick && sample.tick <= lastTick),
    firstTick,
    lastTick,
    UNIQUENESS_TELEMETRY_SAMPLE_LIMIT,
  );
  const maxRawDistance = Math.max(
    1,
    ...uniquenessSamples.flatMap((sample) => [sample.medianRawDistance, sample.p25RawDistance, sample.p75RawDistance]),
    ...selectedSpawnerUniquenessSamples.map((sample) => sample.rawDistance),
  );

  return {
    uniquenessSamples,
    selectedSpawnerUniquenessSamples,
    uniquenessStartTick: firstTick,
    uniquenessEndTick: lastTick,
    uniquenessRawDistanceMax: maxRawDistance * 1.18,
    uniquenessSkippedReason: skippedReason,
  };
}

function downsampleByTick<T extends { tick: number }>(samples: T[], firstTick: number, lastTick: number, limit: number): T[] {
  if (samples.length <= limit) return samples.map(cloneSample);

  const tickStep = Math.ceil((lastTick - firstTick) / Math.max(1, limit - 1));
  const result: T[] = [];
  const first = samples[0];
  if (first) result.push(cloneSample(first));

  for (let tick = firstTickAtOrAfter(firstTick, tickStep); tick < lastTick; tick += tickStep) {
    const sample = firstSampleAtOrAfter(samples, tick);
    if (sample && result.at(-1)?.tick !== sample.tick) result.push(cloneSample(sample));
  }

  const last = samples.at(-1);
  if (last && result.at(-1)?.tick !== last.tick) result.push(cloneSample(last));
  return result;
}

function cloneSample<T extends { tick: number }>(sample: T): T {
  return { ...sample };
}

function firstTickAtOrAfter(tick: number, step: number) {
  return Math.ceil(tick / step) * step;
}

function firstSampleAtOrAfter<T extends { tick: number }>(samples: T[], tick: number) {
  let low = 0;
  let high = samples.length - 1;
  let match: T | undefined;
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
