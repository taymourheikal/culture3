import { strict as assert } from "node:assert";
import {
  activeConnections,
  activeUnits,
  alignHiddenState,
  architectureMetrics,
  brainPlanSignature,
  connectionInnovationId,
  connectionDeltaKey,
  createEffectiveGenomeView,
  createSpawnerWorld,
  evaluateSpawnerBrain,
  forwardSpawner,
  ensureCompiledBrainPlan,
  getEffectiveConnectionWeight,
  getEffectiveGateBias,
  getEffectiveOutputBias,
  INPUT_COUNT,
  isLegalConnection,
  mutateGenome,
  normalizeSpawnerGenomeForCurrentContract,
  OUTPUT_COUNT,
  OUTPUT_INDEX,
  SeededRng,
} from "../../src/sine/spawnerSimulation";
import { createSpawnerSnapshot } from "../../src/sine/spawner/snapshots";
import { hiddenArrayToCurrentRecord, hiddenRecordToArray, mergeHiddenStateRecord } from "../../src/sine/spawner/brainState";
import { createEffectiveBrainValues, createPlanAlignedEffectiveBrainValues } from "../../src/sine/spawner/effectiveGenome";
import { createPlanAlignedLearnedStateView, materializePlanAlignedLearnedStateView } from "../../src/sine/spawner/learnedStateView";
import { gateBiasDeltaKey, outputBiasDeltaKey } from "../../src/sine/spawner/plasticity";
import { chooseSpawnerAction, decodeSpawnerOutputs } from "../../src/sine/spawner/worldActions";
import { round, runTo, type SineTest } from "./helpers";

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
  const outputs = forwardSpawner(spawner, Array.from({ length: INPUT_COUNT }, () => 0));
  assert(outputs.every(Number.isFinite));
  assert(Number.isFinite(spawner.hiddenState[unit.unitId]));
}

function testDeeperLayerUsesLowerLayerCurrentState() {
  const world = createSpawnerWorld(707, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.hiddenState = { 1: 0, 2: 0 };
  spawner.genome = {
    ...spawner.genome,
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
    outputBias: Array.from({ length: OUTPUT_COUNT }, () => 0),
    nextUnitId: 3,
    mutationStd: 0,
    thresholdBias: 0,
    minHorizonTicks: 1,
    maxHorizonTicks: 2,
    cooldownBaseTicks: 1,
  };
  const outputs = forwardSpawner(spawner, [1, ...Array.from({ length: INPUT_COUNT - 1 }, () => 0)]);
  assert((outputs[OUTPUT_INDEX.long] ?? 0) > 0.5);
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

function testOldFiveOutputGenomeNormalizesForInspection() {
  const world = createSpawnerWorld(101, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const oldGenome = {
    ...spawner.genome,
    outputBias: spawner.genome.outputBias.slice(0, 5),
  };
  const normalized = normalizeSpawnerGenomeForCurrentContract(oldGenome);

  assert.equal(normalized.outputBias.length, OUTPUT_COUNT);
  assert.equal(normalized.outputBias[OUTPUT_INDEX.reproduce], 0);
  assert.equal(normalized.perception.deltaLagPairs.length, 5);
  assert.equal(normalized.payoffProfile.scaleWindowTicks, 53);
  assert.equal(normalized.payoffProfile.scaleSampleStepTicks, 3);
  assert.equal(normalized.tradingPolicy.spawnThreshold, 0.56);
  assert.equal(normalized.tradingPolicy.minSignalStrength, 0.05);
  assert(Number.isFinite(normalized.mutationProfile.weightMutationStdDev));
}

function testFounderTradingPolicyDefaultsBecomeGenomeTraits() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    defaultSpawnThreshold: 0.72,
    defaultMinSignalStrength: 0.31,
  });
  const spawner = world.spawners[0];
  assert(spawner);

  assert.equal(spawner.genome.tradingPolicy.spawnThreshold, 0.72);
  assert.equal(spawner.genome.tradingPolicy.minSignalStrength, 0.31);
}

function testTradingPolicyControlsActionAndStrengthPerAgent() {
  const world = createSpawnerWorld(101, {
    initialSpawners: 1,
    initialCooldownMaxTicks: 0,
    initialEnergyMin: 100,
    initialEnergyMax: 100,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.cooldownTicks = 0;
  spawner.genome.thresholdBias = 0;
  spawner.genome.tradingPolicy = { spawnThreshold: 0.6, minSignalStrength: 0.35 };

  const waitDecoded = decodeSpawnerOutputs(world, spawner, Array.from({ length: OUTPUT_COUNT }, () => 0));
  assert.equal(waitDecoded.strength, 0.5);
  assert.equal(chooseSpawnerAction(world, spawner, waitDecoded), "wait");

  spawner.genome.tradingPolicy = { spawnThreshold: 0.4, minSignalStrength: 0.35 };
  const longDecoded = decodeSpawnerOutputs(world, spawner, Array.from({ length: OUTPUT_COUNT }, (_, index) => (index === OUTPUT_INDEX.strength ? -100 : 0)));
  assert.equal(longDecoded.strength, 0.35);
  assert.equal(chooseSpawnerAction(world, spawner, longDecoded), "long");
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
    for (let output = 0; output < OUTPUT_COUNT; output += 1) {
      assert(activeConnections(spawner.genome).some((connection) => connection.target.kind === "output" && connection.target.index === output));
    }
    for (const connection of activeConnections(spawner.genome)) {
      assert(isLegalConnection(spawner.genome, connection.source, connection.target, world.config));
    }
  }
}

function testFounderReproductionOutputStartsConservative() {
  const world = createSpawnerWorld(303, { initialSpawners: 8 });
  for (const spawner of world.spawners) {
    assert((spawner.genome.outputBias[OUTPUT_INDEX.reproduce] ?? 0) < -4);
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
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    perceptionLagMutationStdDev: 0,
    perceptionWindowMutationStdDev: 0,
    perceptionSensitivityMutationStdDev: 0,
    perceptionDensityScaleMutationStdDev: 0,
    payoffScaleMutationRate: 0,
    payoffScaleWindowMutationStdDev: 0,
    payoffScaleSampleStepMutationStdDev: 0,
    tradingPolicyMutationRate: 0,
    spawnThresholdMutationStdDev: 0,
    minSignalStrengthMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const before = JSON.stringify(spawner.genome);
  const child = mutateGenome(spawner.genome, new SeededRng(1), world.config, world.innovations);
  assert.equal(JSON.stringify(child), before);
}

function testPayoffAndPerceptionMutationAreIndependent() {
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
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);

  spawner.genome.mutationProfile = {
    ...spawner.genome.mutationProfile,
    perceptionMutationRate: 1,
    perceptionLagMutationStdDev: 50,
    perceptionWindowMutationStdDev: 50,
    perceptionSensitivityMutationStdDev: 0.01,
    perceptionDensityScaleMutationStdDev: 50,
    payoffScaleMutationRate: 0,
    payoffScaleWindowMutationStdDev: 50,
    payoffScaleSampleStepMutationStdDev: 50,
    tradingPolicyMutationRate: 0,
    mutationProfileMutationStdDev: 0,
  };
  const perceptionOnly = mutateGenome(spawner.genome, new SeededRng(1), world.config, world.innovations);
  assert.deepEqual(perceptionOnly.payoffProfile, spawner.genome.payoffProfile);
  assert.notDeepEqual(perceptionOnly.perception, spawner.genome.perception);

  spawner.genome.mutationProfile = {
    ...spawner.genome.mutationProfile,
    perceptionMutationRate: 0,
    payoffScaleMutationRate: 1,
    payoffScaleWindowMutationStdDev: 50,
    payoffScaleSampleStepMutationStdDev: 50,
    mutationProfileMutationStdDev: 0,
  };
  const payoffOnly = mutateGenome(spawner.genome, new SeededRng(2), world.config, world.innovations);
  assert.deepEqual(payoffOnly.perception, spawner.genome.perception);
  assert.notDeepEqual(payoffOnly.payoffProfile, spawner.genome.payoffProfile);
}

function testTradingPolicyMutationIsIndependent() {
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
    thresholdBiasMutationStdDev: 0,
    minHorizonTicksMutationStdDev: 0,
    maxHorizonTicksMutationStdDev: 0,
    cooldownBaseTicksMutationStdDev: 0,
    perceptionMutationRate: 0,
    payoffScaleMutationRate: 0,
    mutationProfileMutationStdDev: 0,
    plasticityMutationStdDev: 0,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.mutationProfile = {
    ...spawner.genome.mutationProfile,
    tradingPolicyMutationRate: 0,
    spawnThresholdMutationStdDev: 1,
    minSignalStrengthMutationStdDev: 1,
  };
  const unchanged = mutateGenome(spawner.genome, new SeededRng(1), world.config, world.innovations);
  assert.deepEqual(unchanged.tradingPolicy, spawner.genome.tradingPolicy);

  spawner.genome.mutationProfile = {
    ...spawner.genome.mutationProfile,
    tradingPolicyMutationRate: 1,
    spawnThresholdMutationStdDev: 1,
    minSignalStrengthMutationStdDev: 1,
  };
  const changed = mutateGenome(spawner.genome, new SeededRng(2), world.config, world.innovations);
  assert.notDeepEqual(changed.tradingPolicy, spawner.genome.tradingPolicy);
  assert.deepEqual(changed.perception, spawner.genome.perception);
  assert.deepEqual(changed.payoffProfile, spawner.genome.payoffProfile);
}

function testDisabledGenesDoNotAffectForwardPass() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => index / INPUT_COUNT);
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

function testEffectiveGenomeViewEqualsBaseGenome() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const view = createEffectiveGenomeView(spawner.genome);

  for (const connection of spawner.genome.connections) {
    assert.equal(getEffectiveConnectionWeight(connection), connection.weight);
    assert.equal(view.getConnectionWeight(connection), connection.weight);
  }
  for (const unit of spawner.genome.units) {
    assert.equal(getEffectiveGateBias(unit, "update"), unit.updateBias);
    assert.equal(getEffectiveGateBias(unit, "reset"), unit.resetBias);
    assert.equal(getEffectiveGateBias(unit, "candidate"), unit.candidateBias);
    assert.equal(view.getGateBias(unit, "update"), unit.updateBias);
    assert.equal(view.getGateBias(unit, "reset"), unit.resetBias);
    assert.equal(view.getGateBias(unit, "candidate"), unit.candidateBias);
  }
  for (let output = 0; output < OUTPUT_COUNT; output += 1) {
    assert.equal(getEffectiveOutputBias(spawner.genome, output), spawner.genome.outputBias[output] ?? 0);
    assert.equal(view.getOutputBias(output), spawner.genome.outputBias[output] ?? 0);
  }
}

function testBrainEvaluationWrapperMatchesForwardSpawner() {
  const firstWorld = createSpawnerWorld(202, { initialSpawners: 1 });
  const secondWorld = createSpawnerWorld(202, { initialSpawners: 1 });
  const first = firstWorld.spawners[0];
  const second = secondWorld.spawners[0];
  assert(first);
  assert(second);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index));
  const evaluation = evaluateSpawnerBrain(first, inputs);
  const forwardOutputs = forwardSpawner(second, inputs);

  assert.deepEqual(evaluation.outputs.map(round), forwardOutputs.map(round));
  assert.deepEqual({ ...evaluation.previousState, ...evaluation.currentState }, second.hiddenState);
}

function testCachedAndFreshBrainPlansMatchExactly() {
  const cachedWorld = createSpawnerWorld(202, { initialSpawners: 1 });
  const freshWorld = createSpawnerWorld(202, { initialSpawners: 1 });
  const cached = cachedWorld.spawners[0];
  const fresh = freshWorld.spawners[0];
  assert(cached);
  assert(fresh);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.cos(index / 3));
  const cachedEvaluation = evaluateSpawnerBrain(cached, inputs);
  const freshEvaluation = evaluateSpawnerBrain(fresh, inputs, undefined, { useCachedPlan: false });

  assert.deepEqual(cachedEvaluation, freshEvaluation);
}

function testBrainPlanCountsMatchArchitectureMetrics() {
  const world = createSpawnerWorld(303, { initialSpawners: 1, initialHiddenUnitsMin: 5, initialHiddenUnitsMax: 5 });
  const spawner = world.spawners[0];
  assert(spawner);
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const metrics = architectureMetrics(spawner.genome);

  assert.equal(plan.activeUnitCount, metrics.activeUnits);
  assert.equal(plan.activeConnectionCount, metrics.activeConnections);
  assert.equal(plan.activeLayerCount, metrics.activeLayers);
  assert.deepEqual(plan.activeConnectionIds, activeConnections(spawner.genome).map((connection) => connection.innovationId));
}

function testBrainPlanDenseIndexesAreStableForSparseUnits() {
  const world = createSpawnerWorld(303, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.units = [
    { unitId: 11, innovationId: 11, layerIndex: 1, enabled: true, updateBias: 0, resetBias: 0, candidateBias: 0 },
    { unitId: 42, innovationId: 42, layerIndex: 2, enabled: false, updateBias: 0, resetBias: 0, candidateBias: 0 },
    { unitId: 99, innovationId: 99, layerIndex: 2, enabled: true, updateBias: 0, resetBias: 0, candidateBias: 0 },
  ];
  spawner.genome.connections = [];

  const plan = ensureCompiledBrainPlan(spawner.genome);

  assert.deepEqual(plan.unitIds, [11, 99]);
  assert.equal(plan.unitIndexById.get(11), 0);
  assert.equal(plan.unitIndexById.get(99), 1);
  assert.equal(plan.unitIndexById.has(42), false);
  assert.deepEqual(plan.layers.map((layer) => layer.units.map((unit) => unit.unitIndex)), [[0], [1]]);
}

function testHiddenStateArrayConversionPreservesPublicDisabledState() {
  const world = createSpawnerWorld(303, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.units = [
    { unitId: 11, innovationId: 11, layerIndex: 1, enabled: true, updateBias: 0, resetBias: 0, candidateBias: 0 },
    { unitId: 42, innovationId: 42, layerIndex: 2, enabled: false, updateBias: 0, resetBias: 0, candidateBias: 0 },
    { unitId: 99, innovationId: 99, layerIndex: 2, enabled: true, updateBias: 0, resetBias: 0, candidateBias: 0 },
  ];
  spawner.genome.connections = [];
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const previous = { 11: 0.25, 42: Number.NaN, 99: -0.5, 1234: 7 };

  assert.deepEqual(hiddenRecordToArray(plan, previous), [0.25, -0.5]);
  assert.deepEqual(hiddenArrayToCurrentRecord(plan, [1.5, -1.5]), { 11: 1.5, 99: -1.5 });
  assert.deepEqual(mergeHiddenStateRecord(spawner.genome, plan, previous, [1.5, -1.5]), {
    11: 1.5,
    42: 0,
    99: -1.5,
    1234: 7,
  });
}

function testBrainPlanRebuildsAfterStructuralMutationButNotWeightMutation() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const firstPlan = ensureCompiledBrainPlan(spawner.genome);
  const connection = activeConnections(spawner.genome)[0];
  assert(connection);
  const firstSignature = brainPlanSignature(spawner.genome);
  connection.weight += 0.25;
  const weightOnlyPlan = ensureCompiledBrainPlan(spawner.genome);

  assert.equal(brainPlanSignature(spawner.genome), firstSignature);
  assert.equal(weightOnlyPlan, firstPlan);

  connection.enabled = false;
  const structuralPlan = ensureCompiledBrainPlan(spawner.genome);

  assert.notEqual(brainPlanSignature(spawner.genome), firstSignature);
  assert.notEqual(structuralPlan, firstPlan);
  assert.equal(structuralPlan.activeConnectionIds.includes(connection.innovationId), false);
}

function testLearnedDeltasUseSameBrainPlan() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index / 2));
  const before = evaluateSpawnerBrain(spawner, inputs, undefined, { plan }).outputs.map(round);
  const outputConnections = activeConnections(spawner.genome).filter((connection) => connection.target.kind === "output");
  assert(outputConnections.length > 0);
  for (const connection of outputConnections) {
    spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.5;
  }
  const afterPlan = ensureCompiledBrainPlan(spawner.genome);
  const after = evaluateSpawnerBrain(spawner, inputs, undefined, { plan: afterPlan }).outputs.map(round);

  assert.equal(afterPlan, plan);
  assert.notDeepEqual(after, before);
}

function testFastEffectiveValuesMatchSafeViewAndCurrentGenomeWeights() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome)[0];
  const unit = activeUnits(spawner.genome)[0];
  assert(connection);
  assert(unit);
  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.25;
  spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -0.5;
  spawner.learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")] = 0.75;
  const safe = createEffectiveGenomeView(spawner.genome, spawner.learnedState);
  const fast = createEffectiveBrainValues(spawner.genome, spawner.learnedState, { assumeNormalizedLearnedState: true });

  assert.equal(fast.getConnectionWeight(connection), safe.getConnectionWeight(connection));
  assert.equal(fast.getOutputBias(0), safe.getOutputBias(0));
  assert.equal(fast.getGateBias(unit, "update"), safe.getGateBias(unit, "update"));

  const cachedPlanConnection = structuredClone(connection);
  connection.weight += 1.25;
  const safeAfterWeightChange = createEffectiveGenomeView(spawner.genome, spawner.learnedState);
  const fastAfterWeightChange = createEffectiveBrainValues(spawner.genome, spawner.learnedState, { assumeNormalizedLearnedState: true });
  assert.equal(fastAfterWeightChange.getConnectionWeight(cachedPlanConnection), safeAfterWeightChange.getConnectionWeight(cachedPlanConnection));
  assert.notEqual(fastAfterWeightChange.getConnectionWeight(cachedPlanConnection), fast.getConnectionWeight(cachedPlanConnection));
}

function testPlanAlignedEffectiveValuesMatchObjectPathAndClamp() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome)[0];
  const unit = activeUnits(spawner.genome)[0];
  assert(connection);
  assert(unit);
  spawner.genome.plasticityProfile.maxLearnedDelta = 0.5;
  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 2;
  spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -2;
  spawner.learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "candidate")] = 2;
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const objectValues = createEffectiveBrainValues(spawner.genome, spawner.learnedState);
  const planValues = createPlanAlignedEffectiveBrainValues(spawner.genome, spawner.learnedState, plan);
  const connectionIndex = plan.connectionIndexByInnovationId.get(connection.innovationId);
  const unitIndex = plan.unitIndexById.get(unit.unitId);
  assert.notEqual(connectionIndex, undefined);
  assert.notEqual(unitIndex, undefined);

  assert.equal(planValues.getConnectionWeight(connection), objectValues.getConnectionWeight(connection));
  assert.equal(planValues.connectionWeightsByPlanIndex[connectionIndex!], objectValues.getConnectionWeight(connection));
  assert.equal(planValues.getOutputBias(0), objectValues.getOutputBias(0));
  assert.equal(planValues.outputBiases[0], objectValues.getOutputBias(0));
  assert.equal(planValues.getGateBias(unit, "candidate"), objectValues.getGateBias(unit, "candidate"));
  assert.equal(planValues.candidateGateBiasesByUnitIndex[unitIndex!], objectValues.getGateBias(unit, "candidate"));

  const clampedConnectionWeight = planValues.getConnectionWeight(connection);
  const clampedOutputBias = planValues.getOutputBias(0);
  const clampedGateBias = planValues.getGateBias(unit, "candidate");
  spawner.genome.plasticityProfile.maxLearnedDelta = 1.5;
  const lessClamped = createPlanAlignedEffectiveBrainValues(spawner.genome, spawner.learnedState, plan);
  assert.notEqual(lessClamped.getConnectionWeight(connection), clampedConnectionWeight);
  assert.notEqual(lessClamped.getOutputBias(0), clampedOutputBias);
  assert.notEqual(lessClamped.getGateBias(unit, "candidate"), clampedGateBias);
}

function testPlanAlignedLearnedStateViewMatchesPublicMapsAndMaterializes() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome)[0];
  const unit = activeUnits(spawner.genome)[0];
  assert(connection);
  assert(unit);
  spawner.genome.plasticityProfile.maxLearnedDelta = 0.75;
  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 2;
  spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -2;
  spawner.learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "reset")] = 0.25;
  spawner.learnedState.recentLearningSignal = 0.4;
  spawner.learnedState.learningUpdateCount = 3;
  spawner.learnedState.reproductionLearningCount = 2;
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const connectionIndex = plan.connectionIndexByInnovationId.get(connection.innovationId);
  const unitIndex = plan.unitIndexById.get(unit.unitId);
  assert.notEqual(connectionIndex, undefined);
  assert.notEqual(unitIndex, undefined);

  const view = createPlanAlignedLearnedStateView(spawner.genome, spawner.learnedState, plan);
  assert.equal(view.planSignature, plan.signature);
  assert.equal(view.connectionDeltasByPlanIndex[connectionIndex!], 0.75);
  assert.equal(view.outputBiasDeltas[0], -0.75);
  assert.equal(view.resetGateBiasDeltasByUnitIndex[unitIndex!], 0.25);
  assert.equal(view.activeConnectionDeltaCount, 1);
  assert.equal(view.activeOutputBiasDeltaCount, 1);
  assert.equal(view.activeGateBiasDeltaCount, 1);
  assert.equal(view.activeDeltaCount, 3);
  assert.equal(view.recentLearningSignal, 0.4);
  assert.equal(view.learningUpdateCount, 3);
  assert.equal(view.reproductionLearningCount, 2);

  assert.deepEqual(materializePlanAlignedLearnedStateView(view, plan), {
    connectionDeltas: { [connectionDeltaKey(connection.innovationId)]: 0.75 },
    outputBiasDeltas: { [outputBiasDeltaKey(0)]: -0.75 },
    gateBiasDeltas: { [gateBiasDeltaKey(unit.unitId, "reset")]: 0.25 },
    recentLearningSignal: 0.4,
    learningUpdateCount: 3,
    reproductionLearningCount: 2,
  });
}

function testPlanAlignedEffectiveValuesAcceptLearnedStateView() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome)[0];
  const unit = activeUnits(spawner.genome)[0];
  assert(connection);
  assert(unit);
  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.25;
  spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -0.5;
  spawner.learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "candidate")] = 0.75;
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const view = createPlanAlignedLearnedStateView(spawner.genome, spawner.learnedState, plan);
  const fromMaps = createPlanAlignedEffectiveBrainValues(spawner.genome, spawner.learnedState, plan);
  const fromView = createPlanAlignedEffectiveBrainValues(spawner.genome, view, plan);

  assert.deepEqual(fromView.connectionWeightsByPlanIndex, fromMaps.connectionWeightsByPlanIndex);
  assert.deepEqual(fromView.outputBiases, fromMaps.outputBiases);
  assert.deepEqual(fromView.updateGateBiasesByUnitIndex, fromMaps.updateGateBiasesByUnitIndex);
  assert.deepEqual(fromView.resetGateBiasesByUnitIndex, fromMaps.resetGateBiasesByUnitIndex);
  assert.deepEqual(fromView.candidateGateBiasesByUnitIndex, fromMaps.candidateGateBiasesByUnitIndex);
  assert.equal(fromView.getConnectionWeight(connection), fromMaps.getConnectionWeight(connection));
  assert.equal(fromView.getOutputBias(0), fromMaps.getOutputBias(0));
  assert.equal(fromView.getGateBias(unit, "candidate"), fromMaps.getGateBias(unit, "candidate"));

  const staleWorld = createSpawnerWorld(606, { initialSpawners: 1 });
  const staleConnection = activeConnections(staleWorld.spawners[0]!.genome)[0];
  assert(staleConnection);
  staleConnection.enabled = false;
  const stalePlan = ensureCompiledBrainPlan(staleWorld.spawners[0]!.genome);
  assert.throws(() => createPlanAlignedEffectiveBrainValues(spawner.genome, view, stalePlan), /learned-state view/);
}

function testPlanAlignedEffectiveValuesTrackBaseGenomeChangesWithCachedPlan() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome)[0];
  const unit = activeUnits(spawner.genome)[0];
  assert(connection);
  assert(unit);
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const before = createPlanAlignedEffectiveBrainValues(spawner.genome, spawner.learnedState, plan);
  const connectionIndex = plan.connectionIndexByInnovationId.get(connection.innovationId);
  const unitIndex = plan.unitIndexById.get(unit.unitId);
  assert.notEqual(connectionIndex, undefined);
  assert.notEqual(unitIndex, undefined);
  const clonedPlanConnection = structuredClone(connection);

  connection.weight += 1.25;
  spawner.genome.outputBias[0] = (spawner.genome.outputBias[0] ?? 0) - 0.75;
  unit.resetBias += 0.5;
  const safeAfterChange = createEffectiveGenomeView(spawner.genome, spawner.learnedState);
  const after = createPlanAlignedEffectiveBrainValues(spawner.genome, spawner.learnedState, plan);

  assert.equal(after.planSignature, before.planSignature);
  assert.equal(after.connectionWeightsByPlanIndex[connectionIndex!], safeAfterChange.getConnectionWeight(connection));
  assert.equal(after.getConnectionWeight(clonedPlanConnection), safeAfterChange.getConnectionWeight(connection));
  assert.equal(after.outputBiases[0], safeAfterChange.getOutputBias(0));
  assert.equal(after.resetGateBiasesByUnitIndex[unitIndex!], safeAfterChange.getGateBias(unit, "reset"));
  assert.notEqual(after.connectionWeightsByPlanIndex[connectionIndex!], before.connectionWeightsByPlanIndex[connectionIndex!]);
  assert.notEqual(after.outputBiases[0], before.outputBiases[0]);
  assert.notEqual(after.resetGateBiasesByUnitIndex[unitIndex!], before.resetGateBiasesByUnitIndex[unitIndex!]);
}

function testPlanAlignedEffectiveValuesRejectStaleTopology() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const plan = ensureCompiledBrainPlan(spawner.genome);
  const connection = activeConnections(spawner.genome)[0];
  assert(connection);
  connection.enabled = false;

  assert.throws(
    () => createPlanAlignedEffectiveBrainValues(spawner.genome, spawner.learnedState, plan, { verifyTopology: true }),
    /Compiled brain plan .* topology/,
  );
}

function testCompiledBrainPlanDoesNotLeakIntoSnapshots() {
  const world = createSpawnerWorld(505, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  ensureCompiledBrainPlan(spawner.genome);
  const serialized = JSON.stringify(createSpawnerSnapshot(spawner));

  assert.equal(serialized.includes("CompiledBrainPlan"), false);
  assert.equal(serialized.includes("brainPlan"), false);
  assert.equal(serialized.includes("activeConnectionIds"), false);
}

export const tests: SineTest[] = [
  { name: "Hidden State Alignment For Reenabled Units", run: testHiddenStateAlignmentForReenabledUnits },
  { name: "Deeper Layer Uses Lower Layer Current State", run: testDeeperLayerUsesLowerLayerCurrentState },
  { name: "Sparse Founder Topology Guarantees", run: testSparseFounderTopologyGuarantees },
  { name: "Founder Reproduction Output Starts Conservative", run: testFounderReproductionOutputStartsConservative },
  { name: "Old Five Output Genome Normalizes For Inspection", run: testOldFiveOutputGenomeNormalizesForInspection },
  { name: "Founder Trading Policy Defaults Become Genome Traits", run: testFounderTradingPolicyDefaultsBecomeGenomeTraits },
  { name: "Trading Policy Controls Action And Strength Per Agent", run: testTradingPolicyControlsActionAndStrengthPerAgent },
  { name: "Zero Mutation Leaves Genome Unchanged", run: testZeroMutationLeavesGenomeUnchanged },
  { name: "Payoff And Perception Mutation Are Independent", run: testPayoffAndPerceptionMutationAreIndependent },
  { name: "Trading Policy Mutation Is Independent", run: testTradingPolicyMutationIsIndependent },
  { name: "Disabled Genes Do Not Affect Forward Pass", run: testDisabledGenesDoNotAffectForwardPass },
  { name: "Effective Genome View Equals Base Genome", run: testEffectiveGenomeViewEqualsBaseGenome },
  { name: "Brain Evaluation Wrapper Matches Forward Spawner", run: testBrainEvaluationWrapperMatchesForwardSpawner },
  { name: "Cached And Fresh Brain Plans Match Exactly", run: testCachedAndFreshBrainPlansMatchExactly },
  { name: "Brain Plan Counts Match Architecture Metrics", run: testBrainPlanCountsMatchArchitectureMetrics },
  { name: "Brain Plan Dense Indexes Are Stable For Sparse Units", run: testBrainPlanDenseIndexesAreStableForSparseUnits },
  { name: "Hidden State Array Conversion Preserves Public Disabled State", run: testHiddenStateArrayConversionPreservesPublicDisabledState },
  { name: "Brain Plan Rebuilds After Structural Mutation But Not Weight Mutation", run: testBrainPlanRebuildsAfterStructuralMutationButNotWeightMutation },
  { name: "Learned Deltas Use Same Brain Plan", run: testLearnedDeltasUseSameBrainPlan },
  { name: "Fast Effective Values Match Safe View And Current Genome Weights", run: testFastEffectiveValuesMatchSafeViewAndCurrentGenomeWeights },
  { name: "Plan Aligned Effective Values Match Object Path And Clamp", run: testPlanAlignedEffectiveValuesMatchObjectPathAndClamp },
  { name: "Plan Aligned Learned State View Matches Public Maps And Materializes", run: testPlanAlignedLearnedStateViewMatchesPublicMapsAndMaterializes },
  { name: "Plan Aligned Effective Values Accept Learned State View", run: testPlanAlignedEffectiveValuesAcceptLearnedStateView },
  { name: "Plan Aligned Effective Values Track Base Genome Changes With Cached Plan", run: testPlanAlignedEffectiveValuesTrackBaseGenomeChangesWithCachedPlan },
  { name: "Plan Aligned Effective Values Reject Stale Topology", run: testPlanAlignedEffectiveValuesRejectStaleTopology },
  { name: "Compiled Brain Plan Does Not Leak Into Snapshots", run: testCompiledBrainPlanDoesNotLeakIntoSnapshots },
];
