import type {
  LeanSelectedUniquenessSample,
  LeanUniquenessTelemetrySample,
} from "../marketWorkerProtocol";
import type { SpawnerUniquenessScore } from "../spawnerSimulation";
import {
  createEmptyUniquenessTelemetryWindow,
  createUniquenessTelemetryWindow,
  type UniquenessTelemetryWindow,
} from "../packets/uniquenessTelemetryWindow";

const UNIQUENESS_HISTORY_LIMIT = 3000;

type RawDistanceByTick = {
  tick: number;
  values: Map<number, number>;
};

export function createUniquenessTelemetryService() {
  let aggregateSamples: LeanUniquenessTelemetrySample[] = [];
  let rawDistanceByTick: RawDistanceByTick[] = [];
  let selectedSpawnerId: number | null = null;
  let skippedReason: "population_limit" | undefined;

  return {
    reset() {
      aggregateSamples = [];
      rawDistanceByTick = [];
      selectedSpawnerId = null;
      skippedReason = undefined;
    },

    record(scores: Map<number, SpawnerUniquenessScore>, tick: number) {
      const rawDistances = [...scores.values()]
        .map((score) => score.rawDistance)
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
      if (rawDistances.length === 0) return;

      const sampleTick = Math.max(1, Math.floor(tick));
      upsertAggregateSample({
        tick: sampleTick,
        p25RawDistance: percentile(rawDistances, 0.25),
        medianRawDistance: percentile(rawDistances, 0.5),
        p75RawDistance: percentile(rawDistances, 0.75),
      });
      upsertRawDistanceSample({
        tick: sampleTick,
        values: new Map(
          [...scores.entries()]
            .filter(([, score]) => Number.isFinite(score.rawDistance))
            .map(([spawnerId, score]) => [spawnerId, score.rawDistance]),
        ),
      });
      skippedReason = undefined;
      trimHistory();
    },

    markSkipped(reason: "population_limit") {
      skippedReason = reason;
    },

    setSelectedSpawner(spawnerId: number | null) {
      selectedSpawnerId = Number.isFinite(spawnerId) && spawnerId !== null ? Math.floor(spawnerId) : null;
    },

    selectedSpawnerId() {
      return selectedSpawnerId;
    },

    window(renderTick: number): UniquenessTelemetryWindow {
      if (aggregateSamples.length === 0) return createEmptyUniquenessTelemetryWindow(renderTick, skippedReason);
      return createUniquenessTelemetryWindow({
        aggregateSamples,
        selectedSamples: selectedSamples(),
        renderTick,
        skippedReason,
      });
    },

    sampleCount() {
      return aggregateSamples.length;
    },
  };

  function selectedSamples(): LeanSelectedUniquenessSample[] {
    if (selectedSpawnerId === null) return [];
    const samples: LeanSelectedUniquenessSample[] = [];
    for (const entry of rawDistanceByTick) {
      const rawDistance = entry.values.get(selectedSpawnerId);
      if (rawDistance !== undefined && Number.isFinite(rawDistance)) samples.push({ tick: entry.tick, rawDistance });
    }
    return samples;
  }

  function trimHistory() {
    if (aggregateSamples.length > UNIQUENESS_HISTORY_LIMIT) {
      aggregateSamples = aggregateSamples.slice(-UNIQUENESS_HISTORY_LIMIT);
    }
    if (rawDistanceByTick.length > UNIQUENESS_HISTORY_LIMIT) {
      rawDistanceByTick = rawDistanceByTick.slice(-UNIQUENESS_HISTORY_LIMIT);
    }
  }

  function upsertAggregateSample(sample: LeanUniquenessTelemetrySample) {
    const index = aggregateSamples.findIndex((existing) => existing.tick === sample.tick);
    if (index >= 0) aggregateSamples[index] = sample;
    else aggregateSamples.push(sample);
    aggregateSamples.sort((left, right) => left.tick - right.tick);
  }

  function upsertRawDistanceSample(sample: RawDistanceByTick) {
    const index = rawDistanceByTick.findIndex((existing) => existing.tick === sample.tick);
    if (index >= 0) rawDistanceByTick[index] = sample;
    else rawDistanceByTick.push(sample);
    rawDistanceByTick.sort((left, right) => left.tick - right.tick);
  }
}

function percentile(sortedValues: number[], percentileRank: number) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * percentileRank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? lowerValue;
  const weight = index - lower;
  return lowerValue + (upperValue - lowerValue) * weight;
}
