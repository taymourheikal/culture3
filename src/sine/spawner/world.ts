import { getTimelineSampleByTick, type MarketTimeline } from "../marketTimeline";
import { forwardSpawner } from "./brain";
import { DEFAULT_SPAWNER_CONFIG } from "./config";
import { recordSpawnerEvent } from "./events";
import { activeConnections, activeLayerIndexes, activeUnits, createInnovationRegistry, createRandomGenome, mutateGenome } from "./genome";
import { clamp, interpolate, normalizePercent, sigmoid } from "./math";
import { emitFood, resolveFoods } from "./reward";
import { SeededRng } from "./rng";
import { recordTelemetry } from "./telemetry";
import type { SpawnerAgent, SpawnerConfig, SpawnerGenome, SpawnerWorld } from "./types";

export function createSpawnerWorld(seed = 101, config: Partial<SpawnerConfig> = {}): SpawnerWorld {
  const fullConfig = { ...DEFAULT_SPAWNER_CONFIG, ...config };
  const rng = new SeededRng(seed);
  const innovations = createInnovationRegistry();
  const world: SpawnerWorld = {
    seed,
    rng,
    tick: 0,
    time: 0,
    nextEventId: 1,
    nextSpawnerId: 1,
    nextLineageId: 1,
    nextFoodId: 1,
    spawners: [],
    foods: [],
    recentEvents: [],
    lineages: {},
    cumulativeLoss: 0,
    cumulativeNetPayoff: 0,
    totalResolved: 0,
    totalLosses: 0,
    recentResolvedPayoffs: [],
    telemetry: [],
    config: fullConfig,
    innovations,
  };

  const initialCount = Math.min(fullConfig.initialSpawners, fullConfig.maxSpawners);
  for (let index = 0; index < initialCount; index += 1) {
    world.spawners.push(createSpawner(world, createRandomGenome(rng, fullConfig, innovations)));
  }

  return world;
}

export function advanceSpawnerWorldToTimeline(world: SpawnerWorld, timeline: MarketTimeline, maxSteps = Number.POSITIVE_INFINITY) {
  let steps = 0;
  while (world.tick < timeline.tick && steps < maxSteps) {
    world.tick += 1;
    world.time = getTimelineSampleByTick(timeline, world.tick).time;
    steps += 1;
    stepSpawnerWorld(world, timeline);
  }
  return {
    processedTicks: steps,
    remainingTicks: timeline.tick - world.tick,
  };
}

export function getVisibleSpawnerFoods(world: SpawnerWorld, centerTime: number, secondsVisible: number) {
  const start = centerTime - secondsVisible / 2;
  const end = centerTime + secondsVisible / 2;
  return world.foods.filter((food) => food.spawnTime <= end && food.resolveTime >= start);
}

export function spawnerHitRate(spawner: SpawnerAgent) {
  return spawner.resolvedCount > 0 ? spawner.wins / spawner.resolvedCount : 0;
}

export function spawnerAveragePayoff(spawner: SpawnerAgent) {
  return spawner.resolvedCount > 0 ? spawner.totalPayoff / spawner.resolvedCount : 0;
}

export function isSpawnerAlive(spawner: SpawnerAgent, config: SpawnerConfig) {
  return spawner.energy > config.deathEnergy && spawner.health > config.deathHealth;
}

function stepSpawnerWorld(world: SpawnerWorld, timeline: MarketTimeline) {
  resolveFoods(world, timeline);
  world.spawners = pruneDeadSpawners(world);

  const pendingDensity =
    world.foods.filter((food) => food.status === "pending").length / Math.max(1, world.config.pendingDensityDivisor);
  const marketInputs = buildMarketInputs(timeline, world.tick, pendingDensity);
  const newborns: SpawnerAgent[] = [];

  for (const spawner of world.spawners) {
    spawner.age += world.config.tickSeconds;
    spawner.cooldown = Math.max(0, spawner.cooldown - world.config.tickSeconds);
    spawner.energy -=
      (world.config.metabolism +
        activeUnits(spawner.genome).length * world.config.brainEnergyCostPerActiveUnit +
        activeConnections(spawner.genome).length * world.config.brainEnergyCostPerActiveConnection +
        activeLayerIndexes(spawner.genome).length * world.config.brainEnergyCostPerActiveLayer) *
      world.config.tickSeconds;
    spawner.lastAction = "wait";

    const inputs = [...marketInputs, clamp(spawner.energy / world.config.reproductionEnergy, -1, 2), clamp(spawner.health / 100, 0, 1)];
    const outputs = forwardSpawner(spawner, inputs);
    const longScore = sigmoid(outputs[0] ?? 0) + spawner.genome.thresholdBias;
    const shortScore = sigmoid(outputs[1] ?? 0) + spawner.genome.thresholdBias;
    const strength = clamp(sigmoid(outputs[2] ?? 0), world.config.minSignalStrength, 1);
    const horizon = interpolate(spawner.genome.minHorizon, spawner.genome.maxHorizon, sigmoid(outputs[3] ?? 0));
    const cooldown = spawner.genome.cooldownBase + sigmoid(outputs[4] ?? 0) * world.config.cooldownOutputMultiplier;

    if (spawner.cooldown <= 0 && spawner.energy > world.config.spawnCost + world.config.minimumSpawnEnergySurplus) {
      if (longScore >= world.config.spawnThreshold && longScore >= shortScore) {
        emitFood(world, spawner, "long", strength, horizon, timeline);
        spawner.cooldown = cooldown;
      } else if (shortScore >= world.config.spawnThreshold) {
        emitFood(world, spawner, "short", strength, horizon, timeline);
        spawner.cooldown = cooldown;
      } else {
        spawner.lastAction = "wait";
      }
    }

    const recentAverage =
      spawner.recentPayoffs.reduce((sum, payoff) => sum + payoff, 0) / Math.max(1, spawner.recentPayoffs.length);
    if (
      world.spawners.length + newborns.length < world.config.maxSpawners &&
      spawner.energy >= world.config.reproductionEnergy &&
      spawner.recentPayoffs.length >= world.config.reproductionMinResolved &&
      recentAverage >= world.config.reproductionMinAveragePayoff
    ) {
      spawner.energy -= world.config.reproductionCost;
      spawner.children += 1;
      const child = createSpawner(world, mutateGenome(spawner.genome, world.rng, world.config, world.innovations), spawner.lineageId, spawner);
      newborns.push(child);
      recordSpawnerEvent(world, {
        kind: "reproduction",
        spawnerId: spawner.id,
        lineageId: spawner.lineageId,
        childSpawnerId: child.id,
      });
    }
  }

  world.spawners = world.spawners.concat(newborns);
  world.spawners = pruneDeadSpawners(world);

  const minTime = world.time - world.config.foodHistorySeconds;
  world.foods = world.foods.filter((food) => food.status === "pending" || food.resolveTime >= minTime);
  recordTelemetry(world);
}

function pruneDeadSpawners(world: SpawnerWorld) {
  const survivors: SpawnerAgent[] = [];
  for (const spawner of world.spawners) {
    if (isSpawnerAlive(spawner, world.config)) {
      survivors.push(spawner);
    } else {
      const lineage = world.lineages[spawner.lineageId];
      if (lineage) lineage.totalDeaths += 1;
      recordSpawnerEvent(world, {
        kind: "death",
        spawnerId: spawner.id,
        lineageId: spawner.lineageId,
      });
    }
  }
  return survivors;
}

function buildMarketInputs(timeline: MarketTimeline, tick: number, pendingDensity: number) {
  const ticksForSeconds = (seconds: number) => Math.max(0, tick - Math.round(seconds / timeline.tickSeconds));
  const currentSample = getTimelineSampleByTick(timeline, tick);
  const lag1Sample = getTimelineSampleByTick(timeline, ticksForSeconds(0.6));
  const lag2Sample = getTimelineSampleByTick(timeline, ticksForSeconds(1.2));
  const lag4Sample = getTimelineSampleByTick(timeline, ticksForSeconds(2.4));
  const lag8Sample = getTimelineSampleByTick(timeline, ticksForSeconds(4.8));
  const current = currentSample.signal;
  const lag1 = lag1Sample.signal;
  const lag2 = lag2Sample.signal;
  const lag4 = lag4Sample.signal;
  const lag8 = lag8Sample.signal;
  const window = [
    current,
    lag1,
    lag2,
    lag4,
    lag8,
    getTimelineSampleByTick(timeline, ticksForSeconds(7.2)).signal,
    getTimelineSampleByTick(timeline, ticksForSeconds(9.6)).signal,
  ];
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length;
  const shape = estimateSignalShape(timeline, tick);

  return [
    normalizePercent(current),
    normalizePercent(current - lag1),
    normalizePercent(lag1 - lag2),
    normalizePercent(lag2 - lag4),
    normalizePercent(lag4 - lag8),
    normalizePercent(mean),
    clamp(Math.sqrt(variance) / 3, 0, 2),
    shape.estimatedAmplitude,
    shape.estimatedCycleFrequency,
    shape.estimatedTrendSlope,
    shape.estimatedResidualVolatility,
    shape.estimatedRoughness,
    clamp(pendingDensity, 0, 1),
  ];
}

function estimateSignalShape(timeline: MarketTimeline, tick: number) {
  const history = collectSignalHistory(timeline, tick, 9.6, 0.6);
  const values = history.map((sample) => sample.value);
  const amplitude = estimateAmplitude(values);
  const trend = linearRegression(history);
  const residuals = history.map((sample) => sample.value - (trend.intercept + trend.slope * sample.time));
  const residualMean = residuals.reduce((sum, value) => sum + value, 0) / Math.max(1, residuals.length);
  const residualVariance =
    residuals.reduce((sum, value) => sum + (value - residualMean) ** 2, 0) / Math.max(1, residuals.length);

  return {
    estimatedAmplitude: clamp(amplitude / 8, 0, 1),
    estimatedCycleFrequency: clamp(estimateCycleFrequency(values, historyDuration(history), amplitude) / 1.2, 0, 1),
    estimatedTrendSlope: clamp(trend.slope, -1, 1),
    estimatedResidualVolatility: clamp(Math.sqrt(residualVariance) / 5, 0, 1),
    estimatedRoughness: estimateRoughness(values, historyDuration(history), amplitude),
  };
}

function collectSignalHistory(timeline: MarketTimeline, tick: number, seconds: number, stepSeconds: number) {
  const sampleCount = Math.max(2, Math.round(seconds / stepSeconds) + 1);
  const history = [];
  for (let index = sampleCount - 1; index >= 0; index -= 1) {
    const secondsAgo = index * stepSeconds;
    const sampleTick = Math.max(0, tick - Math.round(secondsAgo / timeline.tickSeconds));
    const sample = getTimelineSampleByTick(timeline, sampleTick);
    history.push({
      time: sample.time,
      value: sample.signal,
    });
  }
  const startTime = history[0]?.time ?? 0;
  return history.map((sample) => ({
    time: sample.time - startTime,
    value: sample.value,
  }));
}

function estimateAmplitude(values: number[]) {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (max - min) / 2;
}

function linearRegression(samples: { time: number; value: number }[]) {
  if (samples.length < 2) return { slope: 0, intercept: samples[0]?.value ?? 0 };
  const meanTime = samples.reduce((sum, sample) => sum + sample.time, 0) / samples.length;
  const meanValue = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const numerator = samples.reduce((sum, sample) => sum + (sample.time - meanTime) * (sample.value - meanValue), 0);
  const denominator = samples.reduce((sum, sample) => sum + (sample.time - meanTime) ** 2, 0);
  const slope = denominator > 0 ? numerator / denominator : 0;
  return {
    slope,
    intercept: meanValue - slope * meanTime,
  };
}

function estimateCycleFrequency(values: number[], duration: number, amplitude: number) {
  if (duration <= 0 || values.length < 3) return 0;
  const smoothed = smoothValues(values);
  const turningPoints = countTurningPoints(smoothed, Math.max(0.02, amplitude * 0.08));
  return turningPoints >= 2 ? turningPoints / 2 / duration : 0;
}

function estimateRoughness(values: number[], duration: number, amplitude: number) {
  if (duration <= 0 || values.length < 3) return 0;
  const secondDiffs = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    const previous = values[index - 1] ?? 0;
    const current = values[index] ?? previous;
    const next = values[index + 1] ?? current;
    secondDiffs.push(Math.abs(next - 2 * current + previous));
  }
  const averageSecondDiff = secondDiffs.reduce((sum, value) => sum + value, 0) / Math.max(1, secondDiffs.length);
  const turningRate = countTurningPoints(values, Math.max(0.01, amplitude * 0.04)) / duration;
  return clamp(averageSecondDiff / Math.max(0.2, amplitude * 2) + turningRate / 6, 0, 1);
}

function smoothValues(values: number[]) {
  return values.map((value, index) => {
    const left = values[Math.max(0, index - 1)] ?? value;
    const right = values[Math.min(values.length - 1, index + 1)] ?? value;
    return (left + value + right) / 3;
  });
}

function countTurningPoints(values: number[], threshold: number) {
  let count = 0;
  for (let index = 1; index < values.length - 1; index += 1) {
    const previous = values[index - 1] ?? 0;
    const current = values[index] ?? previous;
    const next = values[index + 1] ?? current;
    const left = current - previous;
    const right = next - current;
    if (Math.abs(left) < threshold || Math.abs(right) < threshold) continue;
    if ((left > 0 && right < 0) || (left < 0 && right > 0)) count += 1;
  }
  return count;
}

function historyDuration(samples: { time: number }[]) {
  const first = samples[0]?.time ?? 0;
  const last = samples.at(-1)?.time ?? first;
  return Math.max(0, last - first);
}

function createSpawner(world: SpawnerWorld, genome: SpawnerGenome, lineageId?: number, parent?: SpawnerAgent): SpawnerAgent {
  const id = world.nextSpawnerId;
  world.nextSpawnerId += 1;
  const assignedLineageId = lineageId ?? world.nextLineageId;
  if (lineageId === undefined) world.nextLineageId += 1;
  const lineage = world.lineages[assignedLineageId] ?? {
    id: assignedLineageId,
    totalBorn: 0,
    totalDeaths: 0,
  };
  lineage.totalBorn += 1;
  world.lineages[assignedLineageId] = lineage;

  return {
    id,
    lineageId: assignedLineageId,
    generation: parent ? parent.generation + 1 : 0,
    birthTick: world.tick,
    parentSpawnerId: parent?.id,
    genome,
    hiddenState: Object.fromEntries(genome.units.map((unit) => [unit.unitId, 0])),
    energy: world.config.initialEnergyMin + world.rng.next() * Math.max(0, world.config.initialEnergyMax - world.config.initialEnergyMin),
    health: world.config.initialHealth,
    age: 0,
    cooldown: world.rng.next() * world.config.initialCooldownMax,
    spawnedCount: 0,
    resolvedCount: 0,
    wins: 0,
    losses: 0,
    totalPayoff: 0,
    children: 0,
    lastAction: "wait",
    recentPayoffs: [],
  };
}
