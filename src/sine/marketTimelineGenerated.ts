import { BASE_ROC, effectiveParametersAt, noiseAt, type SignalSample, type WaveSettings } from "./marketSignal";
import type { MarketTimeline } from "./marketTimeline";

export function createGeneratedSample(tick: number, phase: number, trend: number, settings: WaveSettings): SignalSample {
  const parameters = effectiveParametersAt(tick, settings);
  const noise = noiseAt(tick, settings, parameters);
  return {
    tick,
    phase,
    trend,
    parameters,
    noise,
    settings: { ...settings },
    signal: BASE_ROC + trend + parameters.amplitude * Math.sin(phase) + noise,
  };
}

export function advanceGeneratedTimelineOneTick(timeline: MarketTimeline) {
  const midpointParameters = effectiveParametersAt(timeline.tick + 0.5, timeline.settings);
  timeline.trend += midpointParameters.slope;
  timeline.phase += Math.PI * 2 * midpointParameters.frequency;
  timeline.tick += 1;
  timeline.samples.push(createGeneratedSample(timeline.tick, timeline.phase, timeline.trend, timeline.settings));
}

export function getGeneratedFutureSampleAt(timeline: MarketTimeline, renderTick: number): SignalSample {
  let phase = timeline.phase;
  let trend = timeline.trend;
  let current = timeline.tick;

  while (current < renderTick) {
    const dt = Math.min(1, renderTick - current);
    const midpointParameters = effectiveParametersAt(current + dt / 2, timeline.settings);
    trend += midpointParameters.slope * dt;
    phase += Math.PI * 2 * midpointParameters.frequency * dt;
    current += dt;
  }

  return createGeneratedSample(renderTick, phase, trend, timeline.settings);
}

export function interpolateGeneratedSample(left: SignalSample, right: SignalSample, amount: number) {
  const tick = left.tick + (right.tick - left.tick) * amount;
  const phase = lerp(left.phase, right.phase, amount);
  const trend = lerp(left.trend, right.trend, amount);
  return createGeneratedSample(tick, phase, trend, left.settings);
}

function lerp(left: number, right: number, amount: number) {
  return left + (right - left) * amount;
}
