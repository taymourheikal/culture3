import { strict as assert } from "node:assert";
import { INITIAL_SETTINGS } from "../src/sine/marketSignal";
import { MARKET_SETTING_BOUNDS } from "../src/sine/marketSettingBounds";
import {
  advanceMarketTimeline,
  applyTimelineSettings,
  createMarketTimeline,
  getTimelineSampleAt,
  getTimelineSampleByTick,
} from "../src/sine/marketTimeline";
import {
  alignHiddenState,
  activeConnections,
  activeLayerIndexes,
  activeUnits,
  addRandomLegalConnection,
  architectureMetrics,
  connectionInnovationId,
  DEFAULT_SPAWNER_CONFIG,
  advanceSpawnerWorldToTimeline,
  createSpawnerWorld,
  forwardSpawner,
  getOrCreateConnectionInnovationId,
  isLegalConnection,
  mutateGenome,
  SeededRng,
  validateGenome,
  type SpawnerConfig,
} from "../src/sine/spawnerSimulation";
import { SPAWNER_CONFIG_BOUNDS } from "../src/sine/spawnerConfigBounds";
import { sanitizeSpawnerConfig } from "../src/sine/spawnerSettingsStorage";
import { sanitizeSettings } from "../src/sine/settingsStorage";
import { advanceSimulationToTarget, createSimulationState } from "../src/sine/simulationRuntime";

type Summary = {
  tick: number;
  timelineTick: number;
  spawners: number;
  totalResolved: number;
  totalLosses: number;
  cumulativeLoss: number;
  cumulativeNetPayoff: number;
  foods: number;
  firstTelemetry?: number;
  lastTelemetry?: number;
};

function runTo(endTime: number, seed = 101) {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(seed);
  for (let target = 0; target <= endTime; target += timeline.tickSeconds) {
    advanceMarketTimeline(timeline, target, 100);
    advanceSpawnerWorldToTimeline(world, timeline, 100);
  }
  return { timeline, world };
}

function summarize(endTime: number, seed = 101): Summary {
  const { timeline, world } = runTo(endTime, seed);
  return {
    tick: world.tick,
    timelineTick: timeline.tick,
    spawners: world.spawners.length,
    totalResolved: world.totalResolved,
    totalLosses: world.totalLosses,
    cumulativeLoss: round(world.cumulativeLoss),
    cumulativeNetPayoff: round(world.cumulativeNetPayoff),
    foods: world.foods.length,
    firstTelemetry: world.telemetry[0]?.tick,
    lastTelemetry: world.telemetry.at(-1)?.tick,
  };
}

function testTimelineHistoryIsProspective() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  advanceMarketTimeline(timeline, 10, 1000);
  const currentBefore = getTimelineSampleAt(timeline, timeline.time).signal;
  const historicalBefore = getTimelineSampleAt(timeline, 5).signal;

  applyTimelineSettings(timeline, { ...INITIAL_SETTINGS, amplitude: 7, slope: -0.5 });

  assert.equal(getTimelineSampleAt(timeline, timeline.time).signal, currentBefore);
  assert.equal(getTimelineSampleAt(timeline, 5).signal, historicalBefore);
  advanceMarketTimeline(timeline, 10.18, 1000);
  assert.notEqual(getTimelineSampleAt(timeline, timeline.time).signal, currentBefore);
}

function testFutureNoiseDoesNotSmoothAfterItBecomesHistory() {
  const settings = {
    ...INITIAL_SETTINGS,
    amplitude: 0,
    amplitudeDrift: 0,
    slope: 0,
    slopeDrift: 0,
    noiseAmplitude: 5,
    noiseAmplitudeDrift: 0,
    noiseFrequency: 6,
    noiseFrequencyDrift: 0,
  };
  const timeline = createMarketTimeline(settings, 0.18);
  advanceMarketTimeline(timeline, 1.98, 100);
  const offTickFutureTime = timeline.time + timeline.tickSeconds * 0.37;
  const futureNoise = getTimelineSampleAt(timeline, offTickFutureTime).noise;

  advanceMarketTimeline(timeline, offTickFutureTime + timeline.tickSeconds * 2, 100);
  const historicalNoise = getTimelineSampleAt(timeline, offTickFutureTime).noise;

  assert.equal(round(historicalNoise), round(futureNoise));
}

function testBacklogDrainsWithoutSkippingTicks() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(101);
  const first = advanceMarketTimeline(timeline, 100, 100);
  advanceSpawnerWorldToTimeline(world, timeline, 100);
  assert.equal(first.processedTicks, 100);
  assert(first.remainingTicks > 0);

  let frames = 0;
  while ((timeline.time + timeline.tickSeconds <= 100 || world.tick < timeline.tick) && frames < 10) {
    advanceMarketTimeline(timeline, 100, 100);
    advanceSpawnerWorldToTimeline(world, timeline, 100);
    frames += 1;
  }

  assert.equal(world.tick, timeline.tick);
  assert(Math.abs(100 - timeline.time) < timeline.tickSeconds);
}

function testLargeElapsedTimeCreatesBacklog() {
  const simulation = createSimulationState(INITIAL_SETTINGS);
  const first = advanceSimulationToTarget(simulation, 10, 5);
  assert.equal(first.processedTicks, 10);
  assert(first.remainingTicks > 0);
  assert(simulation.timeline.time < 10);

  let result = first;
  let frames = 0;
  while (result.remainingTicks > 0 && frames < 20) {
    result = advanceSimulationToTarget(simulation, 10, 5);
    frames += 1;
  }

  assert.equal(result.remainingTicks, 0);
  assert.equal(simulation.world.tick, simulation.timeline.tick);
  assert(Math.abs(10 - simulation.timeline.time) < simulation.timeline.tickSeconds);
}

function testFoodResolvesExactlyOnce() {
  const { timeline, world } = runTo(180);
  const badPending = world.foods.filter((food) => food.status === "pending" && food.resolveTick <= world.tick);
  const badResolved = world.foods.filter(
    (food) => food.status !== "pending" && (typeof food.exitSignal !== "number" || typeof food.payoff !== "number"),
  );

  assert.equal(world.tick, timeline.tick);
  assert.equal(badPending.length, 0);
  assert.equal(badResolved.length, 0);
  assert.equal(world.telemetry.at(-1)?.tick, world.tick);
}

function testDeadSpawnerCannotActAfterResolvedLoss() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(101, { initialSpawners: 1, deathHealth: 90 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.health = 80;
  spawner.energy = 100;
  spawner.cooldown = 0;
  spawner.genome.thresholdBias = 1;
  spawner.genome.outputBias = [100, -100, 100, 0, 0];
  world.foods.push({
    id: world.nextFoodId,
    creatorSpawnerId: spawner.id,
    creatorLineageId: spawner.lineageId,
    spawnTick: 0,
    resolveTick: 1,
    spawnTime: 0,
    resolveTime: timeline.tickSeconds,
    direction: "long",
    strength: 1,
    horizon: timeline.tickSeconds,
    entrySignal: 100,
    status: "pending",
  });
  world.nextFoodId += 1;

  advanceMarketTimeline(timeline, timeline.tickSeconds, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners.length, 0);
  assert.equal(world.foods.length, 1);
  assert.equal(world.foods[0]?.status, "loss");
}

function testCooldownSpawnerReportsWait() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18);
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.lastAction = "long";
  spawner.cooldown = 10;

  advanceMarketTimeline(timeline, timeline.tickSeconds, 10);
  advanceSpawnerWorldToTimeline(world, timeline, 10);

  assert.equal(world.spawners[0]?.lastAction, "wait");
}

function testSpawnerConfigAffectsNewWorlds() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 3,
    maxSpawners: 7,
    initialHiddenUnitsMin: 4,
    initialHiddenUnitsMax: 4,
    initialEnergyMin: 42,
    initialEnergyMax: 42,
    initialHealth: 77,
    initialCooldownMax: 0,
    baseMutationStdDev: 0.123,
  });

  assert.equal(world.spawners.length, 3);
  assert.equal(world.config.maxSpawners, 7);
  for (const spawner of world.spawners) {
    assert.equal(spawner.energy, 42);
    assert.equal(spawner.health, 77);
    assert.equal(spawner.cooldown, 0);
    assert.equal(activeUnits(spawner.genome).length, 4);
    assert.equal(Object.keys(spawner.hiddenState).length, 4);
    assert.equal(spawner.genome.mutationStd, 0.123);
  }
}

function testMarketSettingsSanitizerClampsSavedValues() {
  const sanitized = sanitizeSettings({
    ...INITIAL_SETTINGS,
    amplitude: 999,
    frequency: -999,
    phase: Number.NaN,
    speed: 999,
    slope: -999,
    noiseAmplitude: 999,
    noiseFrequency: -999,
    regimeSpeed: -999,
  });

  assert.equal(sanitized.amplitude, MARKET_SETTING_BOUNDS.amplitude.max);
  assert.equal(sanitized.frequency, MARKET_SETTING_BOUNDS.frequency.min);
  assert.equal(sanitized.phase, INITIAL_SETTINGS.phase);
  assert.equal(sanitized.speed, MARKET_SETTING_BOUNDS.speed.max);
  assert.equal(sanitized.slope, MARKET_SETTING_BOUNDS.slope.min);
  assert.equal(sanitized.noiseAmplitude, MARKET_SETTING_BOUNDS.noiseAmplitude.max);
  assert.equal(sanitized.noiseFrequency, MARKET_SETTING_BOUNDS.noiseFrequency.min);
  assert.equal(sanitized.regimeSpeed, MARKET_SETTING_BOUNDS.regimeSpeed.min);
}

function testSpawnerConfigSanitizerClampsAndNormalizesPairs() {
  const sanitized = sanitizeSpawnerConfig({
    ...DEFAULT_SPAWNER_CONFIG,
    initialSpawners: 9999,
    maxSpawners: -9999,
    initialHiddenUnitsMin: 9999,
    initialHiddenUnitsMax: -9999,
    mutationStdDevMin: 9999,
    mutationStdDevMax: -9999,
    thresholdBiasMin: 9999,
    thresholdBiasMax: -9999,
    initialMinHorizonMin: 9999,
    initialMinHorizonMax: -9999,
  });

  for (const key of Object.keys(SPAWNER_CONFIG_BOUNDS) as Array<keyof SpawnerConfig>) {
    const bounds = SPAWNER_CONFIG_BOUNDS[key];
    assert(sanitized[key] >= bounds.min, `${key} below minimum`);
    assert(sanitized[key] <= bounds.max, `${key} above maximum`);
  }

  assert.equal(sanitized.initialSpawners, SPAWNER_CONFIG_BOUNDS.initialSpawners.max);
  assert.equal(sanitized.maxSpawners, SPAWNER_CONFIG_BOUNDS.maxSpawners.min);
  assert(sanitized.initialHiddenUnitsMax >= sanitized.initialHiddenUnitsMin + 1);
  assert(sanitized.mutationStdDevMax >= sanitized.mutationStdDevMin + 0.001);
  assert(sanitized.thresholdBiasMax >= sanitized.thresholdBiasMin + 0.001);
  assert(sanitized.initialMinHorizonMax >= sanitized.initialMinHorizonMin + 0.01);
}

function testInitialSpawnersRespectPopulationCap() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 20,
    maxSpawners: 7,
  });

  assert.equal(world.spawners.length, 7);
}

function testDeterministicSeedOutcome() {
  assert.deepEqual(summarize(180, 101), summarize(180, 101));
  assert.notDeepEqual(summarize(180, 101), summarize(180, 202));
}

function testFixedSpawnerForwardSnapshot() {
  const firstWorld = createSpawnerWorld(101);
  const secondWorld = createSpawnerWorld(101);
  const firstSpawner = firstWorld.spawners[0];
  const secondSpawner = secondWorld.spawners[0];
  assert(firstSpawner);
  assert(secondSpawner);

  const inputs = Array.from({ length: 15 }, (_, index) => Number(((index - 7) / 10).toFixed(3)));
  const hiddenState = Object.fromEntries(firstSpawner.genome.units.map((unit, index) => [unit.unitId, Number((index / 20).toFixed(3))]));
  firstSpawner.hiddenState = { ...hiddenState };
  secondSpawner.hiddenState = { ...hiddenState };

  const firstOutput = forwardSpawner(firstSpawner, inputs).map(round);
  const secondOutput = forwardSpawner(secondSpawner, inputs).map(round);
  assert.deepEqual(firstOutput, secondOutput);
  assert.equal(firstOutput.length, 5);
  assert(firstOutput.every(Number.isFinite));
  assert(Object.values(firstSpawner.hiddenState).every(Number.isFinite));
}

function testSparseInnovationIdsAreStable() {
  const source = { kind: "input" as const, index: 3 };
  const target = { kind: "hidden" as const, unitId: 7, gate: "candidate" as const };
  assert.equal(connectionInnovationId(source, target), connectionInnovationId(source, target));
  assert.notEqual(connectionInnovationId(source, target), connectionInnovationId({ kind: "input", index: 4 }, target));
}

function testFounderUnitInnovationIdsAreWorldUnique() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 5,
    initialHiddenUnitsMin: 3,
    initialHiddenUnitsMax: 3,
  });
  const ids = world.spawners.flatMap((spawner) => spawner.genome.units.map((unit) => unit.innovationId));
  assert.equal(new Set(ids).size, ids.length);
}

function testConnectionInnovationRegistryReusesIds() {
  const world = createSpawnerWorld(101, { initialSpawners: 1, initialHiddenUnitsMin: 2, initialHiddenUnitsMax: 2 });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  const source = { kind: "input" as const, index: 0 };
  const target = { kind: "hidden" as const, unitId: unit.unitId, gate: "candidate" as const };
  const first = getOrCreateConnectionInnovationId(spawner.genome, world.innovations, source, target);
  const second = getOrCreateConnectionInnovationId(spawner.genome, world.innovations, source, target);
  const different = getOrCreateConnectionInnovationId(spawner.genome, world.innovations, { kind: "input", index: 1 }, target);
  assert.equal(first, second);
  assert.notEqual(first, different);

  const child = mutateGenome(spawner.genome, new SeededRng(1), {
    ...world.config,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  }, world.innovations);
  assert.deepEqual(
    child.connections.map((connection) => connection.innovationId),
    spawner.genome.connections.map((connection) => connection.innovationId),
  );
}

function testOutputConnectionLegalityRejectsPreviousHidden() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  assert.equal(
    isLegalConnection(spawner.genome, { kind: "hidden", unitId: unit.unitId, mode: "previous" }, { kind: "output", index: 0 }, world.config),
    false,
  );
  assert.equal(
    isLegalConnection(spawner.genome, { kind: "hidden", unitId: unit.unitId, mode: "current" }, { kind: "output", index: 0 }, world.config),
    true,
  );
}

function testReenableConnectionSkipsIllegalConnections() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  spawner.genome.connections.push({
    innovationId: 999_999,
    source: { kind: "hidden", unitId: unit.unitId, mode: "previous" },
    target: { kind: "output", index: 0 },
    weight: 1,
    enabled: false,
  });
  const child = mutateGenome(spawner.genome, new SeededRng(1), {
    ...world.config,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 1,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  }, world.innovations);
  const illegal = child.connections.find((connection) => connection.innovationId === 999_999);
  assert.equal(illegal?.enabled, false);
}

function testSparseConnectionRulesAndMutation() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    addUnitRate: 1,
    addConnectionRate: 1,
    weightMutationRate: 1,
    biasMutationRate: 1,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const before = architectureMetrics(spawner.genome);
  const child = mutateGenome(spawner.genome, new SeededRng(909), world.config, world.innovations);
  const after = architectureMetrics(child);
  assert(after.activeUnits >= before.activeUnits);
  assert(after.activeConnections >= before.activeConnections);
  assert(activeLayerIndexes(child).every((layer) => layer >= 1));

  const units = activeUnits(child);
  const lower = units.find((unit) => unit.layerIndex === Math.min(...units.map((unit) => unit.layerIndex)));
  const higher = units.find((unit) => lower && unit.layerIndex > lower.layerIndex);
  if (lower && higher) {
    assert.equal(
      isLegalConnection(
        child,
        { kind: "hidden", unitId: higher.unitId, mode: "current" },
        { kind: "hidden", unitId: lower.unitId, gate: "update" },
        world.config,
      ),
      false,
    );
  }

  for (let index = 0; index < 1000; index += 1) {
    const added = addRandomLegalConnection(child, new SeededRng(1000 + index), world.config, world.innovations);
    if (!added) break;
  }
  const seen = new Set<string>();
  for (const connection of activeConnections(child)) {
    const key = JSON.stringify([connection.source, connection.target]);
    assert(!seen.has(key));
    seen.add(key);
    assert(isLegalConnection(child, connection.source, connection.target, world.config));
  }
}

function testAddUnitMutationWiresNewUnit() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    newUnitInitialConnections: 12,
    addUnitRate: 1,
    addConnectionRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  let isolated = 0;
  let sawInputToNewUnit = false;
  let sawHiddenToNewUnit = false;
  let sawNewUnitToOutput = false;
  for (let seed = 1; seed <= 200; seed += 1) {
    const child = mutateGenome(parent.genome, new SeededRng(seed), world.config, world.innovations);
    const newestUnitId = Math.max(...child.units.map((unit) => unit.unitId));
    const touchingConnections = activeConnections(child).filter(
      (connection) =>
        (connection.source.kind === "hidden" && connection.source.unitId === newestUnitId) ||
        (connection.target.kind === "hidden" && connection.target.unitId === newestUnitId),
    );
    if (touchingConnections.length === 0) isolated += 1;
    sawInputToNewUnit ||= touchingConnections.some((connection) => connection.source.kind === "input" && connection.target.kind === "hidden");
    sawHiddenToNewUnit ||= touchingConnections.some(
      (connection) => connection.source.kind === "hidden" && connection.target.kind === "hidden" && connection.target.unitId === newestUnitId,
    );
    sawNewUnitToOutput ||= touchingConnections.some(
      (connection) => connection.source.kind === "hidden" && connection.source.unitId === newestUnitId && connection.target.kind === "output",
    );
  }
  assert.equal(isolated, 0);
  assert.equal(sawInputToNewUnit, true);
  assert.equal(sawHiddenToNewUnit, true);
  assert.equal(sawNewUnitToOutput, true);
}

function testDisableLastActiveUnitIsPrevented() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    addUnitRate: 0,
    disableUnitRate: 1,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  const child = mutateGenome(parent.genome, new SeededRng(1), world.config, world.innovations);
  assert.equal(activeUnits(child).length, 1);

  const multiWorld = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 2,
    initialHiddenUnitsMax: 2,
    addUnitRate: 0,
    disableUnitRate: 1,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  });
  const multiParent = multiWorld.spawners[0];
  assert(multiParent);
  const multiChild = mutateGenome(multiParent.genome, new SeededRng(1), multiWorld.config, multiWorld.innovations);
  assert.equal(activeUnits(multiChild).length, 1);
}

function testAddUnitAfterAllDisabledStartsAtLayerOne() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialHiddenUnitsMin: 1,
    initialHiddenUnitsMax: 1,
    newUnitInitialConnections: 1,
    addUnitRate: 1,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  });
  const parent = world.spawners[0];
  assert(parent);
  parent.genome.units.forEach((unit) => {
    unit.enabled = false;
  });
  const child = mutateGenome(parent.genome, new SeededRng(1), world.config, world.innovations);
  assert.deepEqual(activeLayerIndexes(child), [1]);
}

function testGenomeValidationCatchesInvalidTopology() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  assert.equal(validateGenome(spawner.genome, world.config).valid, true);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  const invalid = {
    ...spawner.genome,
    connections: [
      ...spawner.genome.connections,
      {
        innovationId: 123456,
        source: { kind: "hidden" as const, unitId: unit.unitId, mode: "previous" as const },
        target: { kind: "output" as const, index: 0 },
        weight: 1,
        enabled: true,
      },
    ],
  };
  const result = validateGenome(invalid, world.config);
  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("Illegal enabled connection")));
}

function testHiddenStateAlignmentForReenabledUnits() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  spawner.hiddenState[unit.unitId] = Number.NaN;
  alignHiddenState(spawner);
  assert.equal(spawner.hiddenState[unit.unitId], 0);
  delete spawner.hiddenState[unit.unitId];
  const outputs = forwardSpawner(spawner, Array.from({ length: 15 }, () => 0));
  assert(outputs.every(Number.isFinite));
  assert(Number.isFinite(spawner.hiddenState[unit.unitId]));
}

function testDeeperLayerUsesLowerLayerCurrentState() {
  const world = createSpawnerWorld(707, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.hiddenState = { 1: 0, 2: 0 };
  spawner.genome = {
    units: [
      { unitId: 1, innovationId: 1, layerIndex: 1, enabled: true, updateBias: 10, resetBias: 0, candidateBias: 0 },
      { unitId: 2, innovationId: 2, layerIndex: 2, enabled: true, updateBias: 10, resetBias: 0, candidateBias: 0 },
    ],
    connections: [
      {
        innovationId: connectionInnovationId({ kind: "input", index: 0 }, { kind: "hidden", unitId: 1, gate: "candidate" }),
        source: { kind: "input", index: 0 },
        target: { kind: "hidden", unitId: 1, gate: "candidate" },
        weight: 2,
        enabled: true,
      },
      {
        innovationId: connectionInnovationId(
          { kind: "hidden", unitId: 1, mode: "current" },
          { kind: "hidden", unitId: 2, gate: "candidate" },
        ),
        source: { kind: "hidden", unitId: 1, mode: "current" },
        target: { kind: "hidden", unitId: 2, gate: "candidate" },
        weight: 2,
        enabled: true,
      },
      {
        innovationId: connectionInnovationId({ kind: "hidden", unitId: 2, mode: "current" }, { kind: "output", index: 0 }),
        source: { kind: "hidden", unitId: 2, mode: "current" },
        target: { kind: "output", index: 0 },
        weight: 1,
        enabled: true,
      },
    ],
    outputBias: [0, 0, 0, 0, 0],
    nextUnitId: 3,
    mutationStd: 0,
    thresholdBias: 0,
    minHorizon: 1,
    maxHorizon: 2,
    cooldownBase: 1,
  };
  const outputs = forwardSpawner(spawner, [1, ...Array.from({ length: 14 }, () => 0)]);
  assert((outputs[0] ?? 0) > 0.5);
  assert.equal(
    isLegalConnection(
      spawner.genome,
      { kind: "hidden", unitId: 2, mode: "current" },
      { kind: "hidden", unitId: 1, gate: "candidate" },
      world.config,
    ),
    false,
  );
}

function testSparseFounderTopologyGuarantees() {
  const world = createSpawnerWorld(303, {
    initialSpawners: 4,
    initialHiddenUnitsMin: 5,
    initialHiddenUnitsMax: 5,
    initialInputConnectionsPerUnit: 3,
    initialRecurrentConnectionsPerUnit: 1,
    initialOutputConnectionsPerOutput: 2,
  });
  for (const spawner of world.spawners) {
    assert.equal(activeUnits(spawner.genome).length, 5);
    for (let output = 0; output < 5; output += 1) {
      assert(activeConnections(spawner.genome).some((connection) => connection.target.kind === "output" && connection.target.index === output));
    }
    for (const connection of activeConnections(spawner.genome)) {
      assert(isLegalConnection(spawner.genome, connection.source, connection.target, world.config));
    }
  }
}

function testZeroMutationLeavesGenomeUnchanged() {
  const world = createSpawnerWorld(404, {
    initialSpawners: 1,
    addUnitRate: 0,
    disableUnitRate: 0,
    reenableUnitRate: 0,
    addConnectionRate: 0,
    disableConnectionRate: 0,
    reenableConnectionRate: 0,
    weightMutationRate: 0,
    biasMutationRate: 0,
    mutationStdDevMutationStdDev: 0,
    thresholdBiasMutationStdDev: 0,
    minHorizonMutationStdDev: 0,
    maxHorizonMutationStdDev: 0,
    cooldownBaseMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const before = JSON.stringify(spawner.genome);
  const child = mutateGenome(spawner.genome, new SeededRng(1), world.config, world.innovations);
  assert.equal(JSON.stringify(child), before);
}

function testDisabledGenesDoNotAffectForwardPass() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const inputs = Array.from({ length: 15 }, (_, index) => index / 15);
  const unit = activeUnits(spawner.genome)[0];
  assert(unit);
  spawner.genome.connections.push({
    innovationId: connectionInnovationId({ kind: "input", index: 0 }, { kind: "hidden", unitId: unit.unitId, gate: "candidate" }),
    source: { kind: "input", index: 0 },
    target: { kind: "hidden", unitId: unit.unitId, gate: "candidate" },
    weight: 1_000_000,
    enabled: false,
  });
  const clone = createSpawnerWorld(505, { initialSpawners: 1 }).spawners[0];
  assert(clone);
  const after = forwardSpawner(spawner, inputs).map(round);
  const expected = forwardSpawner(clone, inputs).map(round);
  assert.deepEqual(after, expected);
}

function testLongSparseRunAvoidsInvalidNumbers() {
  const { world } = runTo(240, 606);
  for (const spawner of world.spawners) {
    assert(Number.isFinite(spawner.energy));
    assert(Number.isFinite(spawner.health));
    assert(Object.values(spawner.hiddenState).every(Number.isFinite));
    const metrics = architectureMetrics(spawner.genome);
    assert(metrics.activeUnits >= 0);
    assert(metrics.activeConnections >= 0);
  }
  for (const sample of world.telemetry) {
    assert(Number.isFinite(sample.averageActiveUnits));
    assert(Number.isFinite(sample.averageActiveConnections));
    assert(Number.isFinite(sample.averageActiveLayers));
  }
}

function testTelemetryTrimKeepsValidRange() {
  const { world } = runTo(650);
  assert.equal(world.telemetry.length, 3000);
  assert((world.telemetry[0]?.tick ?? 0) > 1);
  assert.equal(world.telemetry.at(-1)?.tick, world.tick);
  for (let index = 1; index < world.telemetry.length; index += 1) {
    assert.equal(world.telemetry[index]?.tick, (world.telemetry[index - 1]?.tick ?? 0) + 1);
  }
}

function testExpiredTickLookupThrows() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS, 0.18, 3);
  advanceMarketTimeline(timeline, 10, 1000);
  assert.throws(() => getTimelineSampleByTick(timeline, 1), /expired/);
  assert.doesNotThrow(() => getTimelineSampleByTick(timeline, timeline.tick));
}

function round(value: number) {
  return Number(value.toFixed(6));
}

testTimelineHistoryIsProspective();
testFutureNoiseDoesNotSmoothAfterItBecomesHistory();
testBacklogDrainsWithoutSkippingTicks();
testLargeElapsedTimeCreatesBacklog();
testFoodResolvesExactlyOnce();
testDeadSpawnerCannotActAfterResolvedLoss();
testCooldownSpawnerReportsWait();
testSpawnerConfigAffectsNewWorlds();
testMarketSettingsSanitizerClampsSavedValues();
testSpawnerConfigSanitizerClampsAndNormalizesPairs();
testInitialSpawnersRespectPopulationCap();
testDeterministicSeedOutcome();
testFixedSpawnerForwardSnapshot();
testSparseInnovationIdsAreStable();
testFounderUnitInnovationIdsAreWorldUnique();
testConnectionInnovationRegistryReusesIds();
testOutputConnectionLegalityRejectsPreviousHidden();
testReenableConnectionSkipsIllegalConnections();
testSparseConnectionRulesAndMutation();
testAddUnitMutationWiresNewUnit();
testDisableLastActiveUnitIsPrevented();
testAddUnitAfterAllDisabledStartsAtLayerOne();
testGenomeValidationCatchesInvalidTopology();
testHiddenStateAlignmentForReenabledUnits();
testDeeperLayerUsesLowerLayerCurrentState();
testSparseFounderTopologyGuarantees();
testZeroMutationLeavesGenomeUnchanged();
testDisabledGenesDoNotAffectForwardPass();
testLongSparseRunAvoidsInvalidNumbers();
testTelemetryTrimKeepsValidRange();
testExpiredTickLookupThrows();

console.log("Sine simulator contract tests passed.");
