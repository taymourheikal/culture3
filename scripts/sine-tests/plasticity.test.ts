import { strict as assert } from "node:assert";
import {
  cloneLearnedState,
  cloneTraceStore,
  connectionDeltaKey,
  createEffectiveGenomeView,
  createEmptyLearnedState,
  createEmptyTraceStore,
  createSpawnerWorld,
  decayLearnedState,
  driftPlasticityProfile,
  gateBiasDeltaKey,
  getEffectiveConnectionDetail,
  getEffectiveConnectionWeight,
  getEffectiveGateBias,
  getEffectiveGateBiasDetail,
  getEffectiveOutputBias,
  getEffectiveOutputBiasDetail,
  applyLearningSignal,
  applyReproductionLearning,
  learningSignalFromPayoff,
  learnedStateNorm,
  outputBiasDeltaKey,
  pruneDecisionTraces,
  sanitizeLearnedState,
  sanitizePlasticityProfile,
  sanitizeTraceStore,
  activeConnections,
  materializeEffectiveGenomeForInheritance,
  validateGenome,
  type SpawnerDecisionTrace,
} from "../../src/sine/spawnerSimulation";
import { createSpawnerSnapshot } from "../../src/sine/spawner/snapshots";
import { normalizeSpawnerGenomeForCurrentContract } from "../../src/sine/spawner/genome";
import type { SineTest } from "./helpers";

function testPlasticityModelsCreateWithoutWorld() {
  const learnedState = createEmptyLearnedState();
  const traceStore = createEmptyTraceStore();
  const profile = sanitizePlasticityProfile(undefined);

  assert.deepEqual(learnedState.connectionDeltas, {});
  assert.deepEqual(learnedState.outputBiasDeltas, {});
  assert.deepEqual(learnedState.gateBiasDeltas, {});
  assert.equal(traceStore.nextTraceId, 1);
  assert.deepEqual(traceStore.traces, {});
  assert.equal(profile.weightLearningRate, 0);
  assert.equal(profile.biasLearningRate, 0);
  assert.equal(profile.reproductionRewardStrength, 0);
  assert.equal(profile.plasticityMutationStdDev, 0);
}

function testPlasticitySanitizeCloneNormAndDecay() {
  const learnedState = sanitizeLearnedState(
    {
      connectionDeltas: { "1": 3, "2": Number.NaN, "3": -9 },
      outputBiasDeltas: { "0": 4 },
      gateBiasDeltas: { "7:update": -4 },
      recentLearningSignal: Number.POSITIVE_INFINITY,
      learningUpdateCount: 1.4,
      reproductionLearningCount: -2,
    },
    2,
  );

  assert.deepEqual(learnedState.connectionDeltas, { "1": 2, "3": -2 });
  assert.deepEqual(learnedState.outputBiasDeltas, { "0": 2 });
  assert.deepEqual(learnedState.gateBiasDeltas, { "7:update": -2 });
  assert.equal(learnedState.recentLearningSignal, 0);
  assert.equal(learnedState.learningUpdateCount, 1);
  assert.equal(learnedState.reproductionLearningCount, 0);
  assert.equal(Number(learnedStateNorm(learnedState).toFixed(6)), 4);

  const cloned = cloneLearnedState(learnedState);
  cloned.connectionDeltas["1"] = 1;
  assert.equal(learnedState.connectionDeltas["1"], 2);

  const decayed = decayLearnedState(learnedState, { experienceDecayRate: 0.25, maxLearnedDelta: 2 });
  assert.equal(decayed.connectionDeltas["1"], 1.5);
}

function testLegacyAgentAndGenomeNormalizeToZeroLearning() {
  const world = createSpawnerWorld(12, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);

  assert.deepEqual(spawner.learnedState, createEmptyLearnedState());
  assert.deepEqual(spawner.traceStore, createEmptyTraceStore());
  assert.equal(spawner.genome.plasticityProfile.weightLearningRate, 0.012);

  const zeroLearningWorld = createSpawnerWorld(12, { initialSpawners: 1, plasticityWeightLearningRate: 0, plasticityBiasLearningRate: 0 });
  assert.equal(zeroLearningWorld.spawners[0]?.genome.plasticityProfile.weightLearningRate, 0);
  assert.equal(zeroLearningWorld.spawners[0]?.genome.plasticityProfile.biasLearningRate, 0);

  const legacyGenome = structuredClone(spawner.genome) as Partial<typeof spawner.genome>;
  delete legacyGenome.plasticityProfile;
  const normalizedGenome = normalizeSpawnerGenomeForCurrentContract(legacyGenome as typeof spawner.genome);
  assert.deepEqual(normalizedGenome.plasticityProfile, sanitizePlasticityProfile(undefined));

  const legacySpawner = structuredClone(spawner) as Partial<typeof spawner>;
  delete legacySpawner.learnedState;
  delete legacySpawner.traceStore;
  delete (legacySpawner.genome as Partial<typeof spawner.genome>).plasticityProfile;
  const snapshot = createSpawnerSnapshot(legacySpawner as typeof spawner);
  assert.deepEqual(snapshot.learnedState, createEmptyLearnedState());
  assert.deepEqual(snapshot.traceStore, createEmptyTraceStore());
  assert.deepEqual(snapshot.genome.plasticityProfile, sanitizePlasticityProfile(undefined));
}

function testEffectiveGenomeViewSupportsNoopAndTargetedDeltas() {
  const world = createSpawnerWorld(22, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = spawner.genome.connections[0];
  const unit = spawner.genome.units[0];
  assert(connection);
  assert(unit);

  const emptyView = createEffectiveGenomeView(spawner.genome, createEmptyLearnedState());
  assert.equal(emptyView.getConnectionWeight(connection), connection.weight);
  assert.equal(emptyView.getOutputBias(0), spawner.genome.outputBias[0] ?? 0);
  assert.equal(emptyView.getGateBias(unit, "update"), unit.updateBias);
  assert.equal(getEffectiveConnectionWeight(connection), connection.weight);
  assert.equal(getEffectiveOutputBias(spawner.genome, 0), spawner.genome.outputBias[0] ?? 0);
  assert.equal(getEffectiveGateBias(unit, "update"), unit.updateBias);

  const learnedState = createEmptyLearnedState();
  learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.75;
  learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -0.5;
  learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")] = 0.25;
  const learnedView = createEffectiveGenomeView(spawner.genome, learnedState);

  assert.equal(learnedView.getConnectionWeight(connection), connection.weight + 0.75);
  assert.equal(learnedView.getOutputBias(0), (spawner.genome.outputBias[0] ?? 0) - 0.5);
  assert.equal(learnedView.getGateBias(unit, "update"), unit.updateBias + 0.25);
  assert.equal(learnedView.getGateBias(unit, "reset"), unit.resetBias);
  assert.deepEqual(getEffectiveConnectionDetail(connection, learnedState, spawner.genome.plasticityProfile.maxLearnedDelta), {
    base: connection.weight,
    learnedDelta: 0.75,
    effective: connection.weight + 0.75,
  });
  assert.deepEqual(getEffectiveOutputBiasDetail(spawner.genome, 0, learnedState), {
    base: spawner.genome.outputBias[0] ?? 0,
    learnedDelta: -0.5,
    effective: (spawner.genome.outputBias[0] ?? 0) - 0.5,
  });
  assert.deepEqual(getEffectiveGateBiasDetail(spawner.genome, unit, "update", learnedState), {
    base: unit.updateBias,
    learnedDelta: 0.25,
    effective: unit.updateBias + 0.25,
  });

  spawner.genome.plasticityProfile.maxLearnedDelta = 0.1;
  const cappedState = createEmptyLearnedState();
  cappedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 9;
  cappedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -9;
  cappedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")] = 9;
  const cappedView = createEffectiveGenomeView(spawner.genome, cappedState);
  assert.equal(Number((cappedView.getConnectionWeight(connection) - connection.weight).toFixed(6)), 0.1);
  assert.equal(Number((cappedView.getOutputBias(0) - (spawner.genome.outputBias[0] ?? 0)).toFixed(6)), -0.1);
  assert.equal(Number((cappedView.getGateBias(unit, "update") - unit.updateBias).toFixed(6)), 0.1);
  assert.equal(getEffectiveConnectionDetail(connection, cappedState, spawner.genome.plasticityProfile.maxLearnedDelta).learnedDelta, 0.1);
  assert.equal(getEffectiveOutputBiasDetail(spawner.genome, 0, cappedState).learnedDelta, -0.1);
  assert.equal(getEffectiveGateBiasDetail(spawner.genome, unit, "update", cappedState).learnedDelta, 0.1);
  const cappedMaterialized = materializeEffectiveGenomeForInheritance(spawner.genome, cappedState);
  assert.equal(
    cappedMaterialized.connections.find((candidate) => candidate.innovationId === connection.innovationId)?.weight,
    cappedView.getConnectionWeight(connection),
  );
  assert.equal(cappedMaterialized.outputBias[0], cappedView.getOutputBias(0));
  assert.equal(cappedMaterialized.units.find((candidate) => candidate.unitId === unit.unitId)?.updateBias, cappedView.getGateBias(unit, "update"));
}

function testEffectiveGenomeMaterializesForInheritanceWithoutMutatingParent() {
  const world = createSpawnerWorld(22, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = spawner.genome.connections[0];
  const unit = spawner.genome.units[0];
  assert(connection);
  assert(unit);
  const parentBefore = structuredClone(spawner.genome);
  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.75;
  spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -0.5;
  spawner.learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")] = 0.25;

  const materialized = materializeEffectiveGenomeForInheritance(spawner.genome, spawner.learnedState);
  const materializedConnection = materialized.connections.find((candidate) => candidate.innovationId === connection.innovationId);
  const materializedUnit = materialized.units.find((candidate) => candidate.unitId === unit.unitId);

  assert(materializedConnection);
  assert(materializedUnit);
  assert.deepEqual(spawner.genome, parentBefore);
  assert.equal(materializedConnection.weight, connection.weight + 0.75);
  assert.equal(materialized.outputBias[0], (spawner.genome.outputBias[0] ?? 0) - 0.5);
  assert.equal(materializedUnit.updateBias, unit.updateBias + 0.25);
  assert.equal(materializedUnit.resetBias, unit.resetBias);
  assert.deepEqual(materialized.perception, spawner.genome.perception);
  assert.deepEqual(materialized.mutationProfile, spawner.genome.mutationProfile);
  assert.deepEqual(materialized.plasticityProfile, spawner.genome.plasticityProfile);

  const emptyMaterialized = materializeEffectiveGenomeForInheritance(spawner.genome, createEmptyLearnedState());
  assert.deepEqual(emptyMaterialized, normalizeSpawnerGenomeForCurrentContract(spawner.genome));
}

function testTraceStoreSanitizesAndClones() {
  const trace: SpawnerDecisionTrace = {
    id: 1,
    tick: 2,
    action: "long",
    strength: 0.5,
    activeConnectionIds: [1, 2],
    connectionActivations: { "1": { source: Number.NaN, target: 0.4 } },
  };
  const store = sanitizeTraceStore({ nextTraceId: 2, traces: { "1": trace } });
  assert(store.traces["1"]);
  assert.equal(store.traces["1"].connectionActivations["1"]?.source, 0);
  const cloned = cloneTraceStore(store);
  assert(cloned.traces["1"]);
  cloned.traces["1"].connectionActivations["1"]!.target = 99;
  assert.equal(store.traces["1"].connectionActivations["1"]?.target, 0.4);
}

function testLearningSignalAndDeltaUpdates() {
  const world = createSpawnerWorld(33, {
    initialSpawners: 1,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0.25,
    plasticityPositiveRewardMultiplier: 2,
    plasticityNegativeRewardMultiplier: 2,
    plasticityMaxLearnedDelta: 10,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome).find((item) => item.target.kind === "output");
  assert(connection);
  const trace: SpawnerDecisionTrace = {
    id: 1,
    tick: 1,
    action: "long",
    strength: 1,
    activeConnectionIds: [connection.innovationId],
    connectionActivations: { [String(connection.innovationId)]: { source: 1, target: 1 } },
  };
  spawner.traceStore.traces[String(trace.id)] = trace;

  assert.equal(learningSignalFromPayoff(100, spawner.genome.plasticityProfile), 1);
  assert.equal(learningSignalFromPayoff(-100, spawner.genome.plasticityProfile), -1);

  const before = createEffectiveGenomeView(spawner.genome, spawner.learnedState).getConnectionWeight(connection);
  assert.equal(applyLearningSignal(spawner, trace.id, 1), true);
  const after = createEffectiveGenomeView(spawner.genome, spawner.learnedState).getConnectionWeight(connection);

  assert(after > before);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
  assert.equal(spawner.learnedState.recentLearningSignal, 1);
  assert(learnedStateNorm(spawner.learnedState, spawner.genome.plasticityProfile.maxLearnedDelta) > 0);
}

function testZeroLearningAndReproductionFeedback() {
  const world = createSpawnerWorld(44, {
    initialSpawners: 1,
    plasticityWeightLearningRate: 0,
    plasticityBiasLearningRate: 0,
    plasticityReproductionRewardStrength: 0.75,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.traceStore.traces["1"] = {
    id: 1,
    tick: 1,
    action: "reproduce",
    strength: 0,
    activeConnectionIds: [],
    connectionActivations: {},
  };

  assert.equal(applyLearningSignal(spawner, 1, 1), false);
  assert.equal(learnedStateNorm(spawner.learnedState), 0);
  assert.equal(applyReproductionLearning(spawner, 1), false);
  assert.equal(spawner.learnedState.reproductionLearningCount, 0);

  spawner.genome.plasticityProfile.biasLearningRate = 0.4;
  assert.equal(applyReproductionLearning(spawner, 1), true);
  assert.equal(spawner.learnedState.reproductionLearningCount, 1);
  assert((spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(5)] ?? 0) > 0);
}

function testPlasticityProfileDriftsIndependentlyAndCanBeDisabled() {
  const profile = sanitizePlasticityProfile({
    weightLearningRate: 0.5,
    biasLearningRate: 0.45,
    positiveRewardMultiplier: 1,
    negativeRewardMultiplier: 1.5,
    reproductionRewardStrength: 0.4,
    experienceDecayRate: 0.3,
    maxLearnedDelta: 5,
    eligibilityTraceStrength: 0.6,
    plasticityMutationStdDev: 0.1,
  });
  const disabled = driftPlasticityProfile({ ...profile, plasticityMutationStdDev: 0 }, { gaussian: () => 999 });
  assert.deepEqual(disabled, { ...profile, plasticityMutationStdDev: 0 });

  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const drifted = driftPlasticityProfile(profile, {
    gaussian: (_mean, stddev) => (values.shift() ?? 0) * stddev,
  });

  assert.equal(Number(drifted.weightLearningRate.toFixed(6)), 0.6);
  assert.equal(Number(drifted.biasLearningRate.toFixed(6)), 0.65);
  assert.equal(Number(drifted.positiveRewardMultiplier.toFixed(6)), 1.3);
  assert.equal(Number(drifted.negativeRewardMultiplier.toFixed(6)), 1.9);
  assert.equal(Number(drifted.reproductionRewardStrength.toFixed(6)), 0.9);
  assert.equal(Number(drifted.experienceDecayRate.toFixed(6)), 0.9);
  assert.equal(Number(drifted.maxLearnedDelta.toFixed(6)), 5.7);
  assert.equal(Number(drifted.eligibilityTraceStrength.toFixed(6)), 1);
  assert.equal(Number(drifted.plasticityMutationStdDev.toFixed(6)), 1);
}

function testPlasticityProfileClampsLearningRatesAndReproductionReward() {
  const clamped = sanitizePlasticityProfile({
    weightLearningRate: 2,
    biasLearningRate: -1,
    reproductionRewardStrength: 3,
    experienceDecayRate: 2,
    eligibilityTraceStrength: -4,
    plasticityMutationStdDev: 2,
  });
  assert.equal(clamped.weightLearningRate, 1);
  assert.equal(clamped.biasLearningRate, 0);
  assert.equal(clamped.reproductionRewardStrength, 1);
  assert.equal(clamped.experienceDecayRate, 1);
  assert.equal(clamped.eligibilityTraceStrength, 0);
  assert.equal(clamped.plasticityMutationStdDev, 1);

  const world = createSpawnerWorld(56, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.genome.plasticityProfile = driftPlasticityProfile(
    {
      ...spawner.genome.plasticityProfile,
      weightLearningRate: 0.95,
      biasLearningRate: 0.05,
      reproductionRewardStrength: 0.95,
      plasticityMutationStdDev: 0.2,
    },
    { gaussian: () => 0.2 },
  );
  assert.equal(spawner.genome.plasticityProfile.weightLearningRate, 1);
  assert.equal(spawner.genome.plasticityProfile.biasLearningRate, 0.25);
  assert.equal(spawner.genome.plasticityProfile.reproductionRewardStrength, 1);
  assert.equal(validateGenome(spawner.genome, world.config).valid, true);
}

function testLearningSignalReportsOnlyActualDeltaChanges() {
  const world = createSpawnerWorld(57, {
    initialSpawners: 1,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0,
    plasticityMaxLearnedDelta: 0.5,
    plasticityEligibilityTraceStrength: 1,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const connection = activeConnections(spawner.genome).find((item) => item.target.kind === "hidden");
  assert(connection);
  const trace: SpawnerDecisionTrace = {
    id: 1,
    tick: 1,
    action: "reproduce",
    strength: 0,
    activeConnectionIds: [connection.innovationId],
    connectionActivations: { [String(connection.innovationId)]: { source: 1, target: 1 } },
  };
  spawner.traceStore.traces[String(trace.id)] = trace;
  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0.5;

  assert.equal(applyLearningSignal(spawner, trace.id, 1, { skipActionOutputBias: true }), false);
  assert.equal(spawner.learnedState.learningUpdateCount, 0);
  assert.equal(spawner.learnedState.recentLearningSignal, 1);
  assert.equal(applyLearningSignal(spawner, 999, 1), false);
  assert.equal(spawner.learnedState.learningUpdateCount, 0);

  spawner.learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 0;
  assert.equal(applyLearningSignal(spawner, trace.id, 1, { skipActionOutputBias: true }), true);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
}

function testReproductionLearningCreditsFullTraceWithoutActionBiasHelpers() {
  const world = createSpawnerWorld(58, {
    initialSpawners: 1,
    plasticityWeightLearningRate: 0.5,
    plasticityBiasLearningRate: 0.25,
    plasticityReproductionRewardStrength: 0.75,
    plasticityMaxLearnedDelta: 10,
    plasticityEligibilityTraceStrength: 1,
  });
  const spawner = world.spawners[0];
  assert(spawner);
  const hiddenConnection = activeConnections(spawner.genome).find((item) => item.target.kind === "hidden");
  assert(hiddenConnection?.target.kind === "hidden");
  spawner.traceStore.traces["1"] = {
    id: 1,
    tick: 1,
    action: "reproduce",
    strength: 1,
    activeConnectionIds: [hiddenConnection.innovationId],
    connectionActivations: { [String(hiddenConnection.innovationId)]: { source: 1, target: 1 } },
  };

  assert.equal(applyReproductionLearning(spawner, 1), true);
  assert((spawner.learnedState.connectionDeltas[connectionDeltaKey(hiddenConnection.innovationId)] ?? 0) > 0);
  assert((spawner.learnedState.gateBiasDeltas[gateBiasDeltaKey(hiddenConnection.target.unitId, hiddenConnection.target.gate)] ?? 0) > 0);
  assert((spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(5)] ?? 0) > 0);
  assert.equal(spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] ?? 0, 0);
  assert.equal(spawner.learnedState.outputBiasDeltas[outputBiasDeltaKey(2)] ?? 0, 0);
  assert.equal(spawner.learnedState.learningUpdateCount, 1);
  assert.equal(spawner.learnedState.reproductionLearningCount, 1);
}

function testTracePruningRemovesExpiredTraces() {
  const world = createSpawnerWorld(55, { initialSpawners: 1 });
  const spawner = world.spawners[0];
  assert(spawner);
  spawner.traceStore.traces["1"] = {
    id: 1,
    tick: 10,
    action: "reproduce",
    strength: 0,
    activeConnectionIds: [],
    connectionActivations: {},
  };
  spawner.traceStore.traces["2"] = { ...spawner.traceStore.traces["1"], id: 2, tick: 20 };
  pruneDecisionTraces(spawner, 25, 10);
  assert.equal(spawner.traceStore.traces["1"], undefined);
  assert.ok(spawner.traceStore.traces["2"]);
}

export const tests: SineTest[] = [
  { name: "Plasticity Models Create Without World", run: testPlasticityModelsCreateWithoutWorld },
  { name: "Plasticity Sanitize Clone Norm And Decay", run: testPlasticitySanitizeCloneNormAndDecay },
  { name: "Legacy Agent And Genome Normalize To Zero Learning", run: testLegacyAgentAndGenomeNormalizeToZeroLearning },
  { name: "Effective Genome View Supports Noop And Targeted Deltas", run: testEffectiveGenomeViewSupportsNoopAndTargetedDeltas },
  { name: "Effective Genome Materializes For Inheritance Without Mutating Parent", run: testEffectiveGenomeMaterializesForInheritanceWithoutMutatingParent },
  { name: "Trace Store Sanitizes And Clones", run: testTraceStoreSanitizesAndClones },
  { name: "Learning Signal And Delta Updates", run: testLearningSignalAndDeltaUpdates },
  { name: "Zero Learning And Reproduction Feedback", run: testZeroLearningAndReproductionFeedback },
  { name: "Plasticity Profile Drifts Independently And Can Be Disabled", run: testPlasticityProfileDriftsIndependentlyAndCanBeDisabled },
  { name: "Plasticity Profile Clamps Learning Rates And Reproduction Reward", run: testPlasticityProfileClampsLearningRatesAndReproductionReward },
  { name: "Learning Signal Reports Only Actual Delta Changes", run: testLearningSignalReportsOnlyActualDeltaChanges },
  { name: "Reproduction Learning Credits Full Trace Without Action Bias Helpers", run: testReproductionLearningCreditsFullTraceWithoutActionBiasHelpers },
  { name: "Trace Pruning Removes Expired Traces", run: testTracePruningRemovesExpiredTraces },
];
