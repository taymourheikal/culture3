const HISTORICAL_BUCKET_COUNT = 20;

export function historicalBucketSizeForSpan(spanTicks) {
  return Math.max(1, Math.ceil(Math.max(1, spanTicks) / HISTORICAL_BUCKET_COUNT));
}

export function historicalBucketStart(tick, bucketSize, originTick = 0) {
  return originTick + Math.floor(Math.max(0, tick - originTick) / bucketSize) * bucketSize;
}

export function historicalRangeSpanTicks(range) {
  return Math.max(1, range.toTick - range.fromTick);
}

export function historicalBucketForTick(tick, range, bucketSize) {
  return historicalBucketForStart(historicalBucketStart(tick, bucketSize, range.fromTick), range, bucketSize);
}

export function createFixedCountBuckets(range, bucketCount) {
  const spanTicks = Math.max(1, range.toTick - range.fromTick + 1);
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartTick = range.fromTick + Math.floor((index * spanTicks) / bucketCount);
    const nextStartTick = range.fromTick + Math.floor(((index + 1) * spanTicks) / bucketCount);
    return {
      bucketStartTick,
      bucketEndTick: Math.max(bucketStartTick, Math.min(range.toTick, nextStartTick - 1)),
    };
  });
}

export function fixedCountBucketIndex(tick, range, bucketCount) {
  const spanTicks = Math.max(1, range.toTick - range.fromTick + 1);
  const raw = Math.floor(((tick - range.fromTick) / spanTicks) * bucketCount);
  return Math.max(0, Math.min(bucketCount - 1, raw));
}

function historicalBucketForStart(bucketStartTick, range, bucketSize) {
  return {
    bucketStartTick,
    bucketEndTick: Math.min(range.toTick, bucketStartTick + bucketSize - 1),
  };
}
