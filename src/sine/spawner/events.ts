import type { SpawnerEvent, SpawnerWorld } from "./types";

export function recordSpawnerEvent(
  world: SpawnerWorld,
  event: Omit<SpawnerEvent, "id" | "tick"> & Partial<Pick<SpawnerEvent, "tick">>,
) {
  const recorded = {
    id: world.nextEventId,
    tick: event.tick ?? world.tick,
    ...event,
  };
  world.eventSink?.(recorded);
  world.recentEvents.push(recorded);
  world.nextEventId += 1;
  const minTick = world.tick - Math.max(12, world.config.foodHistoryTicks);
  world.recentEvents = world.recentEvents.filter((candidate) => candidate.tick >= minTick).slice(-300);
}
