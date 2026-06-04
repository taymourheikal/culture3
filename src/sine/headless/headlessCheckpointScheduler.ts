export type HeadlessCheckpointScheduler = ReturnType<typeof createHeadlessCheckpointScheduler>;

export function createHeadlessCheckpointScheduler(startTick: number, intervalTicks: number) {
  const interval = Math.max(0, Math.floor(intervalTicks));
  let lastCheckpointTick: number | null = null;
  let nextCheckpointTick = interval > 0 ? nextIntervalTick(startTick, interval) : Number.POSITIVE_INFINITY;

  return {
    nextTick() {
      return nextCheckpointTick;
    },
    shouldEmit(currentTick: number, force = false) {
      if (!force && currentTick < nextCheckpointTick) return false;
      return lastCheckpointTick !== currentTick;
    },
    recordEmitted(currentTick: number) {
      lastCheckpointTick = currentTick;
      while (nextCheckpointTick <= currentTick) nextCheckpointTick += interval;
    },
  };
}

function nextIntervalTick(tick: number, interval: number) {
  return Math.max(interval, Math.ceil((tick + 1) / interval) * interval);
}
