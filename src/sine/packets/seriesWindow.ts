export function firstTickAtOrAfter(tick: number, step: number) {
  return Math.ceil(tick / step) * step;
}

export function firstSampleAtOrAfter<T extends { tick: number }>(samples: T[], tick: number) {
  let low = 0;
  let high = samples.length - 1;
  let match: T | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const sample = samples[middle];
    if (!sample) break;
    if (sample.tick >= tick) {
      match = sample;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return match;
}

export function downsampleByTick<T extends { tick: number }>({
  samples,
  firstTick,
  lastTick,
  limit,
  cloneSample = cloneObject,
  sampleAtTick,
}: {
  samples: T[];
  firstTick: number;
  lastTick: number;
  limit: number;
  cloneSample?: (sample: T) => T;
  sampleAtTick?: (samples: T[], tick: number) => T | undefined;
}): T[] {
  if (samples.length === 0 || limit <= 0) return [];
  if (!Number.isFinite(firstTick) || !Number.isFinite(lastTick) || lastTick <= firstTick) return edgeSamples(samples, cloneSample);
  if (samples.length <= limit) return samples.map(cloneSample);

  const tickStep = Math.max(1, Math.ceil((lastTick - firstTick) / Math.max(1, limit - 1)));
  const result: T[] = [];
  const first = samples[0];
  if (first) result.push(cloneSample(first));

  for (let tick = firstTickAtOrAfter(firstTick, tickStep); tick < lastTick; tick += tickStep) {
    const sample = sampleAtTick ? sampleAtTick(samples, tick) : firstSampleAtOrAfter(samples, tick);
    if (sample && result.at(-1)?.tick !== sample.tick) result.push(cloneSample(sample));
  }

  const last = samples.at(-1);
  if (last && result.at(-1)?.tick !== last.tick) result.push(cloneSample(last));
  return result;
}

function cloneObject<T extends { tick: number }>(sample: T): T {
  return { ...sample };
}

function edgeSamples<T extends { tick: number }>(samples: T[], cloneSample: (sample: T) => T): T[] {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first) return [];
  if (!last || last.tick === first.tick) return [cloneSample(first)];
  return [cloneSample(first), cloneSample(last)];
}
