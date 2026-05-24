export const CHART_INTERVAL_MS = 1000 / 60;
export const STATS_INTERVAL_MS = 500;
export const ROSTER_INTERVAL_MS = 1000;
export const PACKET_SIZE_INTERVAL_MS = 1000;

export type ScheduledPacketKey = "chart" | "roster" | "stats" | "persistence";

const INTERVAL_BY_KEY: Record<ScheduledPacketKey, number> = {
  chart: CHART_INTERVAL_MS,
  roster: ROSTER_INTERVAL_MS,
  stats: STATS_INTERVAL_MS,
  persistence: 1000,
};

export function createPacketScheduler() {
  let lastPostTime = resetTimes();
  let lastSizeMeasureTime = resetTimes();

  return {
    reset() {
      lastPostTime = resetTimes();
      lastSizeMeasureTime = resetTimes();
    },
    shouldPost(key: ScheduledPacketKey, force: boolean, now = performance.now()) {
      if (!force && now - lastPostTime[key] < INTERVAL_BY_KEY[key]) return false;
      lastPostTime = { ...lastPostTime, [key]: now };
      return true;
    },
    retryNow(key: ScheduledPacketKey) {
      lastPostTime = { ...lastPostTime, [key]: Number.NEGATIVE_INFINITY };
    },
    shouldMeasureSize(key: ScheduledPacketKey, force: boolean, now = performance.now()) {
      if (!force && now - lastSizeMeasureTime[key] < PACKET_SIZE_INTERVAL_MS) return false;
      lastSizeMeasureTime = { ...lastSizeMeasureTime, [key]: now };
      return true;
    },
  };
}

function resetTimes(): Record<ScheduledPacketKey, number> {
  return {
    chart: Number.NEGATIVE_INFINITY,
    roster: Number.NEGATIVE_INFINITY,
    stats: Number.NEGATIVE_INFINITY,
    persistence: Number.NEGATIVE_INFINITY,
  };
}
