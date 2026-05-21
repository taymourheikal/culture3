import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, applyTimelineSettings, createMarketTimeline, getTimelineSampleAt, getTimelineSampleByTick } from "../../src/sine/marketTimeline";
import { advanceSpawnerWorldToTimeline, createSpawnerWorld } from "../../src/sine/spawnerSimulation";
import { advanceSimulationToTarget, createSimulationState } from "../../src/sine/simulationRuntime";
import { round, type SineTest } from "./helpers";

function testTimelineHistoryIsProspective() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  advanceMarketTimeline(timeline, 10, 1000);
  const currentBefore = getTimelineSampleAt(timeline, timeline.time).signal;
  const historicalBefore = getTimelineSampleAt(timeline, 5).signal;

  applyTimelineSettings(timeline, { ...INITIAL_SETTINGS, amplitude: 7, slope: -0.5 });

  assert.equal(getTimelineSampleAt(timeline, timeline.time).signal, currentBefore);
  assert.equal(getTimelineSampleAt(timeline, 5).signal, historicalBefore);
  advanceMarketTimeline(timeline, 10.18, 1000);
  assert.notEqual(getTimelineSampleAt(timeline, timeline.time).signal, currentBefore);
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
  const timeline = createMarketTimeline(settings, 0.18);
  advanceMarketTimeline(timeline, 1.98, 100);
  const offTickFutureTime = timeline.time + timeline.tickSeconds * 0.37;
  const futureNoise = getTimelineSampleAt(timeline, offTickFutureTime).noise;

  advanceMarketTimeline(timeline, offTickFutureTime + timeline.tickSeconds * 2, 100);
  const historicalNoise = getTimelineSampleAt(timeline, offTickFutureTime).noise;

  assert.equal(round(historicalNoise), round(futureNoise));
}

function testBacklogDrainsWithoutSkippingTicks() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(101);
  const first = advanceMarketTimeline(timeline, 100, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);
  assert.equal(first.processedTicks, 100);
  assert(first.remainingTicks > 0);

  let frames = 0;
  while ((timeline.time + timeline.tickSeconds <= 100 || world.tick < timeline.tick) && frames < 10) {
    advanceMarketTimeline(timeline, 100, 100);
    advanceSpawnerWorldToTimeline(world, timeline, 100);
    frames += 1;
  }

  assert.equal(world.tick, timeline.tick);
  assert(Math.abs(100 - timeline.time) < timeline.tickSeconds);
}

function testLargeElapsedTimeCreatesBacklog() {
  const simulation = createSimulationState(INITIAL_SETTINGS);
  const first = advanceSimulationToTarget(simulation, 10, 5);
  assert.equal(first.processedTicks, 10);
  assert(first.remainingTicks > 0);
  assert(simulation.timeline.time < 10);

  let result = first;
  let frames = 0;
  while (result.remainingTicks > 0 && frames < 20) {
    result = advanceSimulationToTarget(simulation, 10, 5);
    frames += 1;
  }

  assert.equal(result.remainingTicks, 0);
  assert.equal(simulation.world.tick, simulation.timeline.tick);
  assert(Math.abs(10 - simulation.timeline.time) < simulation.timeline.tickSeconds);
}

function testExpiredTickLookupThrows() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18, 3);
  advanceMarketTimeline(timeline, 10, 1000);
  assert.throws(() => getTimelineSampleByTick(timeline, 1), /expired/);
  assert.doesNotThrow(() => getTimelineSampleByTick(timeline, timeline.tick));
}

export const tests: SineTest[] = [
  { name: "Timeline History Is Prospective", run: testTimelineHistoryIsProspective },
  { name: "Future Noise Does Not Smooth After It Becomes History", run: testFutureNoiseDoesNotSmoothAfterItBecomesHistory },
  { name: "Backlog Drains Without Skipping Ticks", run: testBacklogDrainsWithoutSkippingTicks },
  { name: "Large Elapsed Time Creates Backlog", run: testLargeElapsedTimeCreatesBacklog },
  { name: "Expired Tick Lookup Throws", run: testExpiredTickLookupThrows },
];
