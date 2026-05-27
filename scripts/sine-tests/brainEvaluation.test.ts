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
  type SpawnerConfig,
  type SpawnerWorld,
} from "../../src/sine/spawnerSimulation";
import { worldDigest } from "../../src/sine/testing/worldDigest";
import { evaluateBrainJob, type BrainPlanCache } from "../../src/sine/spawner/brainEvaluationRunner";
import { brainGenomeCacheSignature, brainPlanSignature } from "../../src/sine/spawner/brainPlan";
import { outputBiasDeltaKey } from "../../src/sine/spawner/plasticity";
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
      const results = message.jobs.map((job) => {
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
  assert.ok(requests[0]?.jobs[0]?.genome);
  assert.equal(requests[1]?.jobs[0]?.genome, undefined);
  assert.deepEqual(learnedOnlyResult[0]?.evaluation?.outputs.map(round), learnedOnlySync.evaluation?.outputs.map(round));
  assert.ok(requests[2]?.jobs[0]?.genome);
  assert.ok(requests[3]?.jobs[0]?.genome);
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
      const results = message.jobs.map((job) => evaluateBrainJob(job));
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
  assert.ok(requests[0]?.jobs[0]?.genome);
  assert.ok(requests[1]?.jobs[0]?.genome);
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

export const tests: SineTest[] = [
  { name: "Pure Evaluation Does Not Mutate Spawner State", run: testPureEvaluationDoesNotMutateSpawnerState },
  { name: "Pure Evaluation Can Skip Trace Only Payloads", run: testPureEvaluationCanSkipTraceOnlyPayloads },
  { name: "Async Out Of Order Runner Matches Sync Parity", run: testAsyncOutOfOrderRunnerMatchesSyncParity },
  { name: "Async Stale Result Fails Before Decision Mutation", run: testAsyncStaleResultFailsBeforeDecisionMutation },
  { name: "Async Missing Result Fails Before Decision Mutation", run: testAsyncMissingResultFailsBeforeDecisionMutation },
  { name: "Async Failed Result Fails Before Decision Mutation", run: testAsyncFailedResultFailsBeforeDecisionMutation },
  { name: "Async Advance Epoch Mismatch Fails Before Decision Mutation", run: testAsyncAdvanceEpochMismatchFailsBeforeDecisionMutation },
  { name: "Brain Plan Cache Uses Current Forward Values And Invalidates Topology", run: testBrainPlanCacheUsesCurrentForwardValuesAndInvalidatesTopology },
  { name: "Brain Genome Cache Signature Includes Forward Values Only", run: testBrainGenomeCacheSignatureIncludesForwardValuesOnly },
  { name: "Brain Eval Pool Disables After Worker Failures", run: testBrainEvalPoolDisablesAfterWorkerFailures },
  { name: "Brain Eval Pool Resends Evicted Genome Keys", run: testBrainEvalPoolResendsEvictedGenomeKeys },
  { name: "Brain Eval Pool Resends Genome After Failed Shard", run: testBrainEvalPoolResendsGenomeAfterFailedShard },
  { name: "Bounded Cache Evicts Least Recently Used Entries", run: testBoundedCacheEvictsLeastRecentlyUsedEntries },
  { name: "Brain Eval Pool Falls Back When Workers Unavailable", run: testBrainEvalPoolFallsBackWhenWorkersUnavailable },
];
