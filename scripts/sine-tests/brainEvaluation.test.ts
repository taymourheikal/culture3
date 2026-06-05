import { strict as assert } from "node:assert";
import { advanceMarketTimeline, createMarketTimeline } from "../../src/sine/marketTimeline";
import { INITIAL_SETTINGS } from "../../src/sine/marketSignal";
import {
  advanceSpawnerWorldToTimeline,
  advanceSpawnerWorldToTimelineAsync,
  createSpawnerWorld,
  createSyncBrainEvaluationRunner,
  DEFAULT_SPAWNER_CONFIG,
  evaluateSpawnerBrainPure,
  INPUT_COUNT,
  materializeBrainEvaluationActivations,
  type SpawnerConfig,
  type SpawnerWorld,
} from "../../src/sine/spawnerSimulation";
import { worldDigest } from "../../src/sine/testing/worldDigest";
import { createCompactSyncBrainEvaluationRunner, evaluateBrainJob, type BrainPlanCache } from "../../src/sine/spawner/brainEvaluationRunner";
import { brainGenomeCacheSignature, brainPlanSignature, compileBrainPlan } from "../../src/sine/spawner/brainPlan";
import {
  compactJobFromBrainEvaluationJob,
  evaluateCompactBrainJob,
  materializeCompactBrainEvaluationResult,
  materializeCompactLearnedState,
} from "../../src/sine/spawner/compactBrainEvaluation";
import { createMarketInputResolver } from "../../src/sine/spawner/marketInputs";
import { connectionDeltaKey, gateBiasDeltaKey, outputBiasDeltaKey, sanitizeLearnedState } from "../../src/sine/spawner/plasticity";
import {
  applyEvaluationResult,
  buildBrainEvaluationJobs,
  buildSpawnerEvaluationFrame,
  evaluateSpawnerFrameSync,
  frameEvaluationSource,
  materializeEvaluationResult,
  orderedEvaluationResults,
  outputsFromEvaluationResult,
  runtimeEvaluationFromResult,
} from "../../src/sine/spawner/worldBrainEvaluation";
import { createBrainEvalPool, type BrowserWorker } from "../../src/sine/worker/brainEvalPool";
import { BoundedCache } from "../../src/sine/worker/boundedCache";
import type { BrainEvalWorkerRequest, BrainEvalWorkerResponse, BrainEvaluationJob, BrainEvaluationResult, BrainEvaluationRunner } from "../../src/sine/protocol/brainEvalProtocol";
import { round, type SineTest } from "./helpers";

const PARITY_CONFIG: Partial<SpawnerConfig> = {
  ...DEFAULT_SPAWNER_CONFIG,
  initialSpawners: 100,
  maxSpawners: 130,
  reproductionEnergy: 20,
  reproductionCost: 6,
  initialReproductionOutputBias: -1.2,
  plasticityWeightLearningRate: 0.018,
  plasticityBiasLearningRate: 0.009,
  plasticityReproductionRewardStrength: 0.45,
  plasticityExperienceDecayRate: 0.001,
};

function testPureEvaluationDoesNotMutateSpawnerState() {
  const world = createSpawnerWorld(101, PARITY_CONFIG);
  const spawner = world.spawners[0];
  assert.ok(spawner);
  spawner.hiddenState = {};
  const before = JSON.stringify(spawner.hiddenState);
  const evaluation = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs: Array.from({ length: 16 }, () => 0),
  });
  assert.equal(JSON.stringify(spawner.hiddenState), before);
  assert.equal(evaluation.outputs.length, 6);
  assert.ok(Object.keys(evaluation.previousState).length >= spawner.genome.units.length);
}

function testPureEvaluationCanSkipTraceOnlyPayloads() {
  const world = createSpawnerWorld(101, PARITY_CONFIG);
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const inputs = Array.from({ length: 16 }, (_, index) => index / 100);
  const full = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
  });
  const compact = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    includeActivations: false,
    includePreviousState: false,
  });

  assert.deepEqual(compact.outputs.map(round), full.outputs.map(round));
  assert.deepEqual(Object.entries(compact.currentState).map(([unitId, value]) => [unitId, round(value)]), Object.entries(full.currentState).map(([unitId, value]) => [unitId, round(value)]));
  assert.deepEqual(compact.previousState, {});
  assert.deepEqual(compact.activeConnectionIds, []);
  assert.deepEqual(compact.connectionActivations, {});
}

function testPureEvaluationMatchesCompiledPlanGolden() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index / 3) * 0.4);
  const plan = compileBrainPlan(spawner.genome);
  const implicitPlan = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
  });
  const explicitPlan = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    plan,
  });

  assert.deepEqual(explicitPlan.outputs.map(round), implicitPlan.outputs.map(round));
  assert.deepEqual(roundRecord(explicitPlan.previousState), roundRecord(implicitPlan.previousState));
  assert.deepEqual(roundRecord(explicitPlan.currentState), roundRecord(implicitPlan.currentState));
  assert.deepEqual(explicitPlan.activeConnectionIds, implicitPlan.activeConnectionIds);
  assert.deepEqual(roundActivationMap(explicitPlan.connectionActivations), roundActivationMap(implicitPlan.connectionActivations));
  assert.ok(explicitPlan.activeConnectionIds.length > 0);
  assert.ok(Object.keys(explicitPlan.connectionActivations).length > 0);
}

function testCompactEvaluationPreservesTraceFallbackSourceState() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  for (const unit of spawner.genome.units) spawner.hiddenState[unit.unitId] = Math.sin(unit.unitId) * 0.25;
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.cos(index / 2) * 0.5);
  const plan = compileBrainPlan(spawner.genome);
  const job = {
    ...brainJobForSpawner(spawner, inputs, 0),
    includeActivations: false,
    includePreviousState: false,
  };
  const originalHiddenState = job.hiddenState;
  const compact = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: job.hiddenState,
    inputs,
    plan,
    includeActivations: false,
    includePreviousState: false,
  });
  const full = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: job.hiddenState,
    inputs,
    plan,
    includeActivations: true,
    includePreviousState: true,
  });

  applyEvaluationResult(spawner, { evaluation: compact }, job);
  const traceFallback = evaluateSpawnerBrainPure({
    genome: job.genome!,
    learnedState: job.learnedState,
    hiddenState: job.hiddenState,
    inputs: job.inputs,
    plan,
    includeActivations: true,
    includePreviousState: false,
  });

  assert.notEqual(spawner.hiddenState, originalHiddenState);
  assert.equal(job.hiddenState, originalHiddenState);
  assert.deepEqual(compact.outputs.map(round), full.outputs.map(round));
  assert.deepEqual(roundRecord(spawner.hiddenState), roundRecord({ ...full.previousState, ...full.currentState }));
  assert.deepEqual(traceFallback.outputs.map(round), full.outputs.map(round));
  assert.deepEqual(roundRecord(traceFallback.currentState), roundRecord(full.currentState));
  assert.deepEqual(traceFallback.activeConnectionIds, full.activeConnectionIds);
  assert.deepEqual(roundActivationMap(traceFallback.connectionActivations), roundActivationMap(full.connectionActivations));
}

function testRuntimeActivationMaterializerMatchesFullEvaluation() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  for (const unit of spawner.genome.units) spawner.hiddenState[unit.unitId] = Math.sin(unit.unitId / 3) * 0.35;
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index + 0.375) * 0.4);
  const plan = compileBrainPlan(spawner.genome);
  const compact = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    plan,
    includeActivations: false,
    includePreviousState: false,
  });
  const materialized = materializeBrainEvaluationActivations(compact);
  const full = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    plan,
    includeActivations: true,
    includePreviousState: false,
  });

  assert.ok(materialized);
  assert.deepEqual(materialized.outputs.map(round), full.outputs.map(round));
  assert.deepEqual(roundRecord(materialized.currentState), roundRecord(full.currentState));
  assert.deepEqual(materialized.activeConnectionIds, full.activeConnectionIds);
  assert.deepEqual(roundActivationMap(materialized.connectionActivations), roundActivationMap(full.connectionActivations));
}

function testRuntimeEvaluationResultsDoNotAliasSubsequentEvaluations() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 2, maxSpawners: 2 });
  const first = world.spawners[0];
  const second = world.spawners[1];
  assert.ok(first);
  assert.ok(second);
  const firstInputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index / 5));
  const secondInputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.cos(index / 7));
  const firstEvaluation = evaluateSpawnerBrainPure({
    genome: first.genome,
    learnedState: first.learnedState,
    hiddenState: first.hiddenState,
    inputs: firstInputs,
    includeActivations: false,
    includePreviousState: false,
  });
  const firstOutputs = firstEvaluation.outputs.map(round);
  const firstCurrentState = roundRecord(firstEvaluation.currentState);
  evaluateSpawnerBrainPure({
    genome: second.genome,
    learnedState: second.learnedState,
    hiddenState: second.hiddenState,
    inputs: secondInputs,
    includeActivations: false,
    includePreviousState: false,
  });
  const materialized = materializeBrainEvaluationActivations(firstEvaluation);

  assert.deepEqual(firstEvaluation.outputs.map(round), firstOutputs);
  assert.deepEqual(roundRecord(firstEvaluation.currentState), firstCurrentState);
  assert.ok(materialized);
  assert.deepEqual(materialized.outputs.map(round), firstOutputs);
  assert.deepEqual(roundRecord(materialized.currentState), firstCurrentState);
}

function testEvaluationFrameOwnsOrderedInputsJobsAndResults() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 4, maxSpawners: 4 });
  advanceMarketTimeline(timeline, 3, 10);
  world.tick = timeline.tick;
  const resolver = createMarketInputResolver(timeline, world.tick, 7);
  const frame = buildSpawnerEvaluationFrame(world, resolver, undefined, {
    sessionId: 11,
    runGeneration: 12,
    advanceEpoch: 13,
    batchId: 14,
  });

  assert.deepEqual(frame.spawners, world.spawners);
  assert.deepEqual(frame.spawnerIds, world.spawners.map((spawner) => spawner.id));
  assert.deepEqual(frame.indexes, [0, 1, 2, 3]);
  assert.equal(frame.inputs.length, world.spawners.length);
  assert.equal(frame.hiddenStates[0], world.spawners[0]?.hiddenState);
  assert.equal(frame.learnedStates[0], world.spawners[0]?.learnedState);

  const jobs = buildBrainEvaluationJobs(frame, {
    sessionId: 11,
    runGeneration: 12,
    advanceEpoch: 13,
    batchId: 14,
  });
  assert.deepEqual(jobs.map((job) => job.spawnerId), frame.spawnerIds);
  assert.deepEqual(jobs.map((job) => job.index), frame.indexes);
  assert.equal(jobs[0]?.inputs, frame.inputs[0]);
  assert.equal(jobs[0]?.hiddenState, frame.hiddenStates[0]);

  const syncResults = evaluateSpawnerFrameSync(frame);
  const orderedSync = orderedEvaluationResults(frame, syncResults.slice().reverse());
  assert.deepEqual(orderedSync.map((result) => result.index), frame.indexes);
  assert.deepEqual(orderedSync.map((result) => result.spawnerId), frame.spawnerIds);
  assert.ok(runtimeEvaluationFromResult(orderedSync[0]!));
  assert.equal("evaluation" in orderedSync[0]!, false);

  const jobResults = jobs.map((job) => evaluateBrainJob(job)).reverse();
  const orderedJobResults = orderedEvaluationResults(frame, jobResults, jobs);
  assert.deepEqual(orderedJobResults.map((result) => result.index), frame.indexes);
  assert.deepEqual(orderedSync.map((result) => outputsFromEvaluationResult(result).map(round)), orderedJobResults.map((result) => result.evaluation?.outputs.map(round)));
  const firstSource = frameEvaluationSource(frame, 0);
  assert.ok(firstSource.genome);
  const materializedRuntime = materializeEvaluationResult(orderedSync[0]!, firstSource, {
    includeActivations: true,
    includePreviousState: true,
  });
  const materializedPublic = evaluateSpawnerBrainPure({
    genome: firstSource.genome,
    learnedState: firstSource.learnedState,
    learnedStateView: firstSource.learnedStateView,
    hiddenState: firstSource.hiddenState,
    inputs: firstSource.inputs,
    plan: frame.plans[0],
    includeActivations: true,
    includePreviousState: true,
  });
  assert.ok(materializedRuntime);
  assert.deepEqual(materializedRuntime.outputs.map(round), materializedPublic.outputs.map(round));
  assert.deepEqual(roundRecord(materializedRuntime.previousState), roundRecord(materializedPublic.previousState));
  assert.deepEqual(roundRecord(materializedRuntime.currentState), roundRecord(materializedPublic.currentState));
  assert.deepEqual(materializedRuntime.activeConnectionIds, materializedPublic.activeConnectionIds);
  assert.deepEqual(roundActivationMap(materializedRuntime.connectionActivations), roundActivationMap(materializedPublic.connectionActivations));

  assert.equal(firstSource.genome, world.spawners[0]?.genome);
  assert.equal(firstSource.inputs, frame.inputs[0]);
  assert.equal(firstSource.hiddenState, frame.hiddenStates[0]);
}

function testCompactJobSerializationAndResponseMaterializationMatchObjectEvaluation() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const plan = compileBrainPlan(spawner.genome);
  for (const unit of spawner.genome.units) spawner.hiddenState[unit.unitId] = Math.sin(unit.unitId / 4) * 0.4;
  const connection = spawner.genome.connections.find((candidate) => candidate.enabled);
  const unit = spawner.genome.units.find((candidate) => candidate.enabled);
  assert.ok(connection);
  assert.ok(unit);
  spawner.genome.plasticityProfile.maxLearnedDelta = 0.2;
  const learnedState = structuredClone(spawner.learnedState);
  learnedState.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 5;
  learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = -5;
  learnedState.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "candidate")] = 5;
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index + 0.25) * 0.5);
  const objectJob = {
    ...brainJobForSpawner(spawner, inputs, 0),
    learnedState,
    includeActivations: false,
    includePreviousState: false,
  };
  const compactJob = structuredClone(compactJobFromBrainEvaluationJob(objectJob, { plan }));
  const compactResult = structuredClone(evaluateCompactBrainJob(compactJob));
  const materialized = materializeCompactBrainEvaluationResult(compactResult, objectJob, plan);
  const objectResult = evaluateBrainJob(objectJob);
  const sanitized = sanitizeLearnedState(learnedState, spawner.genome.plasticityProfile.maxLearnedDelta);
  const rematerializedLearned = materializeCompactLearnedState(compactJob.learnedState, plan);

  assert.equal(compactJob.genomeKey.includes(String(spawner.id)), true);
  assert.equal(compactJob.hiddenState.length, plan.unitIds.length);
  assert.deepEqual(compactJob.inputs.map(round), inputs.map(round));
  assert.equal(compactJob.genomePayload?.planSignature, plan.signature);
  assert.deepEqual(compactJob.genomePayload?.structuralPlan.unitIds, plan.unitIds);
  assert.deepEqual(roundRecord(rematerializedLearned.connectionDeltas), roundRecord(sanitized.connectionDeltas));
  assert.deepEqual(roundRecord(rematerializedLearned.outputBiasDeltas), roundRecord(sanitized.outputBiasDeltas));
  assert.deepEqual(roundRecord(rematerializedLearned.gateBiasDeltas), roundRecord(sanitized.gateBiasDeltas));
  assert.deepEqual(materialized.evaluation?.outputs.map(round), objectResult.evaluation?.outputs.map(round));
  assert.deepEqual(roundRecord(materialized.evaluation?.currentState ?? {}), roundRecord(objectResult.evaluation?.currentState ?? {}));
}

function testCompactJobDirectArrayKernelClampsAndMatchesObjectEvaluation() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const plan = compileBrainPlan(spawner.genome);
  spawner.genome.plasticityProfile.maxLearnedDelta = 0.2;
  for (const unit of spawner.genome.units) spawner.hiddenState[unit.unitId] = Math.sin(unit.unitId / 6) * 0.35;
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.cos(index + 0.5) * 0.45);
  const compactJob = structuredClone(compactJobFromBrainEvaluationJob({
    ...brainJobForSpawner(spawner, inputs, 0),
    includeActivations: true,
    includePreviousState: true,
  }, { plan }));
  compactJob.learnedState.connectionDeltasByPlanIndex = compactJob.learnedState.connectionDeltasByPlanIndex.map((_, index) => index % 2 === 0 ? 10 : -10);
  compactJob.learnedState.outputBiasDeltas = compactJob.learnedState.outputBiasDeltas.map((_, index) => index % 2 === 0 ? -10 : 10);
  compactJob.learnedState.updateGateBiasDeltasByUnitIndex = compactJob.learnedState.updateGateBiasDeltasByUnitIndex.map(() => 10);
  compactJob.learnedState.resetGateBiasDeltasByUnitIndex = compactJob.learnedState.resetGateBiasDeltasByUnitIndex.map(() => -10);
  compactJob.learnedState.candidateGateBiasDeltasByUnitIndex = compactJob.learnedState.candidateGateBiasDeltasByUnitIndex.map(() => 10);
  const objectJob = {
    ...brainJobForSpawner(spawner, inputs, 0),
    learnedState: materializeCompactLearnedState(compactJob.learnedState, plan),
    includeActivations: true,
    includePreviousState: true,
  };
  const compactResult = structuredClone(evaluateCompactBrainJob(compactJob));
  const materialized = materializeCompactBrainEvaluationResult(compactResult, objectJob, plan);
  const objectResult = evaluateBrainJob(objectJob);

  assert.deepEqual(materialized.evaluation?.outputs.map(round), objectResult.evaluation?.outputs.map(round));
  assert.deepEqual(roundRecord(materialized.evaluation?.previousState ?? {}), roundRecord(objectResult.evaluation?.previousState ?? {}));
  assert.deepEqual(roundRecord(materialized.evaluation?.currentState ?? {}), roundRecord(objectResult.evaluation?.currentState ?? {}));
  assert.deepEqual(materialized.evaluation?.activeConnectionIds, objectResult.evaluation?.activeConnectionIds);
  assert.deepEqual(roundActivationMap(materialized.evaluation?.connectionActivations ?? {}), roundActivationMap(objectResult.evaluation?.connectionActivations ?? {}));
}

function testCompactResponseMaterializationPreservesTraceActivationMaterializer() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  for (const unit of spawner.genome.units) spawner.hiddenState[unit.unitId] = Math.cos(unit.unitId / 5) * 0.3;
  const plan = compileBrainPlan(spawner.genome);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.cos(index + 0.125) * 0.45);
  const objectJob = {
    ...brainJobForSpawner(spawner, inputs, 0),
    includeActivations: false,
    includePreviousState: false,
  };
  const compactJob = structuredClone(compactJobFromBrainEvaluationJob(objectJob, { plan }));
  const compactResult = structuredClone(evaluateCompactBrainJob(compactJob));
  const materialized = materializeCompactBrainEvaluationResult(compactResult, objectJob, plan);
  const activated = materialized.evaluation ? materializeBrainEvaluationActivations(materialized.evaluation) : undefined;
  const full = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
    plan,
    includeActivations: true,
    includePreviousState: false,
  });

  assert.ok(activated);
  assert.deepEqual(activated.outputs.map(round), full.outputs.map(round));
  assert.deepEqual(roundRecord(activated.currentState), roundRecord(full.currentState));
  assert.deepEqual(activated.activeConnectionIds, full.activeConnectionIds);
  assert.deepEqual(roundActivationMap(activated.connectionActivations), roundActivationMap(full.connectionActivations));
}

function testLearnedDeltaFixtureCoversClampingAndPrecisionSensitiveValues() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const connection = spawner.genome.connections.find((candidate) => candidate.enabled);
  const unit = spawner.genome.units.find((candidate) => candidate.enabled);
  assert.ok(connection);
  assert.ok(unit);
  spawner.genome.plasticityProfile.maxLearnedDelta = 0.125;
  const learned = structuredClone(spawner.learnedState);
  learned.connectionDeltas[connectionDeltaKey(connection.innovationId)] = 10 + Number.EPSILON;
  learned.outputBiasDeltas[outputBiasDeltaKey(0)] = -10 - Number.EPSILON;
  learned.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")] = 10 + Number.EPSILON;
  const sanitized = sanitizeLearnedState(learned, spawner.genome.plasticityProfile.maxLearnedDelta);
  const inputs = Array.from({ length: INPUT_COUNT }, (_, index) => Math.sin(index + 0.125) * 0.75);
  const base = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
  });
  const rawLearned = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: learned,
    hiddenState: spawner.hiddenState,
    inputs,
  });
  const sanitizedLearned = evaluateSpawnerBrainPure({
    genome: spawner.genome,
    learnedState: sanitized,
    hiddenState: spawner.hiddenState,
    inputs,
  });

  assert.equal(sanitized.connectionDeltas[connectionDeltaKey(connection.innovationId)], 0.125);
  assert.equal(sanitized.outputBiasDeltas[outputBiasDeltaKey(0)], -0.125);
  assert.equal(sanitized.gateBiasDeltas[gateBiasDeltaKey(unit.unitId, "update")], 0.125);
  assert.notDeepEqual(rawLearned.outputs.map(round), base.outputs.map(round));
  assert.deepEqual(rawLearned.outputs.map(round), sanitizedLearned.outputs.map(round));
  assert.deepEqual(roundRecord(rawLearned.currentState), roundRecord(sanitizedLearned.currentState));
}

async function testAsyncOutOfOrderRunnerMatchesSyncParity() {
  const sync = runSyncParity();
  const asyncDigest = await runAsyncParity({
    evaluateBatch(jobs) {
      const results = createSyncBrainEvaluationRunner().evaluateBatch(jobs) as BrainEvaluationResult[];
      return Promise.resolve([...results].reverse());
    },
  });
  assert.deepEqual(asyncDigest, sync);
}

async function testCompactRunnerMatchesSyncParityWithOutOfOrderResults() {
  const sync = runSyncParity();
  const compactRunner = createCompactSyncBrainEvaluationRunner();
  const asyncDigest = await runAsyncParity({
    evaluateBatch(jobs) {
      const results = compactRunner.evaluateBatch(jobs) as BrainEvaluationResult[];
      return Promise.resolve([...results].reverse());
    },
  });
  assert.deepEqual(asyncDigest, sync);
}

async function testAsyncStaleResultFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = createSyncBrainEvaluationRunner().evaluateBatch(jobs) as BrainEvaluationResult[];
      const first = results[0];
      if (first) first.batchId += 1;
      return Promise.resolve(results);
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1 }),
    /identity mismatch/,
  );
  assert.equal(world.foods.length, 0);
  assert.equal(world.spawners.every((spawner) => spawner.spawnedCount === 0), true);
}

async function testCompactAsyncStaleResultFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const compactRunner = createCompactSyncBrainEvaluationRunner();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = compactRunner.evaluateBatch(jobs) as BrainEvaluationResult[];
      const first = results[0];
      if (first) first.batchId += 1;
      return Promise.resolve(results);
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1 }),
    /identity mismatch/,
  );
  assert.equal(world.foods.length, 0);
  assert.equal(world.spawners.every((spawner) => spawner.spawnedCount === 0), true);
}

async function testAsyncMissingResultFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = createSyncBrainEvaluationRunner().evaluateBatch(jobs) as BrainEvaluationResult[];
      return Promise.resolve(results.slice(1));
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1 }),
    /result count mismatch/,
  );
  assert.equal(world.foods.length, 0);
}

async function testCompactAsyncMissingResultFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const compactRunner = createCompactSyncBrainEvaluationRunner();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = compactRunner.evaluateBatch(jobs) as BrainEvaluationResult[];
      return Promise.resolve(results.slice(1));
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1 }),
    /result count mismatch/,
  );
  assert.equal(world.foods.length, 0);
}

async function testAsyncFailedResultFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = createSyncBrainEvaluationRunner().evaluateBatch(jobs) as BrainEvaluationResult[];
      const first = results[0];
      if (first) {
        delete first.evaluation;
        first.error = "forced shard failure";
      }
      return Promise.resolve(results);
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1 }),
    /forced shard failure/,
  );
  assert.equal(world.foods.length, 0);
}

async function testCompactAsyncFailedResultFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const compactRunner = createCompactSyncBrainEvaluationRunner();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = compactRunner.evaluateBatch(jobs) as BrainEvaluationResult[];
      const first = results[0];
      if (first) {
        delete first.evaluation;
        first.error = "forced compact shard failure";
      }
      return Promise.resolve(results);
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1 }),
    /forced compact shard failure/,
  );
  assert.equal(world.foods.length, 0);
}

function testBrainPlanCacheUsesCurrentForwardValuesAndInvalidatesTopology() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const inputs = Array.from({ length: 16 }, (_, index) => (index + 1) / 100);
  const baseJob = brainJobForSpawner(spawner, inputs, 0);
  const planCache: BrainPlanCache = new Map();
  const base = evaluateBrainJob(baseJob, planCache);
  assert.equal(planCache.size, 1);
  const baseOutputs = base.evaluation?.outputs.map(round);

  const weightChangedGenome = structuredClone(spawner.genome);
  for (const connection of weightChangedGenome.connections) connection.weight += 0.25;
  const weightChangedJob = { ...baseJob, genome: weightChangedGenome, index: 1, spawnerId: 101 };
  const cachedWeightChanged = evaluateBrainJob(weightChangedJob, planCache);
  const freshWeightChanged = evaluateBrainJob(weightChangedJob);
  assert.deepEqual(cachedWeightChanged.evaluation?.outputs.map(round), freshWeightChanged.evaluation?.outputs.map(round));
  assert.notDeepEqual(cachedWeightChanged.evaluation?.outputs.map(round), baseOutputs);
  assert.equal(planCache.size, 1);

  const outputBiasChangedGenome = structuredClone(spawner.genome);
  outputBiasChangedGenome.outputBias[0] = (outputBiasChangedGenome.outputBias[0] ?? 0) + 0.75;
  const outputBiasChangedJob = { ...baseJob, genome: outputBiasChangedGenome, index: 2, spawnerId: 102 };
  const cachedOutputBiasChanged = evaluateBrainJob(outputBiasChangedJob, planCache);
  const freshOutputBiasChanged = evaluateBrainJob(outputBiasChangedJob);
  assert.deepEqual(cachedOutputBiasChanged.evaluation?.outputs.map(round), freshOutputBiasChanged.evaluation?.outputs.map(round));
  assert.notDeepEqual(cachedOutputBiasChanged.evaluation?.outputs.map(round), baseOutputs);
  assert.equal(planCache.size, 1);

  const gateBiasChangedGenome = structuredClone(spawner.genome);
  for (const unit of gateBiasChangedGenome.units) {
    unit.updateBias += 3;
    unit.resetBias -= 2;
    unit.candidateBias += 1.5;
  }
  const gateBiasChangedJob = { ...baseJob, genome: gateBiasChangedGenome, index: 3, spawnerId: 103 };
  const cachedGateBiasChanged = evaluateBrainJob(gateBiasChangedJob, planCache);
  const freshGateBiasChanged = evaluateBrainJob(gateBiasChangedJob);
  assert.deepEqual(cachedGateBiasChanged.evaluation?.outputs.map(round), freshGateBiasChanged.evaluation?.outputs.map(round));
  assert.notDeepEqual(cachedGateBiasChanged.evaluation?.outputs.map(round), baseOutputs);
  assert.equal(planCache.size, 1);

  const topologyChangedGenome = structuredClone(spawner.genome);
  const firstConnection = topologyChangedGenome.connections[0];
  assert.ok(firstConnection);
  firstConnection.enabled = !firstConnection.enabled;
  evaluateBrainJob({ ...baseJob, genome: topologyChangedGenome, index: 4, spawnerId: 104 }, planCache);
  assert.equal(planCache.size, 2);
}

function testBrainGenomeCacheSignatureIncludesForwardValuesOnly() {
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const basePlanSignature = brainPlanSignature(spawner.genome);
  const baseGenomeSignature = brainGenomeCacheSignature(spawner.genome);

  const weightChanged = structuredClone(spawner.genome);
  const firstConnection = weightChanged.connections[0];
  assert.ok(firstConnection);
  firstConnection.weight += 0.125;
  assert.equal(brainPlanSignature(weightChanged), basePlanSignature);
  assert.notEqual(brainGenomeCacheSignature(weightChanged), baseGenomeSignature);

  const outputBiasChanged = structuredClone(spawner.genome);
  outputBiasChanged.outputBias[0] = (outputBiasChanged.outputBias[0] ?? 0) + 0.25;
  assert.equal(brainPlanSignature(outputBiasChanged), basePlanSignature);
  assert.notEqual(brainGenomeCacheSignature(outputBiasChanged), baseGenomeSignature);

  const gateBiasChanged = structuredClone(spawner.genome);
  const firstUnit = gateBiasChanged.units[0];
  assert.ok(firstUnit);
  firstUnit.updateBias += 0.25;
  assert.equal(brainPlanSignature(gateBiasChanged), basePlanSignature);
  assert.notEqual(brainGenomeCacheSignature(gateBiasChanged), baseGenomeSignature);
}

async function testBrainEvalPoolDisablesAfterWorkerFailures() {
  let posts = 0;
  const worker: BrowserWorker = {
    addEventListener() {},
    postMessage() {
      posts += 1;
    },
    terminate() {},
  };
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const job = brainJobForSpawner(spawner, Array.from({ length: 16 }, () => 0), 0);
  const pool = createBrainEvalPool({
    workerCount: 1,
    timeoutMs: 5,
    disableAfterFailures: 1,
    disableCooldownMs: 1_000,
    now: () => 0,
    workerFactory: () => worker,
  });

  const first = await pool.evaluateBatch([job]);
  assert.equal(first.length, 1);
  assert.equal(posts, 1);
  assert.equal(pool.currentMode?.(), "sync");

  const second = await pool.evaluateBatch([job]);
  assert.equal(second.length, 1);
  assert.equal(posts, 1);

  pool.reset?.();
  assert.equal(pool.currentMode?.(), "parallel");
  pool.dispose?.();
}

async function testBrainEvalPoolResendsEvictedGenomeKeys() {
  const requests: BrainEvalWorkerRequest[] = [];
  const listeners: Array<(event: { data: BrainEvalWorkerResponse }) => void> = [];
  const genomeCache = new Map<string, NonNullable<BrainEvaluationJob["genome"]>>();
  const worker: BrowserWorker = {
    addEventListener(type: string, listener: unknown) {
      if (type === "message") listeners.push(listener as (event: { data: BrainEvalWorkerResponse }) => void);
    },
    postMessage(message) {
      requests.push(message);
      const results = (message.jobs ?? []).map((job) => {
        if (job.genomeKey && job.genome) genomeCache.set(job.genomeKey, job.genome);
        const genome = job.genome ?? (job.genomeKey ? genomeCache.get(job.genomeKey) : undefined);
        return evaluateBrainJob(genome ? { ...job, genome } : job);
      });
      queueMicrotask(() => {
        for (const listener of listeners) listener({ data: { type: "brainShardResult", requestId: message.requestId, results } });
      });
    },
    terminate() {},
  };
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 2, maxSpawners: 2 });
  const first = world.spawners[0];
  const second = world.spawners[1];
  assert.ok(first);
  assert.ok(second);
  const firstJob = brainJobForSpawner(first, Array.from({ length: 16 }, () => 0), 0);
  const secondJob = brainJobForSpawner(second, Array.from({ length: 16 }, () => 0), 1);
  const learnedOnlyJob = {
    ...firstJob,
    learnedState: structuredClone(firstJob.learnedState),
  };
  learnedOnlyJob.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = 0.5;
  const pool = createBrainEvalPool({ workerCount: 1, timeoutMs: 100, cacheLimit: 1, workerFactory: () => worker });

  await pool.evaluateBatch([firstJob]);
  const learnedOnlyResult = await pool.evaluateBatch([learnedOnlyJob]);
  const learnedOnlySync = evaluateBrainJob(learnedOnlyJob);
  await pool.evaluateBatch([secondJob]);
  await pool.evaluateBatch([firstJob]);

  assert.equal(requests.length, 4);
  assert.ok(requests[0]?.jobs?.[0]?.genome);
  assert.equal(requests[1]?.jobs?.[0]?.genome, undefined);
  assert.deepEqual(learnedOnlyResult[0]?.evaluation?.outputs.map(round), learnedOnlySync.evaluation?.outputs.map(round));
  assert.ok(requests[2]?.jobs?.[0]?.genome);
  assert.ok(requests[3]?.jobs?.[0]?.genome);
  pool.dispose?.();
}

async function testBrainEvalPoolResendsGenomeAfterFailedShard() {
  const requests: BrainEvalWorkerRequest[] = [];
  const listeners: Array<(event: { data: BrainEvalWorkerResponse }) => void> = [];
  const worker: BrowserWorker = {
    addEventListener(type: string, listener: unknown) {
      if (type === "message") listeners.push(listener as (event: { data: BrainEvalWorkerResponse }) => void);
    },
    postMessage(message) {
      requests.push(message);
      if (requests.length === 1) return;
      const results = (message.jobs ?? []).map((job) => evaluateBrainJob(job));
      queueMicrotask(() => {
        for (const listener of listeners) listener({ data: { type: "brainShardResult", requestId: message.requestId, results } });
      });
    },
    terminate() {},
  };
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const job = brainJobForSpawner(spawner, Array.from({ length: 16 }, () => 0), 0);
  const pool = createBrainEvalPool({
    workerCount: 1,
    timeoutMs: 5,
    disableAfterFailures: 2,
    cacheLimit: 10,
    workerFactory: () => worker,
  });

  await pool.evaluateBatch([job]);
  await pool.evaluateBatch([job]);

  assert.equal(requests.length, 2);
  assert.ok(requests[0]?.jobs?.[0]?.genome);
  assert.ok(requests[1]?.jobs?.[0]?.genome);
  pool.dispose?.();
}

async function testCompactBrainEvalPoolResendsEvictedGenomePayloads() {
  const requests: BrainEvalWorkerRequest[] = [];
  const listeners: Array<(event: { data: BrainEvalWorkerResponse }) => void> = [];
  const genomeCache = new Map<string, NonNullable<BrainEvaluationJob["genome"]>>();
  const worker: BrowserWorker = {
    addEventListener(type: string, listener: unknown) {
      if (type === "message") listeners.push(listener as (event: { data: BrainEvalWorkerResponse }) => void);
    },
    postMessage(message) {
      requests.push(message);
      const compactResults = (message.compactJobs ?? []).map((job) => {
        if (job.genomeKey && job.genome) genomeCache.set(job.genomeKey, job.genome);
        const genome = job.genome ?? genomeCache.get(job.genomeKey);
        return evaluateCompactBrainJob({ ...job, genome });
      });
      queueMicrotask(() => {
        for (const listener of listeners) listener({ data: { type: "brainShardResult", requestId: message.requestId, protocol: "compact", results: [], compactResults } });
      });
    },
    terminate() {},
  };
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 2, maxSpawners: 2 });
  const first = world.spawners[0];
  const second = world.spawners[1];
  assert.ok(first);
  assert.ok(second);
  const firstJob = brainJobForSpawner(first, Array.from({ length: 16 }, () => 0), 0);
  const secondJob = brainJobForSpawner(second, Array.from({ length: 16 }, () => 0), 1);
  const learnedOnlyJob = {
    ...firstJob,
    learnedState: structuredClone(firstJob.learnedState),
  };
  learnedOnlyJob.learnedState.outputBiasDeltas[outputBiasDeltaKey(0)] = 0.5;
  const pool = createBrainEvalPool({ workerCount: 1, timeoutMs: 100, cacheLimit: 1, protocol: "compact", workerFactory: () => worker });

  await pool.evaluateBatch([firstJob]);
  const learnedOnlyResult = await pool.evaluateBatch([learnedOnlyJob]);
  const learnedOnlySync = evaluateBrainJob(learnedOnlyJob);
  await pool.evaluateBatch([secondJob]);
  await pool.evaluateBatch([firstJob]);

  assert.equal(requests.length, 4);
  assert.ok(requests[0]?.compactJobs?.[0]?.genome);
  assert.ok(requests[0]?.compactJobs?.[0]?.genomePayload);
  assert.equal(requests[1]?.compactJobs?.[0]?.genome, undefined);
  assert.equal(requests[1]?.compactJobs?.[0]?.genomePayload, undefined);
  assert.deepEqual(learnedOnlyResult[0]?.evaluation?.outputs.map(round), learnedOnlySync.evaluation?.outputs.map(round));
  assert.ok(requests[2]?.compactJobs?.[0]?.genome);
  assert.ok(requests[2]?.compactJobs?.[0]?.genomePayload);
  assert.ok(requests[3]?.compactJobs?.[0]?.genome);
  assert.ok(requests[3]?.compactJobs?.[0]?.genomePayload);
  pool.dispose?.();
}

async function testCompactBrainEvalPoolResendsGenomePayloadAfterFailedShard() {
  const requests: BrainEvalWorkerRequest[] = [];
  const listeners: Array<(event: { data: BrainEvalWorkerResponse }) => void> = [];
  const worker: BrowserWorker = {
    addEventListener(type: string, listener: unknown) {
      if (type === "message") listeners.push(listener as (event: { data: BrainEvalWorkerResponse }) => void);
    },
    postMessage(message) {
      requests.push(message);
      if (requests.length === 1) return;
      const compactResults = (message.compactJobs ?? []).map((job) => evaluateCompactBrainJob(job));
      queueMicrotask(() => {
        for (const listener of listeners) listener({ data: { type: "brainShardResult", requestId: message.requestId, protocol: "compact", results: [], compactResults } });
      });
    },
    terminate() {},
  };
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 1, maxSpawners: 1 });
  const spawner = world.spawners[0];
  assert.ok(spawner);
  const job = brainJobForSpawner(spawner, Array.from({ length: 16 }, () => 0), 0);
  const pool = createBrainEvalPool({
    workerCount: 1,
    timeoutMs: 5,
    disableAfterFailures: 2,
    cacheLimit: 10,
    protocol: "compact",
    workerFactory: () => worker,
  });

  await pool.evaluateBatch([job]);
  await pool.evaluateBatch([job]);

  assert.equal(requests.length, 2);
  assert.ok(requests[0]?.compactJobs?.[0]?.genome);
  assert.ok(requests[0]?.compactJobs?.[0]?.genomePayload);
  assert.ok(requests[1]?.compactJobs?.[0]?.genome);
  assert.ok(requests[1]?.compactJobs?.[0]?.genomePayload);
  pool.dispose?.();
}

function testBoundedCacheEvictsLeastRecentlyUsedEntries() {
  const cache = new BoundedCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
}

async function testBrainEvalPoolFallsBackWhenWorkersUnavailable() {
  const pool = createBrainEvalPool({ workerCount: 2, timeoutMs: 10 });
  const digest = await runAsyncParity(pool);
  assert.deepEqual(digest, runSyncParity());
  pool.dispose?.();
}

async function testAsyncAdvanceEpochMismatchFailsBeforeDecisionMutation() {
  const { timeline, world } = createOneTickWorld();
  const runner: BrainEvaluationRunner = {
    evaluateBatch(jobs) {
      const results = createSyncBrainEvaluationRunner().evaluateBatch(jobs) as BrainEvaluationResult[];
      const first = results[0];
      if (first) first.advanceEpoch = (first.advanceEpoch ?? 0) + 1;
      return Promise.resolve(results);
    },
  };
  await assert.rejects(
    () => advanceSpawnerWorldToTimelineAsync(world, timeline, 1, { brainEvaluationRunner: runner, sessionId: 1, runGeneration: 1, advanceEpoch: 1 }),
    /identity mismatch/,
  );
  assert.equal(world.foods.length, 0);
  assert.equal(world.spawners.every((spawner) => spawner.spawnedCount === 0), true);
}

function createOneTickWorld() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, { ...PARITY_CONFIG, initialSpawners: 12, maxSpawners: 12 });
  advanceMarketTimeline(timeline, 1, 1);
  return { timeline, world };
}

function brainJobForSpawner(spawner: SpawnerWorld["spawners"][number], inputs: number[], index: number) {
  return {
    sessionId: 1,
    runGeneration: 1,
    batchId: 1,
    tick: 1,
    index,
    spawnerId: spawner.id,
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs,
  };
}

function runSyncParity() {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, PARITY_CONFIG);
  advanceMarketTimeline(timeline, 120, 1_000);
  advanceSpawnerWorldToTimeline(world, timeline, 1_000);
  return worldDigest(world);
}

async function runAsyncParity(runner: BrainEvaluationRunner) {
  const timeline = createMarketTimeline(INITIAL_SETTINGS);
  const world = createSpawnerWorld(101, PARITY_CONFIG);
  advanceMarketTimeline(timeline, 120, 1_000);
  await advanceSpawnerWorldToTimelineAsync(world, timeline, 1_000, { brainEvaluationRunner: runner, sessionId: 2, runGeneration: 3 });
  return worldDigest(world);
}

function roundRecord(record: Record<number, number>) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, round(value)]));
}

function roundActivationMap(record: Record<string, { source: number; target: number }>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, { source: round(value.source), target: round(value.target) }]),
  );
}

export const tests: SineTest[] = [
  { name: "Pure Evaluation Does Not Mutate Spawner State", run: testPureEvaluationDoesNotMutateSpawnerState },
  { name: "Pure Evaluation Can Skip Trace Only Payloads", run: testPureEvaluationCanSkipTraceOnlyPayloads },
  { name: "Pure Evaluation Matches Compiled Plan Golden", run: testPureEvaluationMatchesCompiledPlanGolden },
  { name: "Compact Evaluation Preserves Trace Fallback Source State", run: testCompactEvaluationPreservesTraceFallbackSourceState },
  { name: "Runtime Activation Materializer Matches Full Evaluation", run: testRuntimeActivationMaterializerMatchesFullEvaluation },
  { name: "Runtime Evaluation Results Do Not Alias Subsequent Evaluations", run: testRuntimeEvaluationResultsDoNotAliasSubsequentEvaluations },
  { name: "Evaluation Frame Owns Ordered Inputs Jobs And Results", run: testEvaluationFrameOwnsOrderedInputsJobsAndResults },
  { name: "Compact Job Serialization And Response Materialization Match Object Evaluation", run: testCompactJobSerializationAndResponseMaterializationMatchObjectEvaluation },
  { name: "Compact Job Direct Array Kernel Clamps And Matches Object Evaluation", run: testCompactJobDirectArrayKernelClampsAndMatchesObjectEvaluation },
  { name: "Compact Response Materialization Preserves Trace Activation Materializer", run: testCompactResponseMaterializationPreservesTraceActivationMaterializer },
  { name: "Learned Delta Fixture Covers Clamping And Precision Sensitive Values", run: testLearnedDeltaFixtureCoversClampingAndPrecisionSensitiveValues },
  { name: "Async Out Of Order Runner Matches Sync Parity", run: testAsyncOutOfOrderRunnerMatchesSyncParity },
  { name: "Compact Runner Matches Sync Parity With Out Of Order Results", run: testCompactRunnerMatchesSyncParityWithOutOfOrderResults },
  { name: "Async Stale Result Fails Before Decision Mutation", run: testAsyncStaleResultFailsBeforeDecisionMutation },
  { name: "Compact Async Stale Result Fails Before Decision Mutation", run: testCompactAsyncStaleResultFailsBeforeDecisionMutation },
  { name: "Async Missing Result Fails Before Decision Mutation", run: testAsyncMissingResultFailsBeforeDecisionMutation },
  { name: "Compact Async Missing Result Fails Before Decision Mutation", run: testCompactAsyncMissingResultFailsBeforeDecisionMutation },
  { name: "Async Failed Result Fails Before Decision Mutation", run: testAsyncFailedResultFailsBeforeDecisionMutation },
  { name: "Compact Async Failed Result Fails Before Decision Mutation", run: testCompactAsyncFailedResultFailsBeforeDecisionMutation },
  { name: "Async Advance Epoch Mismatch Fails Before Decision Mutation", run: testAsyncAdvanceEpochMismatchFailsBeforeDecisionMutation },
  { name: "Brain Plan Cache Uses Current Forward Values And Invalidates Topology", run: testBrainPlanCacheUsesCurrentForwardValuesAndInvalidatesTopology },
  { name: "Brain Genome Cache Signature Includes Forward Values Only", run: testBrainGenomeCacheSignatureIncludesForwardValuesOnly },
  { name: "Brain Eval Pool Disables After Worker Failures", run: testBrainEvalPoolDisablesAfterWorkerFailures },
  { name: "Brain Eval Pool Resends Evicted Genome Keys", run: testBrainEvalPoolResendsEvictedGenomeKeys },
  { name: "Brain Eval Pool Resends Genome After Failed Shard", run: testBrainEvalPoolResendsGenomeAfterFailedShard },
  { name: "Compact Brain Eval Pool Resends Evicted Genome Payloads", run: testCompactBrainEvalPoolResendsEvictedGenomePayloads },
  { name: "Compact Brain Eval Pool Resends Genome Payload After Failed Shard", run: testCompactBrainEvalPoolResendsGenomePayloadAfterFailedShard },
  { name: "Bounded Cache Evicts Least Recently Used Entries", run: testBoundedCacheEvictsLeastRecentlyUsedEntries },
  { name: "Brain Eval Pool Falls Back When Workers Unavailable", run: testBrainEvalPoolFallsBackWhenWorkersUnavailable },
];
