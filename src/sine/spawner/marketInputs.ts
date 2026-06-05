import type { MarketTimeline } from "../marketTimeline";
import { createMarketFeatureFrame, type MarketFeatureInstrumentation } from "./marketFeatureContext";
import { perceptionCacheKey, sanitizePerception } from "./perception";
import type { SpawnerPerception } from "./types";

export function createMarketInputResolver(
  timeline: MarketTimeline,
  tick: number,
  pendingFoodCount: number,
  instrumentation?: MarketFeatureInstrumentation,
) {
  const frame = createMarketFeatureFrame(timeline, tick, instrumentation);
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
      const inputs = frame.resolveInputs(perception, pendingFoodCount);
      cache.set(key, inputs);
      computeCount += 1;
      return inputs;
    },
    getResolveCount: () => resolveCount,
    getCacheHitCount: () => cacheHitCount,
    getComputeCount: () => computeCount,
    getCacheSize: () => cache.size,
    getFeatureResolveCount: () => frame.getFeatureResolveCount(),
    getFeatureCacheHitCount: () => frame.getFeatureCacheHitCount(),
    getFeatureComputeCount: () => frame.getFeatureComputeCount(),
    getFeatureCacheSize: () => frame.getFeatureCacheSize(),
    getSampleCacheSize: () => frame.getSampleCacheSize(),
  };
}

export function buildMarketInputs(timeline: MarketTimeline, tick: number, pendingFoodCount: number, perception: SpawnerPerception) {
  return createMarketFeatureFrame(timeline, tick).resolveInputs(sanitizePerception(perception), pendingFoodCount);
}
