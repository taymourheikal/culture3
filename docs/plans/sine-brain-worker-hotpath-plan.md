# Sine Brain Hot-Path And Worker Payload Plan

This plan targets two related performance ideas while preserving functional parity:

1. Reduce per-agent brain evaluation cost, especially allocation, trace-only recomputation, and activation materialization.
2. Redesign browser Web Worker brain-evaluation payloads so local CPU parallelism has a real chance to beat sync evaluation.

The guiding principle is that the worker path must reuse the same brain kernel and effective-value materialization rules as the sync path. This plan must not create a second brain engine, a worker-only GRU implementation, or a permanent duplicate protocol path.

The worker-payload work targets browser Web Workers. Those workers can run on separate local CPU threads, but every shard still crosses the browser `postMessage` / structured-clone boundary. The payload redesign must focus on the per-tick data that still crosses that boundary: learned state, hidden state, inputs, and evaluation results. Genome caching already exists, so genome payload reduction alone is not enough to justify this work.

Moving work out of the browser is a later decision gate, not part of the immediate implementation. If out-of-browser acceleration is revisited, the likely useful boundary is the whole simulation loop, not per-tick brain evaluation over a network.

Milestone 1 clarified one important constraint: same-realm runtime sidecars can reduce trace materialization cost, but that sidecar state does not survive browser-worker structured cloning. The compact-worker work must therefore treat request size, response size, response materialization, and trace materialization as one design problem. A compact request format alone is not sufficient evidence for enabling parallelism.

## Non-Goals

- Do not change reward, payoff, transaction cost, reproduction, death, mutation, learning, market inputs, or action-selection semantics.
- Do not change the public saved-run schema or headless seed-bank data model.
- Do not enable browser parallelism merely because parity passes; it must beat sync wall time at a documented population threshold.
- Do not create a worker-specific brain math implementation.
- Do not split per-tick brain evaluation into a network service. Network latency would likely erase any compute win unless the whole simulation loop also moves.
- Do not drop activation, trace, hidden-state, learned-state, or inspection data that is currently required by learning, UI inspection, historical reconstruction, or tests.
- Do not make caches unbounded or process-lifetime unless their entries are keyed by a bounded runtime object such as a genome object in a `WeakMap`.
- Do not use `Float32Array` for compact brain state or weights unless a separate parity review explicitly accepts numerical drift. Default to ordinary JS number arrays or `Float64Array`.

## Architecture Gates

These gates apply to every milestone.

- Sync, async sync-runner, and browser-worker brain evaluation must remain functionally equivalent.
- Brain-output application order must remain deterministic.
- Any compact representation must have a single materialization path back to the current public DTO shape.
- The canonical evaluator remains in `src/sine/spawner/brain.ts`; worker code may call it or a shared internal kernel, but must not reimplement GRU-like math independently.
- Compact worker evaluation must be introduced by factoring the existing evaluator into shared runtime/materialization helpers, not by adding a parallel worker-only evaluator.
- Compiled-plan, effective-value, learned-state, and hidden-state cache keys must include every value needed for correctness.
- Caches must have explicit lifetimes and size bounds.
- Benchmarks must distinguish full runtime, brain-only timing, worker compute timing, worker post/response overhead where practical, and trace/activation overhead.
- Browser-worker benchmark evidence must not be generalized to Node worker threads, WASM, Rust, or native addons without a separate measurement pass.
- Any future out-of-browser runtime must reuse the same simulation/brain configuration surface and preserve deterministic parity with the browser/headless JS runtime.
- Verification must include `npm run check`, `npm run test:sine`, `npm run build`, browser parity, browser perf, and targeted headless/live perf samples when runtime semantics are touched.

## Milestone 0: Measurement And Parity Baselines

Goal: measure the current post-Milestone-6 runtime before changing brain evaluation or worker payloads.

### 1. Capture Brain And Runtime Baselines

Run current benchmarks for sync runtime, async sync-runner, browser sync, browser 4-worker parallel, and headless runtime.

Suggested commands:

```bash
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineBrowserPerf.ts --populations 100,250,500 --advance-ticks 200 --worker-counts 4
npx tsx scripts/sineBrowserPerf.ts --populations 1000 --advance-ticks 200 --worker-counts 4 --timeout-ms 120000
npx tsx scripts/sineHeadless.ts --run-id brain-worker-baseline --ticks 500 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 100 --db data/brain-worker-baseline.sqlite
```

Exit gates:
- Cached-plan and fresh-plan RNN timings are recorded at 100, 250, and 500 population.
- Pure advance and async sync-runner timings are recorded at 100, 250, and 500 population.
- Browser sync and browser 4-worker parallel timings are recorded at 100, 250, 500, and 1000 population, or the 1000-pop attempt records timeout/abort evidence.
- Headless timing records run time, advance time, recorder time, DB/write time, core estimate, ticks/sec, and row counts.
- Node parallel-pool rows are explicitly labeled as fallback if `browserWorkerApiAvailable` is false.
- Baseline notes distinguish browser Web Worker results from headless Node JS results.
- No production code changes are made in this step.

### 2. Add Trace Fallback Instrumentation

Measure how often `evaluationWithActivations()` reruns the brain for trace capture and how much time it costs.

Exit gates:
- Instrumentation distinguishes first-pass brain evaluation from activation/trace fallback evaluation.
- Counts include total evaluated agents, wait actions, long/short actions, reproduction traces, fallback trace evaluations, and fallback trace milliseconds.
- Instrumentation is benchmark-only or gated behind existing timing/reporting structures; it does not change learning or action behavior.
- Long runs with mostly-waiting agents and high-action-rate runs are both measured.
- Results identify whether trace fallback is a material hot path before optimization begins.

### 3. Strengthen Worker Payload Parity Fixtures

Extend existing worker/brain parity tests so a future compact payload can be compared against the current object payload.

Exit gates:
- Fixtures compare outputs, current hidden state, previous hidden state when requested, active connection IDs, and activation maps when requested.
- Fixtures preserve the pre-evaluation hidden state used by trace fallback and prove the applied hidden state matches the current object path.
- Fixtures cover learned connection deltas, output-bias deltas, gate-bias deltas, max learned-delta clamping, and base genome weight/bias changes.
- Fixtures include values that would expose numeric drift if a compact representation changes precision.
- Fixtures cover stale, missing, failed, and out-of-order worker results.
- Browser-worker parity still passes at representative population.
- Tests live inside the existing `scripts/sine-tests/` and browser parity script structure, not in a separate test framework.

Milestone exit gates:
- Baseline report exists with command, settings, population, tick count, and measured timings.
- Trace fallback cost is measured before optimization.
- Existing and new parity fixtures pass before implementation work begins.
- No production runtime behavior changes in this milestone.

## Milestone 1: Brain Runtime Allocation And Trace Hot-Path Reduction

Goal: reduce sync brain-evaluation overhead first, because a compact worker protocol will only pay off if the shared runtime kernel is array-friendly and cheap to materialize.

### 1. Introduce An Internal Runtime Brain Result

Add an internal result shape for runtime evaluation that can carry outputs and current hidden state in array form before materializing the public `BrainEvaluation` DTO.

Candidate shape:

```ts
type RuntimeBrainEvaluation = {
  outputs: number[];
  previousStateArray: number[];
  currentStateArray: number[];
  plan: CompiledBrainPlan;
  activeConnectionIds?: number[];
  connectionActivations?: BrainEvaluation["connectionActivations"];
};
```

Exit gates:
- Public APIs `evaluateSpawnerBrain`, `evaluateSpawnerBrainPure`, and `forwardSpawner` keep their signatures.
- Public `BrainEvaluation` output remains fixture-equivalent for existing tests, including rounded world-digest equality over deterministic runs.
- Internal runtime result is materialized through one shared function, not ad hoc object construction at call sites.
- `includeActivations: false` and `includePreviousState: false` avoid allocating activation maps and previous-state records.
- The runtime result still carries enough pre-evaluation hidden state for trace fallback and deterministic state application.
- Hidden-state current/update/previous semantics remain unchanged for recurrent and deeper-layer cases.

### 2. Reduce Per-Evaluation Array/Object Allocation

Use scoped scratch buffers where safe for previous hidden state, current hidden state, outputs, and possibly plan-aligned effective values.

Exit gates:
- No returned public DTO aliases scratch arrays that will be reused later.
- Scratch lifetime is per evaluation, per batch, or per tick; no unbounded global scratch cache is introduced.
- Scratch arrays use ordinary JS numbers or `Float64Array` unless precision-drift parity is explicitly reviewed and accepted.
- Outputs and hidden-state records remain stable after evaluation is applied to the spawner.
- Tests cover evaluating two agents in sequence to prove scratch reuse does not leak values.
- Brain-only perf at 100, 250, and 500 population improves or any regression is documented and reverted.

### 3. Optimize Trace Fallback Recomputations

If Milestone 0 shows trace fallback is material, reduce duplicate forward-pass work for acting agents.

Possible directions:
- Preserve enough first-pass runtime state to materialize trace activations without redoing avoidable work.
- Add a trace-only materializer that recomputes only activation details that learning consumes.
- Keep the first pass activation-free for every agent, then materialize or recompute trace details only for actual long, short, and reproduce traces.

Exit gates:
- Learning traces for long, short, and reproduce actions match existing fixtures.
- Wait actions still do not create decision traces.
- No reward is applied without the same trace semantics as before.
- Activation maps record the same connection IDs and source/target values as the existing trace path.
- Trace fallback uses the same pre-evaluation hidden state and learned state as the original decision evaluation.
- High-action-rate and mostly-waiting benchmarks compare fallback count/time before and after.
- If trace fallback is not material, this step is skipped with measured justification instead of adding complexity.

### 4. Preserve Inspection And Learning Materialization

Keep full activation and state DTOs available for RNN inspection, historical inspection, learning traces, and tests.

Exit gates:
- RNN architecture/inspection UI still opens for live and historical agents.
- `BrainEvaluation` fixtures still compare outputs, previous/current state, active IDs, and activation maps.
- Learning tests still pass for food resolution, reproduction feedback, trace pruning, and learned-state mutation.
- No UI, persistence, or inspector code imports a scratch-only runtime type.

Milestone exit gates:
- `npm run check`, `npm run test:sine`, and `npm run build` pass.
- Brain cached-plan timing at 100, 250, and 500 population is compared against Milestone 0 of this plan.
- Pure advance and headless timing are compared against Milestone 0 of this plan.
- Trace fallback count/time is either reduced or proven not material.
- No second brain engine or duplicate effective-value implementation exists.

## Milestone 2: Compact Worker Payload Foundation

Goal: define compact worker payloads and worker-side caches without enabling automatic parallelism yet.

This milestone must extend the current bounded genome-cache architecture. It should not treat genome caching as the main win, because workers already cache genomes by `brainGenomeCacheSignature()`. The main target is reducing structured-clone cost for per-tick learned state, hidden state, inputs, and result payloads.

Milestone 1 added a same-realm runtime sidecar that lets sync evaluation materialize trace activations without rerunning the full brain. Browser-worker `postMessage` strips that sidecar, so compact worker responses must preserve enough runtime data to rebuild the same materialization behavior on the main thread. Compact requests and compact responses are both required.

This milestone is a foundation and parity milestone, not an enablement milestone. The compact path may be used by tests and benchmark scripts, but live automatic threshold selection remains unchanged until Milestone 3 proves that the complete compact request/response path beats sync execution.

### 1. Define Compact Brain Payload Types

Add compact protocol types beside the existing protocol, but keep one runner abstraction.

Candidate types:

```ts
type CompactBrainGenomePayload = {
  genomeKey: string;
  planSignature: string;
  structuralPlan: CompactCompiledBrainPlanPayload;
  baseConnectionWeights: number[];
  outputBiases: number[];
  updateGateBiases: number[];
  resetGateBiases: number[];
  candidateGateBiases: number[];
  maxLearnedDelta: number;
};

type CompactLearnedStatePayload = {
  connectionDeltasByPlanIndex: number[];
  outputBiasDeltas: number[];
  updateGateBiasDeltasByUnitIndex: number[];
  resetGateBiasDeltasByUnitIndex: number[];
  candidateGateBiasDeltasByUnitIndex: number[];
};

type CompactBrainEvaluationJob = {
  index: number;
  spawnerId: number;
  genomeKey: string;
  learnedState: CompactLearnedStatePayload;
  hiddenState: number[];
  inputs: number[];
  includeActivations?: boolean;
  includePreviousState?: boolean;
};

type CompactBrainEvaluationPayload = {
  outputs: number[];
  currentState: number[];
  previousState?: number[];
  activeConnectionIds?: number[];
  connectionActivations?: BrainEvaluation["connectionActivations"];
  runtimeTraceState?: CompactBrainTraceStatePayload;
};
```

Exit gates:
- Compact protocol types are additive and do not remove the existing object protocol until parity is proven.
- Type names are domain-specific and live in the brain-evaluation protocol boundary.
- Compact payloads can be materialized from current `SpawnerGenome`, `SpawnerLearnedState`, hidden state, and inputs through one shared serializer.
- Compact result payloads can be materialized back into the current public `BrainEvaluation` shape through one shared materializer.
- Compact result payloads preserve enough runtime data to avoid losing Milestone 1 trace-materialization benefits after browser-worker structured clone.
- `runtimeTraceState` is clone-safe and does not depend on `WeakMap`, object identity, closures, or worker-local cache entries.
- Request and response serializers are paired in one module or one clearly named protocol boundary, so future protocol changes do not require updating separate duplicate serializers.
- The serializer uses `CompiledBrainPlan` order for indexes.
- Compact payloads include enough identity fields to preserve stale-result checks.
- Compact arrays use JS number arrays or `Float64Array` by default.

### 2. Add Worker-Side Compact Genome Cache

Extend the existing bounded worker cache so browser workers can cache compact structural plans and base genome values by `brainGenomeCacheSignature()`.

Exit gates:
- Cache key includes structural plan signature, connection weights, output biases, gate biases, and max learned-delta.
- Cache is bounded by the existing brain-eval cache limit or a documented compact-cache limit, and does not add an unbounded side cache.
- Cache invalidation tests cover topology mutation, weight-only mutation, output-bias mutation, gate-bias mutation, max-delta mutation, and failed shard/reset/disable paths.
- Worker resends compact genome payload after eviction or reset.
- No learned-state-specific arrays are cached globally unless learned deltas are included in the key; per-tick learned-state payloads remain owned by the current batch.
- Worker cache entries are treated as performance hints only; correctness must still be recoverable by resending the compact genome payload.
- Existing object-genome cache behavior is either reused directly or replaced by the compact cache after parity is proven, not duplicated permanently.

### 3. Materialize Compact Jobs From Existing Tick Contexts

Update `buildBrainEvaluationJobs()` or a companion helper so the runtime can create compact jobs from the same `SpawnerTickContext` used by sync evaluation.

Exit gates:
- Sync job order and identity fields match the current object job path.
- Inputs are identical to current `buildSpawnerInputs()` output.
- Hidden-state arrays are derived from the same compiled plan order as current brain evaluation.
- Learned-state deltas are sanitized/clamped through the same effective-value rules as current evaluation.
- Compact jobs preserve the original object job identity fields needed by `orderedEvaluationResults()`.
- Compact response materialization preserves the same result identity fields and ordering guarantees as the object response path.
- No world, UI, or persistence code needs to understand compact serialization internals.
- The existing `SpawnerTickContext` remains the source of truth for plan, inputs, spawner identity, and hidden state.
- Tests compare compact jobs against object jobs before worker execution, so serialization drift is caught separately from worker execution drift.

### 4. Add Compact Response Materialization

Add a main-thread materialization path for compact worker responses that rebuilds public `BrainEvaluation` results and, when requested later by trace capture, can materialize activation details without full brain recomputation.

Exit gates:
- Compact response materialization calls the same shared brain materializer pattern introduced in Milestone 1.
- Compact response results match object runner results for outputs, hidden state, activation maps, and active connection IDs.
- Trace materialization after a worker-returned compact result matches same-realm sync trace materialization.
- Compact responses do not expose scratch-only runtime types to world, UI, persistence, or inspector code.
- Result materialization tests cover include-activations false, include-previous-state false, and full inspection/activation requests.
- Response materialization does not rerun the full brain merely to recover activations or trace state.
- Any unavoidable effective-value rematerialization is measured separately in Milestone 3, because it can erase worker-payload gains.

### 5. Add Compact Evaluation Runner In Test Mode

Implement a compact runner path that can be used in tests and benchmark scripts without changing automatic live selection.

Exit gates:
- Compact runner calls the same shared brain kernel or materialization path as sync evaluation.
- Compact runner results match object runner results for outputs, hidden state, activation maps, and active connection IDs.
- Compact runner trace materialization after worker-style result transfer matches sync sidecar trace materialization.
- Existing stale/missing/failed/out-of-order result tests are duplicated or parameterized for compact jobs.
- Browser parity passes for compact worker path at representative population.
- Automatic live threshold remains conservative/disabled.
- Compact-runner tests simulate structured clone or worker-style transfer so same-realm object identity cannot accidentally satisfy parity.
- The compact runner is selected explicitly by tests or benchmark scripts; production runtime mode reporting does not claim compact parallelism unless Milestone 3 enables it.

Milestone exit gates:
- Compact payload implementation exists but automatic live parallelism remains disabled unless explicitly benchmarked.
- Object and compact worker paths produce identical results in tests and browser parity.
- Sync sidecar, object worker, compact worker request, and compact worker response paths are all covered by parity fixtures.
- Compact worker responses preserve or rebuild Milestone 1 trace-materialization behavior without relying on WeakMap state crossing `postMessage`.
- Cache size and invalidation behavior are tested.
- No duplicate worker-only GRU math exists.
- Structured-clone payload size or proxy payload size is measured before moving to enablement decisions.
- Milestone notes explicitly state whether compact payload savings came from requests, responses, trace materialization, or cache behavior.

## Milestone 3: Worker Payload Benchmarking And Threshold Decision

Goal: determine whether compact worker payloads make browser parallelism faster than browser sync at any useful population threshold.

Milestone 2 proved compact worker parity, but the performance evidence was mixed: cached compact requests were much smaller than object requests, while first-send compact requests and compact responses were larger. This milestone must therefore test warmup, cache reuse, genome churn, response transfer, and response materialization explicitly before any threshold decision.

### 1. Measure Serialization And Worker Overhead

Extend browser perf scripts or runner stats to separate full advance time from brain batch time, worker compute time, request post overhead, response materialization time, trace materialization behavior, and worker post/response overhead where practical.

Exit gates:
- Browser benchmarks report full advance time at 100, 250, 500, and 1000 population.
- Where practical, worker responses include shard compute milliseconds so browser-side post/response overhead can be estimated as batch wall time minus worker compute time.
- Benchmarks report brain batch count, average batch wall time, worker compute time, request payload size/proxy size, response payload size/proxy size, result materialization time, estimated post/response overhead, and fallback/disabled batches.
- Benchmarks separately report cold-cache first-send request size/time and warmed-cache request size/time.
- Benchmarks report whether trace capture after worker-returned results uses optimized materialization or full fallback recomputation.
- Benchmark instrumentation is lightweight and does not change production protocol semantics.
- Node fallback results remain clearly labeled and are not used as browser-worker evidence.
- Compact response materialization is timed separately from worker compute and main-thread world application.
- Compact response transfer and compact response materialization are treated as possible blockers, not secondary details.
- Benchmarks include at least one high-action-rate scenario so trace-materialization behavior is not hidden by mostly-waiting agents.

### 2. Measure Cache Warmup And Genome Churn

Measure whether compact request savings survive realistic evolutionary churn.

Scenarios:
- fixed population with no births/deaths, to isolate warmed-cache behavior
- normal evolutionary run with births/deaths enabled
- high-birth/churn run that forces frequent new genome sends
- longer run where initial genome-send cost can be amortized

Exit gates:
- Results report cache warmup duration in ticks and/or batches.
- Results report compact genome payload resend counts, cache hit/miss counts where practical, and effective request size after warmup.
- Results show whether high birth/death churn erases cached compact request savings.
- Results include at least one run long enough for first-send overhead to be amortized if amortization is plausible.
- If cache hit/miss instrumentation would add too much production complexity, a benchmark-only/proxy measurement documents that limitation.
- Compact worker is not considered for enablement unless it beats sync in warmed-cache and realistic-churn scenarios.

### 3. Compare Sync, Object Worker, And Compact Worker

Run browser benchmarks for:
- sync
- current object-payload worker
- compact-payload worker

Exit gates:
- All variants use the same market config, spawner config, tick count, seed, worker count, and population cap.
- Browser-worker parity passes before perf results are considered.
- Results include 100, 250, 500, and 1000 population, plus a larger population only if local runtime is reasonable.
- Compact worker must beat browser sync by a meaningful margin at more than one population size before enablement is considered.
- Compact worker must beat browser sync after cache warmup and under realistic genome churn before enablement is considered.
- Compact worker must include both compact request and compact response behavior before it is considered a real candidate for enablement.
- If compact requests improve posting cost but compact responses still lose trace/materialization wins, that limitation is documented before threshold decisions.
- If compact worker remains slower, worker complexity remains test/diagnostic only or is removed if it adds too much maintenance cost.
- Object-worker results remain in the comparison only as a baseline for the transport redesign; they are not kept as a permanent production path without a documented use.

### 4. Decide Automatic Parallel Threshold

Only update `MIN_PARALLEL_BRAIN_EVAL_JOBS` if compact workers clearly beat sync.

Exit gates:
- If enabled, threshold and worker count are documented in code comments, help text, and the final report.
- If enabled, tests assert the threshold selection behavior and current mode reporting.
- If not enabled, threshold remains conservative and the final report says why.
- Threshold decision includes cold-cache cost, warmed-cache benefit, genome churn, response transfer, response materialization, and trace-materialization costs, not only request payload size or worker compute time.
- Pause/stop/reset stale-result behavior still passes.
- Worker failure fallback still reports effective mode accurately.
- If compact workers are enabled, the code path uses one compact protocol by default rather than retaining object and compact protocols as parallel production modes.

Milestone exit gates:
- Browser sync versus compact-worker results are documented.
- Parallelism is either enabled at a measured threshold or left disabled with evidence.
- Final benchmark notes separate compact cold-cache cost, warmed-cache request benefit, genome churn impact, compact response cost, result materialization cost, and trace-materialization behavior.
- No worker protocol complexity is kept without either measurable speed benefit or clear diagnostic value.
- `npm run check`, `npm run test:sine`, browser parity, browser perf, and `npm run build` pass.

## Milestone 4: Final Cleanup, Documentation, And Regression Guard

Goal: remove any temporary protocol paths or measurement scaffolding that should not remain, then document the final performance/complexity result.

Milestone 4 cleanup is conditional on Milestone 3 evidence. If compact workers do not win, compact production plumbing should be removed or explicitly retained only as diagnostic/test infrastructure. If compact workers win, the compact protocol should become the single production worker protocol instead of leaving object and compact protocols as permanent parallel production modes.

Amended after Milestone 3: compact workers did not beat browser sync in fixed-population, warmed-cache, churn, or high-action scenarios. Milestone 4 therefore follows the diagnostic-retention path: keep compact worker coverage only where it protects parity/benchmark investigation, keep automatic nested-worker selection disabled, and document the measured sync default. The execution record is `docs/reports/sine-brain-worker-hotpath-m4-report.md`.

### 1. Remove Temporary Compatibility Paths

Delete temporary wrappers or dual paths that were only needed while proving compact payload parity.

Exit gates:
- No old helper remains solely to call the new helper with the same arguments.
- Stable public APIs remain if they have real callers.
- Search shows no duplicate brain kernel, duplicate effective-value materializer, duplicate worker protocol serializer, or duplicate hidden-state conversion path.
- TypeScript reports no unused exports.
- If a dual object/compact protocol remains, the report explains why both are necessary and how they share one evaluator.
- If compact worker path wins, the old object-worker protocol is removed unless it has a documented diagnostic or fallback purpose.
- If compact worker path does not win, compact production selection/configuration is removed or documented as diagnostic-only.
- If both object and compact worker protocols remain, tests prove both share one evaluator, one result materializer, and one trace-materialization policy.

### 2. Update Documentation And Help Text

Document the final brain-evaluation mode and performance result.

Exit gates:
- Help/README text accurately describes whether browser-worker parallelism is enabled, disabled, or threshold-gated.
- If compact workers are enabled, docs explain threshold, fallback, and failure behavior.
- If compact workers are not enabled, docs state that sync remains faster for measured settings.
- No docs claim parallelism improves speed unless measured results support it.

### 3. Add Regression Guards

Keep lightweight tests and benchmarks that protect the new architecture without turning perf into a brittle test.

Exit gates:
- Tests cover compact payload parity if compact payload remains in the codebase.
- Tests cover cache invalidation and stale-result rejection.
- Tests cover compact response materialization and trace materialization after browser-worker-style structured transfer.
- Benchmarks remain scripts/reports, not pass/fail unit tests based on unstable wall-clock thresholds.
- A final report records pre-plan, pre-this-plan, and post-this-plan timings.

Milestone exit gates:
- Full verification passes: `npm run check`, `npm run test:sine`, `npm run build`, browser parity, browser smoke, and relevant perf scripts.
- Final report states what sped up, what did not, and whether parallelism is enabled.
- No second brain engine, worker-only brain math path, unbounded cache, or duplicate protocol serializer remains.
- Functional parity is preserved for live runtime, headless runtime, learning, inspection, and worker fallback behavior.

## Milestone 5: Deferred Future Investigation

Status: deferred.

Milestone 3 and Milestone 4 made the browser-worker decision clear enough for this plan: automatic nested brain-worker evaluation remains disabled, compact worker mode is diagnostic/test infrastructure only, and no additional browser-worker benchmarking is needed now.

Out-of-browser acceleration, such as Node worker threads, shared buffers, WASM/Rust, or a native addon, is outside the scope of this plan. If that topic is reopened later, it should be handled as a separate plan with its own measurements, architecture gates, and functional-parity contract.

Milestone exit gates:
- No further work is required for this milestone in the current plan.
- No new benchmark obligation is added by this milestone.
- No TODO item is added for this milestone.
- Current functional parity remains governed by the Milestone 4 verification record and existing browser/headless tests.
