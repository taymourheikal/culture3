import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import { advanceMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { advanceSpawnerWorldToTimeline, createSpawnerWorld } from "../../src/sine/spawnerSimulation";

export type Summary = {
  tick: number;
  timelineTick: number;
  spawners: number;
  totalResolved: number;
  totalLosses: number;
  cumulativeLoss: number;
  cumulativeNetPayoff: number;
  foods: number;
  firstTelemetry?: number;
  lastTelemetry?: number;
};

export type SineTest = { name: string; run: () => void };

export function runSuite(name: string, tests: SineTest[]) {
  for (const test of tests) {
    test.run();
    console.log(`PASS ${name}: ${test.name}`);
  }
}

export function runTo(endTime: number, seed = 101) {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(seed);
  for (let target = 0; target <= endTime; target += 1) {
    advanceMarketTimeline(timeline, target, 100);
    advanceSpawnerWorldToTimeline(world, timeline, 100);
  }
  return { timeline, world };
}

export function summarize(endTime: number, seed = 101): Summary {
  const { timeline, world } = runTo(endTime, seed);
  return {
    tick: world.tick,
    timelineTick: timeline.tick,
    spawners: world.spawners.length,
    totalResolved: world.totalResolved,
    totalLosses: world.totalLosses,
    cumulativeLoss: round(world.cumulativeLoss),
    cumulativeNetPayoff: round(world.cumulativeNetPayoff),
    foods: world.foods.length,
    firstTelemetry: world.telemetry[0]?.tick,
    lastTelemetry: world.telemetry.at(-1)?.tick,
  };
}

export function round(value: number) {
  return Number(value.toFixed(6));
}
