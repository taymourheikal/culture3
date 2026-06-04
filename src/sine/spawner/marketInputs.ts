import type { MarketTimeline } from "../marketTimeline";
import { createMarketFeatureContext, type MarketFeatureInstrumentation } from "./marketFeatureContext";
import { perceptionCacheKey, sanitizePerception } from "./perception";
import type { SpawnerPerception } from "./types";

export function createMarketInputResolver(
  timeline: MarketTimeline,
  tick: number,
  pendingFoodCount: number,
  instrumentation?: MarketFeatureInstrumentation,
) {
  const context = createMarketFeatureContext(timeline, tick, instrumentation);
  const cache = new Map<string, number[]>();
  let resolveCount = 0;
  let cacheHitCount = 0;
  let computeCount = 0;
  return {
    resolve(perception: SpawnerPerception) {
      resolveCount += 1;
      const key = `${perceptionCacheKey(perception)}:pending:${pendingFoodCount}`;
      const cached = cache.get(key);
      if (cached) {
        cacheHitCount += 1;
        return cached;
      }
      const inputs = context.resolveInputs(perception, pendingFoodCount);
      cache.set(key, inputs);
      computeCount += 1;
      return inputs;
    },
    getResolveCount: () => resolveCount,
    getCacheHitCount: () => cacheHitCount,
    getComputeCount: () => computeCount,
    getCacheSize: () => cache.size,
    getFeatureResolveCount: () => context.getFeatureResolveCount(),
    getFeatureCacheHitCount: () => context.getFeatureCacheHitCount(),
    getFeatureComputeCount: () => context.getFeatureComputeCount(),
    getFeatureCacheSize: () => context.getFeatureCacheSize(),
    getSampleCacheSize: () => context.getSampleCacheSize(),
  };
}

export function buildMarketInputs(timeline: MarketTimeline, tick: number, pendingFoodCount: number, perception: SpawnerPerception) {
  return createMarketFeatureContext(timeline, tick).resolveInputs(sanitizePerception(perception), pendingFoodCount);
}
