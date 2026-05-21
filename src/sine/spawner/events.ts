import type { SpawnerEvent, SpawnerWorld } from "./types";

export function recordSpawnerEvent(
  world: SpawnerWorld,
  event: Omit<SpawnerEvent, "id" | "tick" | "time"> & Partial<Pick<SpawnerEvent, "tick" | "time">>,
) {
  world.recentEvents.push({
    id: world.nextEventId,
    tick: event.tick ?? world.tick,
    time: event.time ?? world.time,
    ...event,
  });
  world.nextEventId += 1;
  const minTime = world.time - Math.max(12, world.config.foodHistorySeconds);
  world.recentEvents = world.recentEvents.filter((candidate) => candidate.time >= minTime).slice(-300);
}
