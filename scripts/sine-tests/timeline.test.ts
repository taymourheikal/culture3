import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import {
  advanceMarketTimeline,
  applyTimelineSettings,
  createCandleMarketTimeline,
  createMarketTimeline,
  getTimelineSampleAt,
  getTimelineSampleByTick,
} from "../../src/sine/marketTimeline";
import { advanceSpawnerWorldToTimeline, createSpawnerWorld } from "../../src/sine/spawnerSimulation";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import { playbackEndReached } from "../../src/sine/playbackEnd";
import { INITIAL_MARKET_RUNTIME_CONFIG } from "../../src/sine/marketRuntimeConfig";
import { round, type SineTest } from "./helpers";

function testTimelineHistoryIsProspective() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  advanceMarketTimeline(timeline, 10, 1000);
  const currentBefore = getTimelineSampleAt(timeline, timeline.tick).signal;
  const historicalBefore = getTimelineSampleAt(timeline, 5).signal;

  applyTimelineSettings(timeline, { ...INITIAL_SETTINGS, amplitude: 7, slope: -0.5 });

  assert.equal(getTimelineSampleAt(timeline, timeline.tick).signal, currentBefore);
  assert.equal(getTimelineSampleAt(timeline, 5).signal, historicalBefore);
  advanceMarketTimeline(timeline, 11, 1000);
  assert.notEqual(getTimelineSampleAt(timeline, timeline.tick).signal, currentBefore);
}

function testFutureNoiseDoesNotSmoothAfterItBecomesHistory() {
  const settings = {
    ...INITIAL_SETTINGS,
    amplitude: 0,
    amplitudeDrift: 0,
    slope: 0,
    slopeDrift: 0,
    noiseAmplitude: 5,
    noiseAmplitudeDrift: 0,
    noiseFrequency: 6,
    noiseFrequencyDrift: 0,
  };
  const timeline = createMarketTimeline(settings);
  advanceMarketTimeline(timeline, 1.98, 100);
  const offTickFutureTime = timeline.tick + 1 * 0.37;
  const futureNoise = getTimelineSampleAt(timeline, offTickFutureTime).noise;

  advanceMarketTimeline(timeline, offTickFutureTime + 1 * 2, 100);
  const historicalNoise = getTimelineSampleAt(timeline, offTickFutureTime).noise;

  assert.equal(round(historicalNoise), round(futureNoise));
}

function testBacklogDrainsWithoutSkippingTicks() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101);
  const first = advanceMarketTimeline(timeline, 100, 50);
  advanceSpawnerWorldToTimeline(world, timeline, 50);
  assert.equal(first.processedTicks, 50);
  assert(first.remainingTicks > 0);

  let frames = 0;
  while ((timeline.tick + 1 <= 100 || world.tick < timeline.tick) && frames < 10) {
    advanceMarketTimeline(timeline, 100, 50);
    advanceSpawnerWorldToTimeline(world, timeline, 50);
    frames += 1;
  }

  assert.equal(world.tick, timeline.tick);
  assert(Math.abs(100 - timeline.tick) < 1);
}

function testLargeElapsedTimeCreatesBacklog() {
  const simulation = createSimulationState(INITIAL_SETTINGS);
  const first = advanceSimulationToTarget(simulation, 10, 5);
  assert.equal(first.processedTicks, 5);
  assert.equal(simulation.world.tick, 5);
  assert(first.remainingTicks > 0);
  assert(simulation.timeline.tick < 10);

  let result = first;
  let frames = 0;
  while (result.remainingTicks > 0 && frames < 20) {
    result = advanceSimulationToTarget(simulation, 10, 5);
    frames += 1;
  }

  assert.equal(result.remainingTicks, 0);
  assert.equal(simulation.world.tick, simulation.timeline.tick);
  assert(Math.abs(10 - simulation.timeline.tick) < 1);
}

function testExpiredTickLookupThrows() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 3);
  advanceMarketTimeline(timeline, 10, 1000);
  assert.throws(() => getTimelineSampleByTick(timeline, 1), /expired/);
  assert.doesNotThrow(() => getTimelineSampleByTick(timeline, timeline.tick));
}

function testCandleTimelineAdvancesOneCandlePerTick() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
        candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 0, isStart: true },
      { timestamp: 1300, datetime: "1970-01-01T00:21:40.000Z", open: 101, high: 101, low: 101, close: 101, roc: 1 },
      { timestamp: 1600, datetime: "1970-01-01T00:26:40.000Z", open: 99, high: 99, low: 99, close: 99, roc: -1 },
    ],
  });

  assert.equal(getTimelineSampleByTick(timeline, 0).price, 100);
  advanceMarketTimeline(timeline, 1, 10);
  assert.equal(timeline.tick, 1);
  assert.equal(getTimelineSampleByTick(timeline, 1).price, 101);
  assert.equal(getTimelineSampleByTick(timeline, 1).signal, 1);
}

function testCandleTimelineOffTickSamplingUsesCandleData() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
        candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 10, isStart: true },
      { timestamp: 1300, datetime: "1970-01-01T00:21:40.000Z", open: 110, high: 110, low: 110, close: 110, roc: 20 },
    ],
  });
  advanceMarketTimeline(timeline, 1, 10);
  const sample = getTimelineSampleAt(timeline, 0.9);

  assert.equal(sample.price, 110);
  assert.equal(sample.signal, 20);
  assert.equal(sample.noise, 0);
}

function testCandleTimelineEndOfDataDoesNotLeaveBacklog() {
  const timeline = createCandleMarketTimeline({
    source: "btcusd_5m",
        candles: [
      { timestamp: 1000, datetime: "1970-01-01T00:16:40.000Z", open: 100, high: 100, low: 100, close: 100, roc: 0, isStart: true },
    ],
  });
  const result = advanceMarketTimeline(timeline, 10, 100);

  assert.equal(result.processedTicks, 0);
  assert.equal(result.remainingTicks, 0);
  assert.equal(result.ended, true);
  assert.equal(timeline.candleEndReached, true);
}

function testPlaybackEndByTicksUsesRunStartTick() {
  const playback = {
    ...INITIAL_MARKET_RUNTIME_CONFIG.playback,
    endMode: "ticks" as const,
    endAfterTicks: 5,
  };

  assert.equal(playbackEndReached({ playback, runStartTick: 10, currentTick: 14 }), false);
  assert.equal(playbackEndReached({ playback, runStartTick: 10, currentTick: 15 }), true);
  assert.equal(playbackEndReached({ playback, runStartTick: 10, currentTick: 18 }), true);
}

function testPlaybackEndNoneNeverStopsByUserRule() {
  const playback = {
    ...INITIAL_MARKET_RUNTIME_CONFIG.playback,
    endMode: "none" as const,
    endAfterTicks: 1,
    endDateTime: "2023-11-14T22:18",
  };

  assert.equal(playbackEndReached({ playback, runStartTick: 0, currentTick: 100, currentSourceTimestamp: 1_700_000_000 }), false);
}

function testPlaybackEndPauseResumeKeepsCountdownOrigin() {
  const playback = {
    ...INITIAL_MARKET_RUNTIME_CONFIG.playback,
    endMode: "ticks" as const,
    endAfterTicks: 3,
  };
  const runStartTick = 20;

  assert.equal(playbackEndReached({ playback, runStartTick, currentTick: 21 }), false);
  assert.equal(playbackEndReached({ playback, runStartTick, currentTick: 22 }), false);
  assert.equal(playbackEndReached({ playback, runStartTick, currentTick: 23 }), true);
}

function testPlaybackEndByDateUsesFirstTimestampAtOrAfterEnd() {
  const playback = {
    ...INITIAL_MARKET_RUNTIME_CONFIG.playback,
    endMode: "date" as const,
    endDateTime: "2023-11-14T22:18",
  };
  const endTimestamp = Math.floor(Date.parse("2023-11-14T22:18:00.000Z") / 1000);

  assert.equal(playbackEndReached({ playback, runStartTick: 0, currentTick: 1, currentSourceTimestamp: endTimestamp - 1 }), false);
  assert.equal(playbackEndReached({ playback, runStartTick: 0, currentTick: 2, currentSourceTimestamp: endTimestamp }), true);
  assert.equal(playbackEndReached({ playback, runStartTick: 0, currentTick: 3, currentSourceTimestamp: endTimestamp + 300 }), true);
}

function testPlaybackEndByDateIgnoresTimestamplessSources() {
  const playback = {
    ...INITIAL_MARKET_RUNTIME_CONFIG.playback,
    endMode: "date" as const,
    endDateTime: "2023-11-14T22:18",
  };

  assert.equal(playbackEndReached({ playback, runStartTick: 0, currentTick: 100 }), false);
  assert.equal(playbackEndReached({ playback, runStartTick: 0, currentTick: 100, currentSourceTimestamp: null }), false);
}

export const tests: SineTest[] = [
  { name: "Timeline History Is Prospective", run: testTimelineHistoryIsProspective },
  { name: "Future Noise Does Not Smooth After It Becomes History", run: testFutureNoiseDoesNotSmoothAfterItBecomesHistory },
  { name: "Backlog Drains Without Skipping Ticks", run: testBacklogDrainsWithoutSkippingTicks },
  { name: "Large Elapsed Time Creates Backlog", run: testLargeElapsedTimeCreatesBacklog },
  { name: "Expired Tick Lookup Throws", run: testExpiredTickLookupThrows },
  { name: "Candle Timeline Advances One Candle Per Tick", run: testCandleTimelineAdvancesOneCandlePerTick },
  { name: "Candle Timeline Off Tick Sampling Uses Candle Data", run: testCandleTimelineOffTickSamplingUsesCandleData },
  { name: "Candle Timeline End Of Data Does Not Leave Backlog", run: testCandleTimelineEndOfDataDoesNotLeaveBacklog },
  { name: "Playback End By Ticks Uses Run Start Tick", run: testPlaybackEndByTicksUsesRunStartTick },
  { name: "Playback End None Never Stops By User Rule", run: testPlaybackEndNoneNeverStopsByUserRule },
  { name: "Playback End Pause Resume Keeps Countdown Origin", run: testPlaybackEndPauseResumeKeepsCountdownOrigin },
  { name: "Playback End By Date Uses First Timestamp At Or After End", run: testPlaybackEndByDateUsesFirstTimestampAtOrAfterEnd },
  { name: "Playback End By Date Ignores Timestampless Sources", run: testPlaybackEndByDateIgnoresTimestamplessSources },
];
