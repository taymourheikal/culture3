# Sine Exact-Parity Runtime Speedup Plan

This plan implements the highest-value speed and responsiveness targets identified by:

- `docs/reports/sine-runtime-speed-m1-backend-report.md`
- `docs/reports/sine-runtime-speed-m2-hotpath-report.md`

The goal is to reduce Sine simulation advance time by roughly `2x-4x` where the current hot paths make that realistic, while preserving exact deterministic parity.

Exact parity means:

- same seed
- same config
- same market data
- same tick count
- same simulation outcomes

No optimization in this plan may change agent decisions, reward/payoff, learning deltas, hidden state, births, deaths, mutation order, RNG usage, food/trade resolution order, event ordering, or persisted runtime outputs except for explicitly documented timing values.

## Scope

This plan prioritizes M2 simulation hot-path findings:

- learned-state decay
- food/trade resolution
- food retention/trimming
- trace capture and materialization
- exact-value market feature reuse
- compact runtime frames for per-tick evaluation
- plan-aligned learned-state access
- compact canonical brain evaluation
- lazy public DTO materialization

It also includes two M1 backend targets:

- mode-specific chunk tuning
- whole-run headless worker/process isolation for responsiveness

The M1 targets are included because they improve user experience and run control, not because they are expected to produce the main raw speedup.

## Non-Goals

- Do not introduce approximate market math.
- Do not change reward, payoff, learning, mutation, reproduction, death, lifecycle, or market-input semantics.
- Do not create a second simulation engine.
- Do not create separate headless-only runtime behavior.
- Do not implement a WASM, Rust, or native addon path in this plan.
- Do not replace the durable public `SpawnerWorld` / `SpawnerAgent` object model in one broad rewrite.
- Do not revive browser-worker brain sharding as a speed target.
- Do not pursue DB writer workers or SQLite schema changes for speed.
- Do not treat backend responsiveness gains as raw simulation-speed gains.
- Do not accept benchmark improvement if deterministic parity fails.
- Use the strict digest added in Milestone 0, `src/sine/testing/strictWorldDigest.ts`, as the primary simulation-parity guard for later runtime changes. Existing rounded `worldDigest()` tests remain useful, but they are not sufficient for this plan's exact-parity standard.

## Architecture Gates

These gates apply to every milestone.

- Keep one canonical runtime engine in `src/sine`.
- Keep hot-path helpers focused and domain-shaped. Prefer small functions/modules over broad generic frameworks.
- Do not keep permanent old/new fast-path duplicates.
- If a fast path is added, it must call the same canonical formula or prove identical output through strict tests.
- Treat compact arrays as private runtime views unless a milestone explicitly makes one representation canonical.
- Keep `SpawnerAgent` and `SpawnerWorld` as the durable source of truth until a specific replacement boundary is proven.
- Avoid dual object/array state that can drift; every compact view must have one owner, one lifetime, and one materialization path.
- Keep `world.foods` compatible as the public runtime/history surface unless a milestone explicitly replaces it behind a compatibility boundary.
- Do not make UI, persistence, or headless callers know about private runtime indexes unless that is the explicit public contract.
- Runtime modules must not import React, server repositories, persistence clients, or browser-only APIs.
- Verification must include `npm run check` and `npm run test:sine` after shared runtime changes.
- Any milestone that changes runtime state, food order, trace state, learned state, or chunking must pass strict digest parity through `strictWorldDigest()`.
- Run `npm run build` if UI/browser/server integration code is touched.

## Baseline Evidence

M1 found that the backend stack mainly limits responsiveness, not raw simulation throughput. Active headless runs block the Node event loop because they run CPU-heavy chunks in the same process that serves HTTP. SQLite reads and writes were not the primary speed bottleneck.

M2 found that normal runs are dominated by:

- brain evaluation
- learned-state decay
- market input/context construction
- plan lookup

M2 also found that high-action runs shift bottlenecks toward:

- food/trade resolution
- trace capture/materialization
- food trimming
- learned-state decay

This plan therefore starts with structural runtime waste before considering deeper brain or native-kernel work.

Milestone 1 execution reduced learned-state decay materially while preserving strict parity. Later implementation milestones should compare against both the original Milestone 0 baseline and the latest immediate pre-milestone timing, starting with `docs/reports/sine-exact-parity-runtime-speedup-m1-report.md` and `/tmp/sine-exact-parity-m1-hotpath.json` where available.

A Milestone 2 food-lifecycle indexing attempt preserved parity but did not pass the performance gate. The private pending/resolved bucket bookkeeping made high-action food resolution slower than the post-M1 array-scan path, while trimming savings were too small to offset it. Keep the current `world.foods` scan/trim behavior for now; do not reintroduce food lifecycle indexing unless a future design proves lower per-resolved-food overhead before integration.

Milestone 3 execution reduced trace capture materially while preserving exact parity. Later milestones should treat `docs/reports/sine-exact-parity-runtime-speedup-m3-report.md` and `/tmp/sine-exact-parity-m3-post-hotpath.json` as the latest raw-runtime comparison point where available.

Historical simplification work showed that the largest raw runtime gains came from reducing per-forward-pass object/key lookup rather than adding browser-worker parallelism. `docs/reports/sine-simplification-milestone-5-report.md` showed clear gains from plan-aligned effective-value arrays and cached-plan brain hot-path work. `docs/reports/sine-simplification-milestone-6-report.md` showed browser worker parallelism still losing to browser sync through the measured population range, while headless speed improved because it shares the same optimized brain/runtime path.

The next raw-speed block therefore extends the successful direction: keep one engine, but make more of the tick loop operate on compact, plan-aligned runtime views before materializing public DTOs.

## Milestone 0: Exact-Parity Baselines And Harness

Goal: lock down the current behavior and timing baseline before implementing speed changes.

### 1. Capture Current Speed Baselines

Run the M2 hot-path benchmark with the same seed and settings used in the M2 report.

Required scenarios:

- `baseline`
- `mostly-waiting`
- `high-action`
- `high-reproduction`

Required populations:

- `100`
- `250`
- `500`

Exit gates:

- Benchmark output records command, seed, tick count, populations, scenarios, and machine context where practical.
- Results include ticks/sec, average tick ms, top phases, phase totals, action counts, birth counts, pending food, retained food, due food, and trace metrics.
- Results include a pre-change table that later milestones can compare against.
- Benchmark runs do not touch production DBs.
- Benchmark scripts remain benchmark-only or gated.

### 2. Add Strict Runtime Digest Coverage

Strengthen parity coverage for the exact fields touched by this plan. Existing `worldDigest()` rounds numeric values, so it is not enough by itself for this plan's exact-parity standard.

Required coverage:

- learned state maps and counters
- hidden state
- food/trade status, payoff, spawn tick, resolve tick, and order
- recent events and event order
- lineage births/deaths
- spawner energy/health/resolved counts
- trace ids, trace order, active connection ids, and connection activation values

Exit gates:

- A strict digest or exact snapshot comparison exists for optimized runtime paths.
- Tests fail on changed ordering, missing fields, or numeric drift beyond the explicitly allowed representation tolerance.
- Existing rounded `worldDigest()` tests remain useful but are not the only parity guard.
- Tests cover both normal and high-action worlds.
- Tests cover at least one world with non-empty learned deltas.

### 3. Add Cross-Chunk Parity Coverage

Chunk size should affect progress/cancellation cadence, not simulation results.

Exit gates:

- Same-seed headless runs with representative chunk sizes produce identical strict runtime digests.
- Coverage includes chunk sizes used by API mode and pure headless mode.
- Checkpoint/progress timing fields are excluded from simulation parity comparison.
- Cancellation behavior remains tested at chunk boundaries.
- Existing headless recorder parity tests still pass.

### 4. Add Same-Tick Food Resolution Characterization

Food resolution order matters because same-tick losses can change health, energy, learning, and liveness.

Exit gates:

- Tests characterize current order for multiple foods due on the same tick.
- Tests cover same-tick food that kills a creator before another same-tick food from the same creator resolves.
- Tests cover living and dead creator policy.
- Tests assert event order and `world.foods` order after resolution.
- Tests assert learning deltas after same-tick resolution.

## Milestone 0 Exit Gates

- Production behavior is unchanged.
- Current timing baseline is recorded.
- Strict parity coverage exists before optimization begins.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 1: Sparse Learned-State Decay

Goal: reduce ordinary tick-loop cost by skipping decay work that provably produces the exact same learned state.

M2 showed learned-state decay is a top ordinary cost. At 250 population, baseline learned-state decay was about `1171 ms` over 200 ticks, while mostly-waiting was about `14 ms`.

Milestone 0 confirmed this remains the first implementation target: the M0 baseline still shows learned-state decay as a top baseline cost, about `1193 ms` at 250 population and about `2517 ms` at 500 population over 200 ticks.

### 1. Audit Learned-State Decay Semantics

Document the current decay path in `src/sine/spawner/plasticity.ts` and the call site in `src/sine/spawner/world.ts`.

Exit gates:

- The current decay formula is identified.
- Sanitization, clamping, deletion, and zero-value behavior are documented in tests or comments.
- `recentLearningSignal`, `learningUpdateCount`, and `reproductionLearningCount` behavior is accounted for.
- Reproduction inheritance semantics are accounted for.
- No implementation changes are made in this step except test scaffolding if needed.

### 2. Add Active-Learned-State Detection

Introduce a small helper that identifies whether decay can change a learned state.

Exit gates:

- Empty delta maps are detected without scanning unnecessary map entries.
- Zero learning and zero decay-rate cases are detected.
- The helper is shared by decay code and tests instead of duplicating learned-state checks.
- The helper does not mutate learned state.
- Tests cover empty, non-empty, zero-decay, and clamped learned states.

### 3. Implement Exact No-Op Decay

Skip decay only when the returned learned state would be identical under the current canonical behavior.

Exit gates:

- Empty/default learned states remain structurally compatible with existing callers.
- Non-empty learned states decay exactly as before.
- Deletion thresholds and zero-removal behavior are unchanged.
- No RNG, spawner iteration, trace, or event order changes.
- Strict digest parity through `strictWorldDigest()` passes for worlds with and without learned deltas.

### 4. Benchmark Learned-State Decay

Run the hot-path benchmark subset most likely to show this change.

Exit gates:

- `learnedStateDecay` total time and ms/tick are lower in baseline/evolved scenarios.
- Mostly-waiting scenario does not regress.
- High-reproduction scenario does not regress materially.
- Benchmark report distinguishes learned-decay gains from run-to-run noise.
- `npm run check` and `npm run test:sine` pass.

## Milestone 1 Exit Gates

- Learned-state decay is faster.
- Exact deterministic parity is preserved.
- Learned-state logic remains in one canonical module.
- No permanent duplicate slow/fast learned-state engine exists.
- A short milestone report records before/after timing.

## Milestone 2: Food Lifecycle Indexing Viability Decision

Goal: preserve the current food lifecycle path after validating that the proposed private index does not satisfy this plan's exact-parity speedup standard.

M2 showed high-action 250 population spent about `1265 ms` in food resolution and about `267 ms` in food trimming over 200 ticks.

Milestone 1 did not change food semantics. A food-indexing implementation was tested against the post-M1 benchmark and preserved exact behavior, but the index bookkeeping increased high-action food resolution time. Treat this milestone as a completed viability decision, not an implementation milestone.

### 1. Define The Food Lifecycle Contract

Make the current runtime contract explicit before changing data structures in any future attempt.

Exit gates:

- Pending food, resolved food, retained historical food, event snapshots, and UI-visible food markers are distinguished.
- Current `world.foods` ordering requirements are documented.
- Current same-tick resolution order is documented.
- Current trimming/retention behavior is documented.
- Current pending-food count behavior remains covered for stats, roster, selected-agent timeline, and market inputs.
- No implementation change is accepted from this step.

### 2. Record The Rejected Index Shape

Document why the attempted private index is not kept.

Exit gates:

- The rejected shape is described: pending buckets by `resolveTick`, resolved buckets for retention, per-creator pending counts, and a `world.foods` compatibility surface.
- The reason for rejection is explicit: per-resolved-food index maintenance outweighed trimming savings in high-action workloads.
- Exact parity success is separated from performance failure.
- No private food lifecycle index module remains in production code.
- No packet/UI/headless caller depends on private food lifecycle bucket internals.

### 3. Keep The Current Resolution Path

Keep food resolution on the current `world.foods` scan until a lower-overhead design is proven.

Exit gates:

- Each food resolves exactly once.
- Event order remains covered by the strict digest.
- Creator learning deltas remain covered by the strict digest.
- Creator energy, health, wins/losses, and liveness remain unchanged.
- Dead-creator policy remains unchanged.
- Same-tick food behavior remains covered by Milestone 0 characterization: if an earlier due food kills a creator, later same-tick foods still resolve globally but do not credit or mutate the dead creator.
- `resolveFoods()` does not carry a permanent slow/fast duplicate path.

### 4. Keep Shared Pending Count Helper As The Boundary

Use the existing `createFoodRuntimeIndex(world.foods)` helper as the shared boundary for pending counts.

Exit gates:

- World-level pending count matches `createFoodRuntimeIndex(world.foods).pendingCount`.
- Per-creator pending counts used by roster/selection remain correct.
- Market input pending density receives the same value as before.
- Callers that still need a `FoodRuntimeIndex` can get one from a shared helper.
- No UI/persistence caller reads private bucket internals.
- No second pending-count implementation is introduced.

### 5. Defer Retention Queue Semantics

Do not replace retention filtering in this milestone. The attempted resolved-bucket retention path moved cost into food resolution and did not improve total high-action runtime.

Exit gates:

- Pending unresolved foods are never trimmed.
- Resolved foods remain visible for exactly the same configured retention window.
- `world.foods` order remains compatible with chart, packet, persistence, and headless recorder behavior.
- No pending/resolved bucket entries exist to orphan.
- Strict digest parity through `strictWorldDigest()` passes after retention windows are crossed.
- Future retention work requires a prototype benchmark before production integration.

### 6. Benchmark And Document The Decision

Compare the attempted index path against the post-M1 benchmark, then leave production on the current path.

Exit gates:

- Results compare against the Milestone 0 baseline and the immediate post-Milestone-1 benchmark.
- High-action `foodResolution` is explicitly shown not to drop with the attempted index shape.
- High-action `foodTrimming` savings are explicitly shown to be too small to offset resolution bookkeeping.
- Normal baseline is protected by reverting/deferring the index path.
- Pending, retained, and due food counts remain identical to strict parity fixtures.
- `npm run check` and `npm run test:sine` pass.

## Milestone 2 Exit Gates

- The attempted food-index implementation is not retained because it fails the speed gate.
- `world.foods` remains the clean compatibility surface for UI, persistence, stats, and headless recorder code.
- Exact deterministic parity is preserved.
- No production food lifecycle duplicate/index module remains.
- Later milestones compare against the post-M1 baseline, not a failed post-M2 index baseline.
- A milestone note/report records the rejected high-action timing.

## Milestone 3: Trace Capture And Materialization Slimming

Goal: reduce high-action trace cost without changing learning.

M2 showed high-action 250 population spent about `1091 ms` in trace capture and about `468 ms` in trace activation materialization over 200 ticks.

After Milestone 1 and the Milestone 2 deferral, trace work remains one of the clearest high-action bottlenecks. Benchmark this milestone against the post-M1 baseline, not a failed post-food-index baseline, so trace gains are not conflated with learned-decay changes or rejected food-indexing work.

### 1. Audit Trace Consumers

Identify every consumer of `SpawnerDecisionTrace`.

Required consumers:

- food-resolution learning
- reproduction learning
- trace pruning
- selected-agent and inspection surfaces, if any
- persistence/headless snapshots, if any

Exit gates:

- Every trace field has a named consumer or is marked removable.
- Learning-critical fields are distinguished from inspection-only fields.
- Reproduction trace requirements are documented.
- Current trace-store retention behavior is characterized.
- No implementation changes are made in this step except tests if needed.

### 2. Add Golden Trace Fixtures

Lock trace values before slimming.

Exit gates:

- Fixtures cover long, short, and reproduce traces.
- Fixtures cover active hidden-gate and output connections.
- Fixtures assert active connection ids and activation values exactly enough to catch drift.
- Fixtures cover optimized materialized activation path and fallback evaluation path.
- Fixtures cover wait actions creating no trace.
- Fixtures or strict digest coverage include `traceStore.nextTraceId`, so trace-id sequencing cannot drift silently.

### 3. Reuse Existing Runtime Evaluation Artifacts

Avoid trace-only recomputation or materialization when the first-pass evaluation already has the required data.

Exit gates:

- Learning receives identical active connection ids and activation values.
- Reproduction learning receives identical trace context.
- Fallback evaluation still exists only for cases where required activation data is missing.
- Fallback recomputation count drops where the optimized path can cover the trace.
- No reward is applied without the same causal trace data as before.

### 4. Slim Trace Copying Without Changing Stored Semantics

Reduce allocation/copy cost while preserving the canonical stored trace shape at the boundary.

Exit gates:

- Stored `SpawnerDecisionTrace` remains compatible with existing sanitizer and clone logic.
- Copying avoids redundant intermediate objects where possible.
- Trace store size and allocation pressure decrease in high-action benchmarks.
- Learning and reproduction-learning tests pass unchanged.
- Strict digest parity through `strictWorldDigest()` passes.

### 5. Benchmark Trace Changes

Run high-action, baseline, and high-reproduction scenarios.

Exit gates:

- Results compare against the immediate pre-Milestone-3 benchmark and the Milestone 0 baseline.
- High-action `decisionTraceCapture` time drops.
- High-action `traceActivationMaterialization` or `traceFallbackEvaluation` time drops.
- Baseline and reproduction scenarios do not regress materially.
- `npm run check` and `npm run test:sine` pass.
- A report distinguishes trace gains from food-lifecycle gains.

## Milestone 3 Exit Gates

- Trace work is cheaper under high-action workloads.
- Learning and reproduction learning are exactly preserved.
- There is still one canonical trace model.
- No permanent duplicate trace engine exists.
- A milestone report records before/after timing.

## Milestone 4: Exact-Value Market Feature Reuse

Goal: reduce market input/context construction cost only where exact values can be preserved.

M2 showed market input/context construction is a material ordinary-run cost, but evolved agents mostly have unique perception keys. This milestone is intentionally later because market features are floating-point sensitive.

Milestone 1 improved normal-run average tick time by reducing learned-state decay, so market-input gains should be evaluated with sober expectations. If exact reuse does not produce a meaningful improvement, remove the added complexity rather than keeping a weak optimization.

### 1. Expand Market-Input Golden Coverage

Strengthen tests before changing feature computation.

Required feature families:

- local scale
- rolling deltas
- rolling window stats
- trend regression
- cycle/roughness
- relative volume
- volume delta
- volume acceleration
- RSI
- volume-price agreement

Exit gates:

- Golden tests cover generated and candle market data.
- Tests cover multiple mutable perception windows and lags.
- Tests cover flat data, short history, missing volume, and tiny local scale.
- Tests use strict deterministic expectations appropriate for exact parity.
- Existing market-input golden tests remain meaningful.

### 2. Identify Exact Reuse Candidates

Review each feature family for reusable summaries that do not change arithmetic order or rounding behavior.

Exit gates:

- Each candidate states the current formula and iteration order.
- Candidates that require changed arithmetic order are deferred.
- Candidates that require approximation are deferred.
- Cache keys include every trait that affects output.
- The review identifies at least one accepted or rejected candidate with evidence.

### 3. Implement Shared Exact Summary Helpers

Add small, reusable helpers only for accepted candidates.

Exit gates:

- Helpers are shared by relevant feature paths instead of duplicating formulas.
- Helper output matches current feature values in golden tests.
- No approximate rolling or regression math is introduced.
- No second market-input engine is created.
- Cache hit/miss and feature timing instrumentation remain available.

### 4. Benchmark Market Input Changes

Run baseline and evolved-population benchmarks.

Exit gates:

- Results compare against the immediate pre-Milestone-4 benchmark and the Milestone 0 baseline.
- Market input/context time drops, or weak improvement is documented and no extra complexity is retained.
- Exact market input golden tests pass.
- Strict simulation digest parity through `strictWorldDigest()` passes.
- `npm run check` and `npm run test:sine` pass.
- Any deferred feature-family optimization is documented with the parity risk.

## Milestone 4 Exit Gates

- Market input construction is faster where exact reuse is possible.
- Exact deterministic parity is preserved.
- Feature code is simpler or no more complex than before.
- Approximate feature math remains out of scope.
- A milestone report records accepted, rejected, and deferred candidates.

## Milestone 5: Ephemeral Spawner Evaluation Frame

Goal: reduce per-tick object churn by building one narrow, private frame for living-agent evaluation.

This milestone must not mirror the whole world as parallel arrays. The frame is an ephemeral tick-local view over the current living `SpawnerAgent` objects, used only for plan lookup, market inputs, brain evaluation, result application, and trace materialization.

### 1. Define The Frame Boundary

Create a small runtime type, for example `SpawnerEvaluationFrame`, that owns only data needed for the current decision pass.

Candidate frame fields:

- spawner references
- spawner ids
- frame indexes
- compiled plans
- input arrays
- hidden-state arrays
- optional plan-aligned learned/effective values added by later milestones

Exit gates:

- The frame is tick-local and discarded after `finishSpawnerWorldStep()`.
- The frame does not duplicate durable energy, health, lineage, generation, payoff, trace store, or food state.
- `SpawnerAgent` remains the durable source of truth for UI, persistence, reproduction, death, and inspection.
- Frame construction preserves current spawner order exactly.
- No UI, persistence, headless repository, or server module imports the frame type.

### 2. Replace Context And Job Duplication With Frame-Owned Data

Refactor `buildSpawnerTickContexts()` and `buildBrainEvaluationJobs()` so the frame owns shared values instead of creating parallel context and job arrays with repeated identity fields where the sync path does not need them.

Exit gates:

- Sync evaluation can read spawner refs, plans, inputs, and hidden arrays from the frame.
- Async/browser-worker jobs still receive the identity fields required for stale-result checks.
- `orderedEvaluationResults()` remains correct for async results.
- Session, run generation, advance epoch, batch id, tick, index, and spawner id checks are preserved for worker paths.
- No second context-builder implementation remains for sync versus async paths; shared frame data is the source for both.

### 3. Apply Results Through The Frame

Update result application and action decoding to consume frame-aligned results without changing action order.

Exit gates:

- Action selection still runs in original spawner order.
- Birth append, death pruning, reproduction, RNG use, and event order are unchanged.
- Hidden state application produces the same public `spawner.hiddenState`.
- Trace activation lookup still has access to the exact pre-evaluation hidden state and inputs.
- Strict digest parity passes for normal, high-action, and high-reproduction worlds.

### 4. Benchmark Frame Construction

Measure whether frame ownership reduces context/job construction overhead.

Exit gates:

- `spawnerContextInputConstruction`, `brainJobConstruction`, `resultOrdering`, and `resultApplication` timings are compared pre/post.
- Full average tick time is compared at 100, 250, and 500 population.
- Any regression in browser-worker diagnostic parity is fixed or the frame boundary is narrowed.
- `npm run check` and `npm run test:sine` pass.
- A milestone report states whether the frame reduced allocation/DTO work or only clarified boundaries.

## Milestone 5 Exit Gates

- One ephemeral evaluation frame exists for the decision pass.
- Durable world/spawner state remains object-shaped and canonical.
- No duplicate sync/async context pipeline is introduced.
- Exact deterministic parity is preserved.
- A milestone report records timing and architecture impact.

## Milestone 6: Plan-Aligned Learned-State Runtime Views

Goal: extend the successful plan-aligned effective-value work to learned-state access without creating object/array state drift.

Current learned state is public object maps. This milestone introduces plan-aligned runtime views for hot-path evaluation, decay, and learning where exact parity can be maintained. Public persisted/inspection state remains the existing `SpawnerLearnedState` shape unless this milestone explicitly materializes through one boundary.

### 1. Add A Learned-State Runtime View

Create a compact view aligned to `CompiledBrainPlan`:

- connection deltas by plan connection index
- output bias deltas by output index
- gate bias deltas by plan unit index
- recent learning signal
- learning update count
- reproduction learning count
- active-delta counts or flags for no-op decay

Exit gates:

- The view is built from the existing public learned-state maps through one shared converter.
- The converter reuses the same key functions and clamp/sanitize rules as `plasticity.ts`.
- The view is scoped to one compiled plan signature.
- The view is not cached globally unless cache keys include every correctness dependency.
- Tests cover connection, output-bias, and gate-bias deltas.

### 2. Use The View For Effective-Value Construction

Update plan-aligned effective-value materialization so it can consume the learned-state runtime view without repeated string-key map lookups.

Exit gates:

- `createPlanAlignedEffectiveBrainValues()` still accepts the public learned-state shape.
- Object-based effective-value access remains available for inspection, inheritance, uniqueness, and non-plan code.
- Plan-aligned values match object-based effective values exactly.
- Base genome weight, output-bias, gate-bias, max-delta, and learned-delta changes still affect values correctly.
- No second learned-value formula is introduced.

### 3. Use The View For Decay Where Exact

If the runtime view can make learned-state decay cheaper, add a view-aware path that still materializes the same public learned-state result.

Exit gates:

- Empty/default learned states still skip work exactly as before.
- Non-empty learned states decay, clamp, and delete zero values exactly as before.
- `recentLearningSignal`, `learningUpdateCount`, and `reproductionLearningCount` are unchanged.
- Public learned-state object identity changes only where current semantics already return a changed state.
- Strict digest parity passes with active learned deltas.

### 4. Preserve Learning And Reproduction Semantics

Either keep learning mutation on the public learned-state maps or update through one adapter that materializes the same maps immediately after learning.

Exit gates:

- `applyFoodResolutionLearning()` and `applyReproductionLearning()` produce identical learned maps and counters.
- `materializeEffectiveGenomeForInheritance()` produces identical child base genomes.
- Reproduction learning count and learning update count remain identical.
- Trace deletion after food resolution remains unchanged.
- Tests cover learning after long, short, and reproduction traces.

### 5. Benchmark Learned-State View Impact

Measure hot phases before and after.

Exit gates:

- `learnedStateDecay`, `effectiveValueArrayConstruction`, and `brainEvaluation` phase timings are compared.
- Full tick timing is compared at 100, 250, and 500 population.
- High-action and high-reproduction scenarios are included.
- Any retained runtime-view cache has bounded lifetime and documented invalidation.
- `npm run check` and `npm run test:sine` pass.

## Milestone 6 Exit Gates

- Learned-state runtime views reduce hot-path map/string-key work or are removed.
- Public learned-state semantics and persistence shape are unchanged.
- Learning, reproduction, decay, and inheritance preserve exact parity.
- No permanent duplicate learned-state engine exists.
- A milestone report records timing and retained boundaries.

## Milestone 7: Compact Canonical Brain Kernel

Goal: make same-thread brain evaluation operate through one compact numeric kernel while preserving the public brain APIs.

This is not browser-worker parallelism and not a second GRU-like implementation. It is a refactor of the current evaluator so the canonical math accepts compact arrays directly, and public `BrainEvaluation` objects are materialized only at the boundary.

### 1. Define The Kernel Input And Output

Define internal types for compact evaluation:

- compiled plan
- input array
- previous hidden-state array
- current hidden-state output array
- output score array
- plan-aligned effective values
- optional activation recording target

Exit gates:

- Public `evaluateSpawnerBrain`, `evaluateSpawnerBrainPure`, and `forwardSpawner` signatures remain stable.
- The compact kernel is internal to `src/sine/spawner`.
- The kernel does not import UI, persistence, server, or worker-specific modules.
- Kernel inputs are ordinary JS number arrays unless a separate parity review accepts typed-array precision/behavior changes.
- Existing runtime sidecar materialization has one path into the new kernel.

### 2. Move Hidden And Output Math Into The Kernel

Refactor hidden-layer and output evaluation so all callers use the same compact kernel.

Exit gates:

- No duplicate hidden-unit, gate-sum, output-sum, sigmoid, or tanh math remains.
- Activation recording reports the same active connection ids and source/target values.
- `includeActivations: false` and `includePreviousState: false` remain fast paths.
- Source-value semantics for input, previous hidden, and current hidden references are unchanged.
- Brain fixtures match exactly for outputs, previous/current state, active ids, and activation maps.

### 3. Reuse Frame-Owned Buffers Where Safe

Use frame-owned or evaluation-owned arrays for outputs/current hidden state where aliasing can be ruled out.

Exit gates:

- No returned public DTO aliases arrays that will be reused.
- Evaluating two agents in sequence cannot leak outputs or hidden state.
- Selected-agent inspection and RNN inspection still receive stable materialized values.
- Worker compact diagnostics still pass structured-clone parity.
- Allocation-sensitive timing improves or the scratch-buffer change is reverted.

### 4. Keep Worker And Sync Paths On One Kernel

Update object, compact, sync, async sync-runner, and diagnostic worker paths to share the same kernel/materializer boundary.

Exit gates:

- No worker-only brain math exists.
- Compact worker diagnostics do not rematerialize learned/hidden records only to call a different evaluator if the compact kernel can consume arrays directly.
- Object worker behavior remains parity-equivalent where retained.
- Browser-worker automatic selection remains disabled unless separate benchmark evidence changes that decision.
- Existing stale/missing/failed/out-of-order result tests still pass.

### 5. Benchmark Kernel Impact

Run brain-only and full-runtime benchmarks.

Exit gates:

- Cached-plan RNN timing improves at 100, 250, and 500 population or the change is narrowed.
- Full pure advance and async sync-runner timing improve or regressions are documented with phase evidence.
- Browser sync is remeasured because the live UI uses the same path.
- High-action trace materialization remains at least as fast as post-Milestone-3.
- `npm run check`, `npm run test:sine`, and `npm run build` pass if browser/worker integration changed.

## Milestone 7 Exit Gates

- One compact canonical brain kernel exists.
- Public brain APIs and inspection materialization remain compatible.
- Exact brain-output and strict world parity are preserved.
- Sync, async, and diagnostic worker paths share the same math.
- A milestone report records brain-only and full-runtime speed impact.

## Milestone 8: Lazy Runtime Result Application And DTO Boundaries

Goal: avoid building public `BrainEvaluation` DTOs for the normal sync tick path until a caller actually needs them.

Current sync evaluation can run activation-free but still materializes public result records for output decoding and hidden-state application. This milestone keeps compact runtime results internal and materializes public DTOs only for trace, inspection, worker protocol, persistence/test boundaries, or explicit public APIs.

### 1. Add An Internal Runtime Result Type

Introduce a result type that carries outputs, previous/current hidden arrays, plan, effective values, and optional trace materialization data.

Exit gates:

- Runtime result is internal and not exported through UI/persistence/server APIs.
- Public `BrainEvaluation` can still be materialized exactly from the runtime result.
- Runtime result carries enough data for trace activation materialization without full brain recomputation.
- Runtime result identity is tied to the frame/job identity needed for ordering checks.
- Existing public brain tests still pass through public materialization.

### 2. Apply Hidden State From Arrays

Update same-thread result application to apply current hidden arrays directly to the spawner's public hidden-state record.

Exit gates:

- Final `spawner.hiddenState` records match exactly.
- Disabled/missing unit hidden-state behavior remains unchanged.
- Previous/current recurrent semantics remain unchanged.
- No public DTO is required merely to update hidden state in the sync path.
- Strict digest catches any hidden-state drift.

### 3. Decode Actions From Runtime Outputs

Allow output decoding and action selection to consume runtime output arrays without materializing the full public DTO.

Exit gates:

- Decoded long/short/strength/horizon/cooldown/reproduction values are identical.
- Action selection and wait/long/short decisions are identical.
- Reproduction probability consumes the same output value before the same RNG call.
- No RNG order changes.
- High-reproduction strict digest parity passes.

### 4. Materialize DTOs Only At Boundaries

Keep public `BrainEvaluation` materialization for:

- public brain APIs
- worker protocol results
- RNN/selected-agent inspection
- trace fallback cases
- tests that explicitly assert public shape

Exit gates:

- UI and historical inspection still open and show the same RNN state.
- Worker protocol tests still receive the same public result shape.
- Persistence snapshots are unchanged.
- No UI/persistence code imports runtime-only result types.
- Materialization timing and allocation pressure drop in normal sync runs.

### 5. Benchmark Lazy Materialization

Measure sync runtime before/after.

Exit gates:

- `publicDtoMaterialization`, `resultApplication`, and `brainEvaluation` subphase timings drop where expected.
- Full tick time improves at 100, 250, and 500 population or weak gains are documented.
- High-action trace capture remains identical and no fallback recomputation increase appears.
- `npm run check` and `npm run test:sine` pass.
- A milestone report states which DTOs are still materialized and why.

## Milestone 8 Exit Gates

- Normal sync ticks no longer require full public brain DTOs for every evaluated agent.
- Public DTO materialization remains available and exact at boundaries.
- Hidden-state, action, trace, and inspection parity are preserved.
- No permanent duplicate result model leaks outside runtime modules.
- A milestone report records allocation/materialization impact.

## Milestone 9: Conditional Compact Food/Trade Runtime Prototype

Goal: revisit food/trade storage only if a narrow prototype proves lower overhead than the current `world.foods` scan.

Milestone 2 rejected a private food lifecycle index because per-resolved-food bookkeeping outweighed trimming savings. This milestone must not reintroduce that shape by default. It is conditional and prototype-first.

### 1. Re-Benchmark High-Action Food Costs After Brain Work

Measure whether food resolution/trimming is still a dominant bottleneck after Milestones 5-8.

Exit gates:

- High-action phase totals identify current `foodResolution`, `foodTrimming`, retained-food count, due-food count, and pending-food count.
- Results compare against Milestone 0, Milestone 2 rejected-index timing, and the latest immediate pre-Milestone-9 benchmark.
- If food/trade costs are no longer dominant, this milestone is deferred without implementation.
- No production code changes are made in this step.
- The report states whether a prototype is justified.

### 2. Prototype A Narrow Pending-Due Queue

If justified, prototype a pending-only due queue that avoids scanning retained resolved foods, while leaving `world.foods` as the compatibility surface.

Exit gates:

- Prototype preserves exact same-tick resolution order.
- Prototype preserves one-resolution-only semantics.
- Prototype preserves dead-creator policy and learning behavior.
- Prototype preserves retained resolved food visibility through `world.foods`.
- Prototype benchmark shows `foodResolution + foodTrimming` improves before production integration.

### 3. Integrate Only If The Prototype Wins

Promote the prototype only if it passes both parity and speed gates.

Exit gates:

- Pending unresolved foods are never trimmed.
- Resolved foods remain visible for the same configured retention window.
- Event order, food order, payoff, learning, energy, health, and liveness are identical.
- UI, persistence, telemetry, and headless recorder continue to use one compatibility boundary.
- No duplicate food lifecycle engine remains after integration.

### 4. Benchmark Or Revert

Run high-action and normal benchmarks, then either keep the compact food path or remove it.

Exit gates:

- High-action `foodResolution + foodTrimming` improves materially.
- Normal baseline does not regress materially.
- Strict digest parity passes after retention windows are crossed.
- `npm run check` and `npm run test:sine` pass.
- If speed gates fail, production remains on the current `world.foods` scan.

## Milestone 9 Exit Gates

- Food/trade storage changes are kept only if they beat the current path.
- Exact deterministic food/trade semantics are preserved.
- `world.foods` compatibility remains clean.
- No rejected index shape is reintroduced.
- A milestone report records keep/revert decision.

## Milestone 10: Mode-Specific Chunk Tuning

Goal: use M1 chunk-size findings to improve throughput/responsiveness tradeoffs without changing simulation results.

M1 showed API/headless-interactive mode benefits from smaller chunks for responsiveness, while pure headless can use larger chunks for modest throughput gains.

Milestone 0 already proved same-seed strict world parity across representative chunk sizes `10`, `25`, `100`, and `1000`. This milestone should therefore focus mainly on mode defaults, API responsiveness, progress cadence, and cancellation cadence while keeping that strict parity guard in place.

### 1. Define Execution Modes

Make chunk behavior explicit by mode.

Suggested modes:

- API/headless interactive: responsiveness-oriented
- pure CLI/headless: throughput-oriented
- benchmark: explicitly configured

Exit gates:

- Current server cap behavior is documented.
- Current CLI default behavior is documented.
- Each mode has a stated chunk-size policy.
- Defaults remain backward-compatible unless intentionally changed.
- Users can still override chunk size where the API allows it.

### 2. Apply Mode-Specific Defaults

Adjust defaults only where the change is justified by M1 evidence.

Exit gates:

- API mode keeps progress/cancel responsiveness in the `10-25` chunk range unless explicitly overridden.
- Pure headless can use larger chunks when responsiveness is not required.
- Benchmark scripts can still set exact chunk sizes.
- Sanitization remains centralized.
- No simulation code changes are required for chunk defaults.

### 3. Verify Cross-Chunk Parity And Responsiveness

Run parity and representative API responsiveness checks.

Exit gates:

- Same-seed strict digest continues to match across representative chunk sizes after any default/sanitization changes.
- Cancellation happens at documented chunk boundaries.
- Progress cadence matches the chosen mode.
- API latency does not regress in interactive mode.
- `npm run check` and `npm run test:sine` pass.

## Milestone 10 Exit Gates

- Chunk-size behavior is explicit by execution mode.
- Cross-chunk deterministic parity is proven.
- Interactive responsiveness does not regress.
- Pure headless throughput is modestly improved where larger chunks are used.
- A milestone report records before/after chunk behavior.

## Milestone 11: Whole-Run Headless Isolation

Goal: move active headless execution off the main server event loop to improve API responsiveness and run control.

This milestone is a responsiveness milestone, not a raw simulation-speed milestone.

### 1. Choose Worker Thread Or Child Process

Select the simplest isolation boundary that reuses the existing headless runner.

Exit gates:

- The selected approach reuses `src/sine/headless/runner.ts`.
- No second headless simulation engine is created.
- The isolated runner owns its repository and DB sink.
- IPC does not stream per-agent/per-trade rich records.
- IPC is limited to start, progress, cancel, timing, status, error, and final result messages.

### 2. Implement Isolated Job Execution

Move `startSineHeadlessJob()` execution into the isolated runner while preserving the existing API contract.

Exit gates:

- One-active-run behavior remains enforced.
- Cancel requests reach the isolated runner.
- Worker/process failure marks the run failed.
- Progress, checkpoint, timing, status, and completion data remain available.
- Existing headless routes preserve response shapes.

### 3. Verify Persistence And Failure Semantics

Confirm that DB writes and failure behavior still match current semantics.

Exit gates:

- The isolated runner writes through the same repository/sink contract.
- Interrupted runs are marked failed.
- Cancelled runs are marked cancelled.
- Completion, market-end, and extinction statuses remain correct.
- No production schema migration is introduced.

### 4. Benchmark Responsiveness

Rerun the M1 API responsiveness benchmark.

Exit gates:

- API p95 latency during active 250/500 population runs improves materially.
- Progress updates are no longer blocked by long main-thread simulation chunks.
- Wall-clock runtime is measured but not treated as the primary success metric.
- Same-seed strict digest matches non-isolated execution.
- `npm run check`, `npm run test:sine`, and `npm run build` pass if server integration changed.

## Milestone 11 Exit Gates

- Headless runs no longer materially block the main server event loop.
- API responsiveness improves during active runs.
- Simulation results remain exactly deterministic.
- Headless architecture remains one engine plus one isolated execution boundary.
- A milestone report separates responsiveness gain from raw speed gain.

## Milestone 12: Final Benchmark And Native/WASM Decision Gate

Goal: quantify the total speedup and decide whether any deeper native/WASM work is justified.

### 1. Run Full Post-Plan Benchmark Suite

Use the same benchmark shape as Milestone 0.

Exit gates:

- Results exist for 100, 250, and 500 population.
- Results exist for baseline, mostly-waiting, high-action, and high-reproduction.
- Report compares Milestone 0 to final and immediate pre-milestone to post-milestone timing where those records exist, including ticks/sec, average tick ms, phase totals, and top phases.
- Report separates raw simulation speedup from API responsiveness gains.
- Report calls out scenarios that did not improve.

### 2. Run Full Verification

Run standard checks after all implementation milestones.

Exit gates:

- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes if any UI/browser/server integration code changed.
- Strict deterministic parity passes for all optimized paths.
- No production DB schema migration was introduced by this plan.

### 3. Decide Whether Native/WASM Work Is Justified

Use the remaining top phases to choose the next plan, if needed. Native/WASM is only plausible if the remaining dominant cost is now a narrow compact numeric kernel with cheap inputs and outputs.

Candidate future directions:

- WASM/Rust/native prototype for the compact brain kernel
- Node worker-thread or child-process whole-run isolation if responsiveness remains unresolved
- Shared-buffer or native batch evaluation only if cross-boundary costs are measurable and bounded
- further JS kernel tuning if object materialization remains the bottleneck

Exit gates:

- Remaining top bottlenecks are documented.
- Actual speedup is quantified by scenario.
- Any future WASM/native recommendation is tied to a specific measured compact kernel.
- The expected boundary payload for native/WASM is small enough to plausibly beat JS.
- Exact parity risks from JS number semantics versus native/WASM arithmetic are documented.
- No broad rewrite is recommended without evidence.
- The next implementation target, if any, is concrete enough to plan without another broad audit.

## Milestone 12 Exit Gates

- The actual speedup is known.
- Exact deterministic parity is preserved.
- The plan's raw-speed and responsiveness gains are separated.
- The remaining bottleneck profile is clear.
- The next frontier is either deferred or converted into a focused plan.

## Expected Outcome

Realistic expected results:

- Normal runs: about `1.5x-2.5x` is plausible if the compact frame, learned-state view, compact kernel, and lazy DTO milestones all produce measured gains. Higher gains require evidence from benchmark reports, not assumptions.
- High-action runs: about `1.5x-3x` is plausible if trace slimming combines with compact kernel/DTO work and a later food/trade prototype passes the speed gate. Do not assume high-action `4x` unless Milestone 9 also wins.
- API/headless responsiveness: materially better after isolation, even if raw wall-clock runtime changes little.

The broad `4x` target is now plausible only if the compact-runtime milestones substantially reduce both brain/materialization costs and any remaining high-action food/trace costs. A broad `10x` speedup is not expected from this plan. That would likely require a separately justified native/WASM or full numeric-runtime plan after this plan proves the remaining kernel is compact enough to move.
