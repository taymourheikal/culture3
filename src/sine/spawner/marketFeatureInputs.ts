import type { SignalSample } from "../marketSignal";
import { clamp } from "./math";
import {
  collectNumericHistory,
  normalizeByLocalScale,
  summarizeLocalNumericScale,
  type LocalSignalScaleStats,
  type TimelineSignalSampleResolver,
} from "./localSignalScale";
import type { SpawnerPerception } from "./types";

type FeatureTimingInstrumentation = {
  recordFeaturePhase(phase: string, ms: number): void;
};

export type VolumeRsiInputs = {
  relativeVolume: number;
  volumeDelta: number;
  volumeAcceleration: number;
  rsiSignal: number;
  volumePriceAgreement: number;
};

export function buildVolumeRsiInputs({
  tick,
  perception,
  signalStats,
  sampleAtTick,
}: {
  tick: number;
  perception: SpawnerPerception;
  signalStats: LocalSignalScaleStats;
  sampleAtTick: TimelineSignalSampleResolver;
}): VolumeRsiInputs {
  const current = sampleAt(tick, sampleAtTick);
  const sampleAtLag = (ticksAgo: number) => sampleAt(tick - ticksAgo, sampleAtTick);
  if (!hasVolume(current)) {
    return {
      relativeVolume: 0,
      volumeDelta: 0,
      volumeAcceleration: 0,
      rsiSignal: computeRsiSignalFromLag(perception.rsiWindowTicks, sampleAtLag),
      volumePriceAgreement: 0,
    };
  }

  const volumeHistory = collectNumericHistory(
    tick,
    perception.volumeScaleWindowTicks,
    perception.volumeScaleSampleStepTicks,
    sampleAtTick,
    (sample) => logVolume(sample.volume),
  );
  const logVolumes = volumeHistory.map((sample) => sample.value);
  const volumeStats = summarizeLocalNumericScale(logVolumes);
  return buildVolumeRsiInputsFromSamples({
    perception,
    signalStats,
    volumeStats,
    logVolumes,
    current,
    sampleAtLag,
  });
}

export function computeRsiSignal(tick: number, windowTicks: number, sampleAtTick: TimelineSignalSampleResolver) {
  return computeRsiSignalFromLag(windowTicks, (ticksAgo) => sampleAt(tick - ticksAgo, sampleAtTick));
}

export function buildVolumeRsiInputsFromSamples({
  perception,
  signalStats,
  volumeStats,
  logVolumes,
  current,
  sampleAtLag,
  instrumentation,
}: {
  perception: SpawnerPerception;
  signalStats: LocalSignalScaleStats;
  volumeStats: LocalSignalScaleStats;
  logVolumes: number[];
  current: SignalSample;
  sampleAtLag: (ticksAgo: number) => SignalSample;
  instrumentation?: FeatureTimingInstrumentation;
}): VolumeRsiInputs {
  const meanLogVolume = timeFeature(instrumentation, "relativeVolume", () => logVolumes.reduce((sum, value) => sum + value, 0) / Math.max(1, logVolumes.length));
  const currentLogVolume = logVolume(current.volume);

  const volumeDelta = timeFeature(instrumentation, "volumeDelta", () => {
    const deltaLag = Math.max(0, perception.volumeDeltaLagTicks);
    const deltaLagVolume = logVolume(sampleAtLag(deltaLag).volume);
    return normalizeByLocalScale(currentLogVolume - deltaLagVolume, volumeStats.scale);
  });
  const volumeAcceleration = timeFeature(instrumentation, "volumeAcceleration", () => {
    const accelerationLag = Math.max(0, perception.volumeAccelerationLagTicks);
    const accelerationMiddleVolume = logVolume(sampleAtLag(accelerationLag).volume);
    const accelerationBackVolume = logVolume(sampleAtLag(accelerationLag * 2).volume);
    return normalizeByLocalScale((currentLogVolume - accelerationMiddleVolume) - (accelerationMiddleVolume - accelerationBackVolume), volumeStats.scale);
  });
  const rsiSignal = timeFeature(instrumentation, "rsiSignal", () => computeRsiSignalFromLag(perception.rsiWindowTicks, sampleAtLag));
  const volumePriceAgreement = timeFeature(instrumentation, "volumePriceAgreement", () => {
    const agreementLag = Math.max(0, perception.volumePriceAgreementLagTicks);
    const agreementLagSample = sampleAtLag(agreementLag);
    const agreementLagVolume = logVolume(agreementLagSample.volume);
    const relativePriceMove = normalizeByLocalScale(current.signal - agreementLagSample.signal, signalStats.scale);
    const agreementVolumeDelta = normalizeByLocalScale(currentLogVolume - agreementLagVolume, volumeStats.scale);
    return clamp(relativePriceMove * agreementVolumeDelta, -1, 1);
  });

  return {
    relativeVolume: normalizeByLocalScale(currentLogVolume - meanLogVolume, volumeStats.scale),
    volumeDelta,
    volumeAcceleration,
    rsiSignal,
    volumePriceAgreement,
  };
}

export function computeRsiSignalFromLag(windowTicks: number, sampleAtLag: (ticksAgo: number) => SignalSample) {
  const window = Math.max(1, Math.round(windowTicks));
  let gains = 0;
  let losses = 0;
  let usableMoves = 0;
  for (let offset = window; offset >= 1; offset -= 1) {
    const previous = sampleAtLag(offset).price;
    const current = sampleAtLag(offset - 1).price;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const move = Number(current) - Number(previous);
    if (move >= 0) gains += move;
    else losses += -move;
    usableMoves += 1;
  }
  if (usableMoves === 0 || (gains === 0 && losses === 0)) return 0;
  if (losses === 0) return 1;
  if (gains === 0) return -1;
  const relativeStrength = gains / losses;
  const rsi = 100 - 100 / (1 + relativeStrength);
  return clamp((rsi - 50) / 50, -1, 1);
}

function sampleAt(tick: number, sampleAtTick: TimelineSignalSampleResolver): SignalSample {
  return sampleAtTick(Math.max(0, Math.round(tick)));
}

function timeFeature<T>(instrumentation: FeatureTimingInstrumentation | undefined, phase: string, read: () => T): T {
  if (!instrumentation) return read();
  const started = performance.now();
  try {
    return read();
  } finally {
    instrumentation.recordFeaturePhase(phase, performance.now() - started);
  }
}

export function hasVolume(sample: SignalSample) {
  return Number.isFinite(sample.volume);
}

export function logVolume(volume: number | undefined) {
  return Math.log1p(Math.max(0, Number.isFinite(volume) ? Number(volume) : 0));
}
