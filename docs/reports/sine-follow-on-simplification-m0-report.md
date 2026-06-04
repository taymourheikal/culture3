# Sine Follow-On Simplification Milestone 0 Report

Milestone: `docs/plans/sine-follow-on-simplification-audit-plan.md` Milestone 0.

Goal: lock down current behavior before moving duplicated logic. This milestone does not intentionally change simulation behavior, persistence schemas, reward logic, mutation semantics, learning semantics, brain evaluation results, uniqueness scoring, or UI data contracts.

## Target Ownership

| Target | Primary files | Classification | Expected impact |
| --- | --- | --- | --- |
| Diagnostics SVG chart duplication | `src/sine/history/RunDiagnosticsUi.tsx`, `src/sine/history/RunCohortPerformancePanel.tsx` | UI-only | Code clarity; lower chart-hover/grid drift risk |
| Lab/Runs settings storage patch duplication | `src/sine/settingsStorage.ts`, `src/sine/runsSettingsStorage.ts`, `src/sine/jsonStorage.ts` | Storage-only | Code clarity; lower default-save drift risk |
| Server repository JSON utility duplication | `server/sineRepositoryUtils.mjs`, `server/sineHeadlessRepositoryUtils.mjs` | Server-only | Code clarity; lower parse/stringify drift risk |
| Strategy-map repeated cluster scans | `src/sine/spawner/strategyMap.ts` | Runtime-adjacent | Code clarity and strategy-map compute speed |
| Compact brain payload repeated genome lookups | `src/sine/spawner/compactBrainEvaluation.ts`, `src/sine/spawner/brainPlan.ts`, `src/sine/spawner/effectiveGenome.ts` | Runtime-adjacent | Compact worker payload build speed; no brain-result change |
| Selected-spawner timeline runtime lookup | `src/sine/worker/selectedSpawnerTimelineService.ts`, `src/sine/worker/packetRuntimeContext.ts`, `src/sine/spawner/runtimeIndex.ts` | Runtime-adjacent | Small packet-time speedup; clearer packet-scoped index ownership |
| Perception trait field-list repetition | `src/sine/spawner/perception.ts` | Core-evolutionary | Code clarity; lower missed-field risk; high parity sensitivity |
| Mutation profile field-list repetition | `src/sine/spawner/mutationProfile.ts` | Core-evolutionary | Code clarity; lower missed-field risk; high parity sensitivity |
| Headless analysis mixed UI/data responsibilities | `src/sine/SineHeadlessAnalysis.tsx`, `src/sine/headless/headlessApi.ts` | UI/API boundary | Code clarity; lower Runs analysis maintenance cost |
| Headless API/server sort-key drift | `src/sine/headless/headlessApi.ts`, `server/sineHeadlessReadRepository.mjs`, `scripts/sine-tests/headless.test.ts` | API/server contract | Contract safety; no runtime speed impact |

## Characterization Added

- `scripts/sine-tests/strategyMap.test.ts`
  - Added a full representative strategy-map golden output for non-degenerate clustered populations.
  - Locks point fields, cluster fields, projected coordinates, cluster distances, percentiles, and weighted performance summaries.

- `scripts/sine-tests/perceptionMutationProfile.test.ts`
  - Added perception golden coverage for cache-key order/output, summary output, detail-row order/formatting, and fixed-seed mutation output.
  - Added mutation-profile golden coverage for summary output, detail-group order/formatting, and fixed-seed drift output.
  - These tests lock descriptor-conversion behavior, including RNG call order.

- `scripts/sine-tests/settings.test.ts`
  - Added Lab grouped-save characterization for market settings and playback settings.
  - Added Runs grouped-save characterization for market settings, playback settings, and spawner config.
  - Tests verify only requested keys are patched and unrelated saved keys are preserved.

- `src/sine/headless/headlessApi.ts`
  - Added exported runtime arrays for client-declared headless agent and lineage sort keys.
  - The existing TypeScript sort-key types now derive from those arrays.

- `scripts/sine-tests/headless.test.ts`
  - Added a temp-DB server repository contract test that exercises every client-declared headless agent and lineage sort key.
  - Also verifies unknown sort keys still fall back safely.

Existing coverage already protects compact brain object/compact parity in `scripts/sine-tests/brainEvaluation.test.ts`, including compact job serialization, compact response materialization, trace fallback materialization, out-of-order compact runner parity, stale/missing/failed result handling, and compact worker cache resend behavior.

## Baselines

These timings are local machine baselines for regression detection only. They are not functional-parity gates.

### Strategy Map Compute

Command:

```bash
npx tsx <<'TS'
import { performance } from "node:perf_hooks";
import { createSpawnerWorld } from "./src/sine/spawnerSimulation";
import { preparePopulationFeatureSpace } from "./src/sine/spawner/populationFeatureSpace";
import { buildPopulationStrategyMap } from "./src/sine/spawner/strategyMap";

for (const population of [100, 250, 500]) {
  const world = createSpawnerWorld(101, { initialSpawners: population, maxSpawners: population });
  let points = 0;
  const iterations = 10;
  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const map = buildPopulationStrategyMap(preparePopulationFeatureSpace(world.spawners));
    points += map.points.length;
  }
  const ms = performance.now() - started;
  console.log({ baseline: "strategyMap", seed: 101, population, iterations, totalMs: ms, avgMs: ms / iterations, points });
}
TS
```

Settings:

- seed: `101`
- populations: `100`, `250`, `500`
- iterations per population: `10`
- measured work: `preparePopulationFeatureSpace(world.spawners)` plus `buildPopulationStrategyMap(...)`

Results:

| Population | Iterations | Total ms | Avg ms |
| --- | ---: | ---: | ---: |
| 100 | 10 | 391.428 | 39.143 |
| 250 | 10 | 645.878 | 64.588 |
| 500 | 10 | 1355.559 | 135.556 |

### Compact Brain Payload Construction

Command:

```bash
npx tsx <<'TS'
import { performance } from "node:perf_hooks";
import { createSpawnerWorld, INPUT_COUNT } from "./src/sine/spawnerSimulation";
import { compileBrainPlan } from "./src/sine/spawner/brainPlan";
import { compactJobFromBrainEvaluationJob } from "./src/sine/spawner/compactBrainEvaluation";

for (const population of [100, 250, 500]) {
  const world = createSpawnerWorld(101, { initialSpawners: population, maxSpawners: population });
  const jobs = world.spawners.map((spawner, index) => ({
    sessionId: 1,
    runGeneration: 1,
    advanceEpoch: 1,
    batchId: 1,
    tick: world.tick,
    index,
    spawnerId: spawner.id,
    genome: spawner.genome,
    learnedState: spawner.learnedState,
    hiddenState: spawner.hiddenState,
    inputs: Array.from({ length: INPUT_COUNT }, (_, inputIndex) => Math.sin((index + inputIndex) / 17)),
    includeActivations: false,
    includePreviousState: false,
  }));
  const plans = jobs.map((job) => compileBrainPlan(job.genome));
  let payloads = 0;
  const iterations = 20;
  const started = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = 0; index < jobs.length; index += 1) {
      compactJobFromBrainEvaluationJob(jobs[index], { plan: plans[index] });
      payloads += 1;
    }
  }
  const ms = performance.now() - started;
  console.log({ baseline: "compactBrainPayload", seed: 101, population, iterations, payloads, totalMs: ms, avgPayloadMs: ms / payloads });
}
TS
```

Settings:

- seed: `101`
- populations: `100`, `250`, `500`
- iterations per population: `20`
- measured work: `compactJobFromBrainEvaluationJob(...)` with precompiled plans

Results:

| Population | Payloads | Total ms | Avg payload ms |
| --- | ---: | ---: | ---: |
| 100 | 2000 | 107.755 | 0.053877 |
| 250 | 5000 | 265.032 | 0.053006 |
| 500 | 10000 | 516.089 | 0.051609 |

### Selected-Spawner Timeline Sampling

Command:

```bash
npx tsx <<'TS'
import { performance } from "node:perf_hooks";
import { INITIAL_SETTINGS } from "./src/sine/marketSignal";
import { createSimulationState } from "./src/sine/simulationRuntime";
import { createSelectedSpawnerTimelineService } from "./src/sine/worker/selectedSpawnerTimelineService";
import { createFoodRuntimeIndex } from "./src/sine/spawner/runtimeIndex";

for (const population of [100, 500, 1000]) {
  const simulation = createSimulationState(INITIAL_SETTINGS, { initialSpawners: population, maxSpawners: population }, { seed: 101 });
  const selected = simulation.world.spawners.at(-1);
  if (!selected) throw new Error("missing selected spawner");
  const service = createSelectedSpawnerTimelineService();
  service.setSelectedSpawner(selected.id);
  const foodIndex = createFoodRuntimeIndex(simulation.world.foods);
  const samples = 2000;
  const started = performance.now();
  for (let tick = 0; tick < samples; tick += 1) {
    simulation.world.tick = tick;
    selected.lastAction = tick % 3 === 0 ? "long" : tick % 3 === 1 ? "short" : "wait";
    service.sample(simulation, foodIndex);
  }
  const ms = performance.now() - started;
  console.log({ baseline: "selectedSpawnerTimeline", seed: 101, population, selectedSpawnerId: selected.id, samples, totalMs: ms, avgSampleMs: ms / samples });
}
TS
```

Settings:

- seed: `101`
- populations: `100`, `500`, `1000`
- samples per population: `2000`
- measured work: `createSelectedSpawnerTimelineService().sample(...)` with a prebuilt food index
- selected spawner: last live spawner in each population

Results:

| Population | Samples | Total ms | Avg sample ms |
| --- | ---: | ---: | ---: |
| 100 | 2000 | 26.529 | 0.013265 |
| 500 | 2000 | 32.586 | 0.016293 |
| 1000 | 2000 | 42.148 | 0.021074 |

## Verification

- `npm run check`: passed.
- `npm run test:sine`: passed.

## Milestone 0 Gate Status

- Production behavior is unchanged: passed by inspection and contract tests. The only source change outside tests/docs is exported headless sort-key arrays that derive existing public types and do not change runtime behavior.
- Target scope and module ownership are documented: passed.
- `npm run check` passes: passed.
- `npm run test:sine` passes: passed.
- Later milestones have enough tests to detect behavior drift: passed for the planned high-risk areas, including descriptor field/order behavior, RNG-order behavior, strategy-map output, grouped settings saves, compact brain parity, selected-spawner timeline behavior, and headless sort-key contract drift.
