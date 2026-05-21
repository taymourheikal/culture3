import type { SpawnerWorld } from "./types";
import { architectureMetrics } from "./genome";

export function recordTelemetry(world: SpawnerWorld) {
  const recentLosses = world.recentResolvedPayoffs.map((payoff) => Math.max(0, -payoff));
  const rollingLoss = recentLosses.reduce((sum, loss) => sum + loss, 0) / Math.max(1, recentLosses.length);
  const lossRate =
    world.recentResolvedPayoffs.filter((payoff) => payoff < 0).length / Math.max(1, world.recentResolvedPayoffs.length);
  const metrics = world.spawners.map((spawner) => architectureMetrics(spawner.genome));
  const average = (key: "activeUnits" | "activeConnections" | "activeLayers") =>
    metrics.reduce((sum, metric) => sum + metric[key], 0) / Math.max(1, metrics.length);

  world.telemetry.push({
    tick: world.tick,
    population: world.spawners.length,
    rollingLoss,
    lossRate,
    cumulativeLoss: world.cumulativeLoss,
    cumulativeNetPayoff: world.cumulativeNetPayoff,
    averageActiveUnits: average("activeUnits"),
    averageActiveConnections: average("activeConnections"),
    averageActiveLayers: average("activeLayers"),
  });

  if (world.telemetry.length > 3000) {
    world.telemetry.splice(0, world.telemetry.length - 3000);
  }
}
