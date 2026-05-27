import type { LeanSelectedUniquenessSample, LeanUniquenessTelemetrySample } from "../marketWorkerProtocol";
import { downsampleByTick } from "./seriesWindow";

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
  const uniquenessSamples = downsampleByTick({
    samples: aggregateSamples,
    firstTick,
    lastTick,
    limit: UNIQUENESS_TELEMETRY_SAMPLE_LIMIT,
  });
  const selectedSpawnerUniquenessSamples = downsampleByTick({
    samples: selectedSamples.filter((sample) => sample.tick >= firstTick && sample.tick <= lastTick),
    firstTick,
    lastTick,
    limit: UNIQUENESS_TELEMETRY_SAMPLE_LIMIT,
  });
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
