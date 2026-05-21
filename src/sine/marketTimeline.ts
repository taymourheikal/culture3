import {
  BASE_ROC,
  INITIAL_SETTINGS,
  effectiveParametersAt,
  noiseAt,
  type SignalSample,
  type WaveSettings,
} from "./marketSignal";

export type MarketTimeline = {
  tickSeconds: number;
  tick: number;
  time: number;
  phase: number;
  trend: number;
  settings: WaveSettings;
  samples: SignalSample[];
  sampleLimit: number;
};

export type MarketAdvanceResult = {
  processedTicks: number;
  remainingTicks: number;
};

export function createMarketTimeline(
  settings: WaveSettings = INITIAL_SETTINGS,
  tickSeconds = 0.18,
  sampleLimit = 12000,
): MarketTimeline {
  const timeline: MarketTimeline = {
    tickSeconds,
    tick: 0,
    time: 0,
    phase: settings.phase,
    trend: 0,
    settings,
    samples: [],
    sampleLimit,
  };
  timeline.samples.push(createSample(timeline.time, timeline.phase, timeline.trend, timeline.settings));
  return timeline;
}

export function applyTimelineSettings(timeline: MarketTimeline, settings: WaveSettings) {
  timeline.phase += settings.phase - timeline.settings.phase;
  timeline.settings = settings;
}

export function advanceMarketTimeline(timeline: MarketTimeline, targetTime: number, maxTicks: number): MarketAdvanceResult {
  const owedTicks = Math.max(0, Math.floor((targetTime - timeline.time) / timeline.tickSeconds));
  const processedTicks = Math.min(maxTicks, owedTicks);

  for (let index = 0; index < processedTicks; index += 1) {
    advanceOneTick(timeline);
  }

  return {
    processedTicks,
    remainingTicks: owedTicks - processedTicks,
  };
}

export function getTimelineSampleAt(timeline: MarketTimeline, time: number): SignalSample {
  if (timeline.samples.length === 0) return createSample(0, 0, 0, timeline.settings);
  const firstSample = timeline.samples[0] as SignalSample;
  if (time <= firstSample.time) return firstSample;
  if (time > timeline.time) {
    return getFutureSampleAt(timeline, time);
  }

  const rawIndex = time / timeline.tickSeconds;
  const lowerTick = Math.floor(rawIndex);
  const upperTick = Math.ceil(rawIndex);
  const lower = sampleByTick(timeline, lowerTick) ?? firstSample;
  const upper = sampleByTick(timeline, upperTick) ?? lower;
  if (lower === upper) return lower;

  const amount = (time - lower.time) / Math.max(0.0001, upper.time - lower.time);
  return interpolateSample(lower, upper, amount);
}

export function getTimelineSampleByTick(timeline: MarketTimeline, tick: number): SignalSample {
  const existing = sampleByTick(timeline, tick);
  if (existing) return existing;
  if (tick <= timeline.tick) {
    const firstTick = firstRetainedTick(timeline);
    throw new Error(`Timeline sample for tick ${tick} has expired; first retained tick is ${firstTick}.`);
  }
  return getFutureSampleAt(timeline, tick * timeline.tickSeconds);
}

export function buildTimelineSamples(
  timeline: MarketTimeline,
  centerTime: number,
  secondsVisible: number,
  count: number,
): SignalSample[] {
  const start = centerTime - secondsVisible / 2;
  const end = centerTime + secondsVisible / 2;
  const samples: SignalSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const time = start + ((end - start) * index) / Math.max(1, count - 1);
    samples.push(getTimelineSampleAt(timeline, time));
  }
  return samples;
}

function advanceOneTick(timeline: MarketTimeline) {
  const dt = timeline.tickSeconds;
  const midpointParameters = effectiveParametersAt(timeline.time + dt / 2, timeline.settings);
  timeline.trend += midpointParameters.slope * dt;
  timeline.phase += Math.PI * 2 * midpointParameters.frequency * dt;
  timeline.time += dt;
  timeline.tick += 1;
  timeline.samples.push(createSample(timeline.time, timeline.phase, timeline.trend, timeline.settings));

  if (timeline.samples.length > timeline.sampleLimit) {
    timeline.samples.splice(0, timeline.samples.length - timeline.sampleLimit);
  }
}

function getFutureSampleAt(timeline: MarketTimeline, time: number): SignalSample {
  let phase = timeline.phase;
  let trend = timeline.trend;
  let current = timeline.time;

  while (current < time) {
    const dt = Math.min(timeline.tickSeconds, time - current);
    const midpointParameters = effectiveParametersAt(current + dt / 2, timeline.settings);
    trend += midpointParameters.slope * dt;
    phase += Math.PI * 2 * midpointParameters.frequency * dt;
    current += dt;
  }

  return createSample(time, phase, trend, timeline.settings);
}

function createSample(time: number, phase: number, trend: number, settings: WaveSettings): SignalSample {
  const parameters = effectiveParametersAt(time, settings);
  const noise = noiseAt(time, settings, parameters);
  return {
    time,
    phase,
    trend,
    parameters,
    noise,
    settings: { ...settings },
    signal: BASE_ROC + trend + parameters.amplitude * Math.sin(phase) + noise,
  };
}

function sampleByTick(timeline: MarketTimeline, tick: number) {
  const targetTime = tick * timeline.tickSeconds;
  const first = timeline.samples[0];
  if (!first) return undefined;
  const index = Math.round((targetTime - first.time) / timeline.tickSeconds);
  return timeline.samples[index];
}

function firstRetainedTick(timeline: MarketTimeline) {
  const first = timeline.samples[0];
  return first ? Math.round(first.time / timeline.tickSeconds) : 0;
}

function interpolateSample(left: SignalSample, right: SignalSample, amount: number): SignalSample {
  const time = left.time + (right.time - left.time) * amount;
  const phase = lerp(left.phase, right.phase, amount);
  const trend = lerp(left.trend, right.trend, amount);
  return createSample(time, phase, trend, left.settings);
}

function lerp(left: number, right: number, amount: number) {
  return left + (right - left) * amount;
}
