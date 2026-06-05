# Sine Follow-On Runtime Hot-Path Plan

This plan addresses the five remaining high-value runtime targets identified after `docs/plans/sine-exact-parity-runtime-speedup-plan.md` completed through Milestone 13.

Baseline evidence comes from:

- `docs/reports/sine-exact-parity-runtime-speedup-m13-report.md`
- `docs/reports/sine-exact-parity-runtime-speedup-m13-hotpath-final.json`
- relevant earlier milestone reports from the exact-parity plan, especially M4, M6, M8, and M9.

No separate Milestone 0 is needed. The M13 report is the baseline.

## Goal

Reduce Sine simulation runtime by removing remaining object allocation, repeated per-agent construction, repeated plan/effective-value lookup, high-action food-resolution overhead, and trace materialization cost while preserving exact deterministic parity.

Exact deterministic parity means same seed, same config, same market data, same tick count, and same final simulation state. No milestone may change:

- agent decisions
- market inputs
- reward/payoff
- transaction costs
- learning deltas
- hidden state
- learned state
- births
- deaths
- mutation order
- RNG usage
- food/trade resolution order
- event order
- trace values
- persisted runtime outputs, except timing/debug telemetry

## Scope

This plan targets:

1. Per-tick plan/runtime context and plan lookup tightening.
2. Per-tick market feature/input frame reuse.
3. Versioned learned-state and effective-value caching.
4. High-action food/trade resolution tightening.
5. Compact trace capture/materialization.

## Non-Goals

- Do not introduce a second simulation engine.
- Do not change agent brain semantics.
- Do not change market feature formulas or feature order.
- Do not change payoff, learning, mutation, reproduction, death, or lifecycle semantics.
- Do not introduce approximate rolling math.
- Do not add native/WASM code in this plan.
- Do not reintroduce the rejected heavy food lifecycle index from Milestone 2 of the previous plan.
- Do not revive browser-worker brain sharding as a speed target.
- Do not keep permanent old/new duplicate runtime paths after a milestone is accepted.

## Architecture Gates

These gates apply to every milestone.

- Keep one canonical Sine runtime engine.
- Keep `SpawnerWorld` and `SpawnerAgent` as the durable public runtime model unless a milestone explicitly creates a private view with one owner and one lifetime.
- Keep compact arrays and caches private to the runtime hot path.
- Do not expose private runtime caches to UI, persistence, or server repositories.
- Prefer one shared helper over duplicated formulas.
- Every cache must have an explicit invalidation rule.
- Every fast path must call the same canonical formula or prove identical output through tests.
- No optimization may depend on population size in a way that changes behavior.
- Run `npm run check` and `npm run test:sine` after shared runtime changes.
- Run `npm run build` if UI, worker protocol, or server integration is touched.
- Strict digest parity must pass for baseline, mostly-waiting, high-action, and high-reproduction worlds after each accepted milestone.

## Baseline

Use the M13 benchmark command as the default comparison:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10
```

M13 final top bottlenecks included:

- `spawnerContextInputConstruction`
- `learnedStateDecay`
- `planLookup`
- `marketInputResolve`
- `brainEvaluation`
- high-action `foodResolution`
- high-action `decisionTraceCapture`

Each milestone should compare against both the M13 baseline and the immediate pre-milestone benchmark. A milestone does not pass the performance gate on subphase improvement alone; if total runtime materially regresses in any key scenario, the change must be narrowed, rejected, or explicitly reclassified as architecture/parity hardening rather than accepted as a speedup.

## Milestone 1: Array-Backed Runtime Plan Context

Goal: reduce repeated per-tick plan lookup, `Map` allocation, and phase-to-phase context rebuilding by creating one plan/runtime context per tick.

This is the lowest-risk foundation milestone. It should not change brain evaluation, market input formulas, food resolution, learning, or trace capture.

Important lifecycle constraint: upkeep can kill spawners. The current pipeline builds plans before upkeep, prunes upkeep deaths, then evaluates only the post-prune living roster. This milestone must preserve that boundary exactly. A pre-upkeep plan context may be reused for upkeep, but the evaluation context must be built or filtered after upkeep death pruning.

### 1. Audit Existing Plan Lookup Sites

Identify every place in the tick loop that currently obtains or stores compiled plans.

Expected areas:

- `src/sine/spawner/world.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- brain evaluation helpers
- telemetry helpers that need plan/topology counts

Exit gates:

- All per-tick plan lookup and `Map<number, CompiledBrainPlan>` construction sites are listed.
- Each consumer is classified as index-order, id-lookup, or telemetry-only.
- The audit confirms whether newborns need plans during the same tick they are born.
- The audit confirms whether topology can change for an already-evaluated living spawner during the same tick.
- No runtime behavior changes are made in this step.

### 2. Introduce `SpawnerRuntimeContext`

Create a small runtime-only context that owns the per-tick arrays needed by multiple phases.

Use one of these shapes:

- a pre-upkeep plan context plus a post-upkeep evaluation context, or
- one context with an explicit post-prune filtering/refresh step before evaluation.

Candidate fields:

- `spawners`
- `plans`
- `spawnerIds`
- optional `spawnerIdToIndex` only if a consumer truly needs id lookup
- population scalar fields already reused across the tick

Exit gates:

- The context is constructed once per tick for the living roster used by evaluation.
- Plan arrays align by index with the spawner array.
- Id lookup is included only if at least one current consumer requires it.
- The context module has no React, server, persistence, or browser-worker dependencies.
- Tests or assertions cover array alignment for spawner id and plan signature.
- If the same context begins before upkeep, it is explicitly filtered or rebuilt after upkeep death pruning before evaluation.
- `ensureCompiledBrainPlan()` remains the canonical genome-level compiled-plan cache.

### 3. Route Tick Phases Through The Shared Context

Use the runtime context in upkeep, evaluation-frame construction, action decoding, and telemetry where those phases currently rebuild or re-fetch plan data.

Exit gates:

- The fresh per-tick plan `Map` in `stepSpawnerWorld()` is removed or reduced to the single shared context boundary.
- `buildSpawnerEvaluationFrame()` consumes the context instead of independently rebuilding plan arrays.
- Telemetry uses the same context where possible.
- Newborns created after evaluation are not accidentally included in the current tick's evaluation context.
- Dead/pruned spawners are not present in the evaluation context.
- A spawner that dies during upkeep can still use its plan for upkeep accounting, but cannot appear in the post-prune evaluation frame.

### 4. Verify Plan Context Parity And Cost

Run strict parity and hot-path benchmarks.

Exit gates:

- Strict digest parity passes for baseline, mostly-waiting, high-action, and high-reproduction.
- `npm run check` passes.
- `npm run test:sine` passes.
- The benchmark reports `planLookup` and context-construction timing before and after the milestone.
- If `planLookup` does not improve materially, the context is kept only if it simplifies code and does not regress total runtime.
- Tests cover the specific lifecycle case where a spawner dies during upkeep and is absent from the evaluation frame.

## Milestone 1 Exit Gates

- One per-tick runtime context owns plan arrays.
- No duplicate per-tick plan `Map` path remains in the tick loop.
- `ensureCompiledBrainPlan()` remains the only canonical compiled-plan cache.
- Simulation outputs are exactly unchanged.
- Public UI/persistence/headless contracts are unchanged.
- M13 benchmark comparison is documented in a new report.

## Milestone 2: Per-Tick Market Feature Frame

Goal: reduce repeated market feature and input construction without changing a single market-input formula, feature order, sample window, normalization rule, or perception trait behavior.

M4 already proved exact local-scale reuse is viable. This milestone extends that idea carefully, while avoiding approximate rolling math.

The current `createMarketFeatureContext()` already contains the per-tick feature cache, local-stat cache, signal-history cache, and numeric-history cache. This milestone should evolve that context into the market feature frame or rename/consolidate it. Do not add a second cache layer beside it.

### 1. Audit Current Market Feature Construction

Trace how spawner inputs are built from perception traits and market data.

Expected areas:

- `src/sine/spawner/marketInputs.ts`
- `src/sine/spawner/marketFeatureContext.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- perception trait defaults and mutation helpers

Exit gates:

- Every market-input feature is listed in exact output order.
- Each feature's required history source, window, lag, and sample step are documented.
- Mutable perception traits that affect cache keys are identified.
- Existing M4 deferred items are explicitly classified as safe to retry or still risky.
- No implementation changes are made in this step except tests if needed.

### 2. Add A Shared `MarketFeatureFrame`

Create or consolidate a per-tick frame that owns exact reusable market-history windows and scalar market context.

Candidate cache keys:

- source series, such as signal, price, volume, or ROC where applicable
- `windowTicks`
- `sampleStepTicks`
- lag or horizon when needed
- current tick

Exit gates:

- The frame is created once per tick.
- Shared sample-window construction is defined once.
- Existing `createMarketFeatureContext()` behavior is folded into the frame or the existing context becomes the frame.
- No nested market-feature cache layer remains after the milestone.
- The frame does not persist across ticks unless the cache key explicitly includes tick and exact invalidation.
- Cache misses still compute through the canonical feature formula.

### 3. Route Existing Feature Builders Through The Frame

Move local scale, trend/cycle shape, volume-derived inputs, RSI, rolling deltas, and volume-price agreement to consume frame-owned exact windows where safe.

Exit gates:

- Feature order and input count are unchanged.
- Existing golden market-input tests pass without value changes.
- No second implementation of local scale, RSI, rolling deltas, or volume agreement exists.
- Missing volume/short-history behavior remains unchanged.
- Pending-density behavior remains unchanged.

### 4. Add Golden And Digest Coverage For Diverse Perception Traits

Add or strengthen tests for evolved/diverse perception settings where cache reuse is hardest.

Exit gates:

- Tests cover different `localScaleWindowTicks`, `volumeScaleWindowTicks`, `volumeScaleSampleStepTicks`, `volumeDeltaLagTicks`, `volumeAccelerationLagTicks`, `rsiWindowTicks`, and `volumePriceAgreementLagTicks`.
- Identical inputs before and after the frame produce identical vectors.
- Short market history produces the same fallback values as before.
- Strict digest parity passes with evolved perception traits.
- The frame does not change uniqueness feature inputs or perception mutation outputs.

### 5. Benchmark Market Feature Cost

Run the M13 benchmark command and compare market-specific phases.

Exit gates:

- `marketInputResolve`, `marketFeatureBuild`, and `spawnerContextInputConstruction` are compared against M13 and immediate pre-milestone values.
- Cache hit/miss telemetry is sufficient to explain the result.
- No total-runtime regression appears in baseline, mostly-waiting, high-action, or high-reproduction.
- Any low-reuse feature remains on the canonical simple path rather than forcing extra bookkeeping.
- Results are documented in a milestone report.

## Milestone 2 Exit Gates

- Market feature construction has one shared per-tick frame.
- Market input vectors are exactly unchanged.
- No approximate rolling math is introduced.
- Feature formulas are not duplicated.
- Existing feature/context helpers are consolidated rather than wrapped by a redundant cache abstraction.
- Benchmark evidence shows whether the frame should be retained in full or narrowed.

M2 outcome note: M2 was accepted only as a narrowed architecture/parity milestone. The existing market feature context already contained the important per-tick caches, and attempted sanitized-key/vector fast paths were rejected because total runtime was mixed. Later milestones should not add broad market-input cache layers unless a new benchmark isolates a specific formula or allocation as the bottleneck.

## Milestone 3: Versioned Learned-State And Effective-Value Caches

Goal: reduce learned-state view construction, learned-state decay overhead, and effective brain value array construction by adding explicit invalidation discipline and private runtime caches where the benchmark proves they are worthwhile.

M1 and M6 of the previous plan already improved sparse decay and plan-aligned learned-state access. This milestone adds cache invalidation discipline so stable values are reused safely.

M2 lesson applied: this milestone should focus on the named learned/effective-value hot paths, not another broad context consolidation. If invalidation bookkeeping reduces a measured subphase but increases total runtime, narrow or reject the cache rather than keeping it as a speed optimization.

Important mutation constraint: current tests and tooling can mutate `spawner.learnedState` and `spawner.genome` directly. `ensureCompiledBrainPlan()` already protects against in-place topology mutation by recomputing structural signatures. Any new learned/effective cache must provide equivalent protection against stale values. Incrementing version fields are acceptable only for mutation paths the runtime owns; direct-mutation-safe content signatures are acceptable where ownership is not guaranteed.

### 1. Audit All Learned-State And Genome Mutation Sites

Identify every path that can change learned deltas, base genome values, topology, or plan signature.

Expected areas:

- `src/sine/spawner/plasticity.ts`
- `src/sine/spawner/learning.ts`
- `src/sine/spawner/reproduction.ts`
- mutation helpers
- brain plan/effective genome helpers
- trace cleanup paths

Exit gates:

- Every learned-state mutation path is listed.
- Every base weight, base bias, gate-bias, output-bias, unit, connection, enabled/disabled, and topology mutation path is listed.
- Reproduction inheritance and founder creation are accounted for.
- Decay and learning update counters are accounted for.
- Restored/headless/historical agent construction paths are accounted for.
- Direct test/tooling mutation paths are identified and either guarded by signatures or excluded from cache reuse.
- No cache is added before invalidation requirements are documented.

### 2. Add Explicit Runtime Version Or Signature Metadata

Add private or domain-local invalidation metadata that changes when learned state, base values, or topology changes.

Candidate invalidation keys:

- learned-state version
- genome base-value version
- topology/plan version, or reuse plan signature when sufficient
- exact learned-state content signature where direct mutation cannot be intercepted safely
- exact base-value content signature where direct mutation cannot be intercepted safely

Exit gates:

- Version/signature metadata is initialized for founders, births, restored agents, and test-created agents.
- Learned-state version/signature changes exactly when effective learned values change.
- Base-value version/signature changes exactly when inherited/mutated base values change.
- Topology version/signature changes when plan shape changes.
- Runtime invalidation metadata does not alter persistence contracts unless explicitly serialized for exact continuation.
- Deserialized agents without runtime metadata are initialized into a valid uncached or freshly versioned state.
- In-place direct mutations cannot silently reuse stale learned-state or effective-value caches.
- If exact signatures cost more than recomputing the cached value, the cache is rejected or narrowed rather than made dependent on fragile mutator discipline.

### 3. Cache Plan-Aligned Learned-State Views

Reuse plan-aligned learned-state views only when plan signature and learned-state invalidation metadata are unchanged.

Exit gates:

- `createPlanAlignedLearnedStateView()` remains the single converter from public maps to arrays.
- The cache is private to runtime/spawner state and cannot be mutated by callers.
- Cache invalidates on learning, decay that changes values, trace cleanup that changes learned state, reproduction restoration, and topology mismatch.
- Public learned-state maps remain canonical.
- Existing learned-state view tests pass.
- Restored/headless agents with equivalent public learned-state maps produce the same plan-aligned view as live-created agents.
- Direct mutation tests either invalidate the cache or recompute through a signature guard.
- If protecting direct mutation requires expensive signatures, the report separates signature cost from view-construction savings.

### 4. Cache Effective Brain Value Arrays

Reuse effective connection, gate, and output values only when plan signature, base-value invalidation metadata, and learned-state invalidation metadata are unchanged.

Exit gates:

- Effective arrays are reused only under an exact cache key.
- Cache invalidates on base genome mutation, learned-state mutation, topology change, and reproduction inheritance.
- Inspection and uniqueness code can still use public object/map paths where appropriate.
- No stale effective value can survive a learning update.
- Brain-only cached/fresh parity tests pass.
- No stale effective value can survive direct base-weight, output-bias, gate-bias, or enabled/disabled mutation in tests/tooling.
- Effective-array caching is rejected if the exact invalidation key costs as much as rebuilding the arrays in the common runtime path.

### 5. Evaluate Exact Decay Micro-Optimizations

Try only decay optimizations that preserve per-tick multiplication semantics.

Allowed candidates:

- active-delta metadata to avoid scanning empty maps
- exact in-place scaling of private delta maps when ownership is clear
- avoiding object replacement when no value changes

Disallowed in this milestone:

- lazy timestamp/exponent decay
- approximate decay batching
- changing deletion/clamping thresholds

Exit gates:

- Decay produces identical learned-state maps after every tested tick.
- Reproduction inheritance sees identical effective genomes.
- Strict digest parity passes with active learned deltas.
- If in-place scaling is not ownership-safe, it is rejected rather than patched around.
- If decay micro-optimizations require changing public learned-state ownership semantics, they are rejected.
- Benchmark reports learned decay, learned view, and effective-value construction separately.

## Milestone 3 Exit Gates

- Accepted learned-state and effective-value caches have explicit invalidation.
- Public learned-state maps remain the source of truth.
- Effective brain outputs are exactly unchanged.
- Strict digest parity passes across all benchmark scenarios.
- Benchmark evidence shows whether cache reuse outweighs invalidation/signature overhead.
- Restored/headless/historical agents cannot observe stale runtime cache state.
- If caches are rejected, the report documents the exact reason and no partial duplicate cache path remains.

## Milestone 4: High-Action Food Resolution Tightening

Goal: reduce high-action food/trade resolution cost without changing food order, payoff, creator policy, event order, learning, death, or `world.foods` compatibility.

M2 of the previous plan rejected a broad lifecycle index. M9 kept a narrower pending-only due queue. This milestone only tightens the accepted M9 architecture.

Important compatibility constraint: tests and tooling can append or replace `world.foods` directly. The due queue must continue to rebuild or scan from the public `world.foods` compatibility array when that happens.

### 1. Audit Current Due-Food Queue And Resolution Order

Trace the current food lifecycle from emit to resolve to trimming.

Expected areas:

- `src/sine/spawner/foodDueQueue.ts`
- `src/sine/spawner/reward.ts`
- world event creation
- food trimming helpers
- tests for same-tick food order

Exit gates:

- Current pending-food queue behavior is documented.
- Manual direct-test append/rebuild behavior is accounted for.
- Same-tick due order is characterized.
- Dead-creator resolution policy is accounted for.
- No food-resolution changes are made in this step.

### 2. Add Earliest-Due-Tick Fast Path

Avoid scanning due buckets when no pending food can resolve on the current tick.

Exit gates:

- The queue tracks an exact earliest pending resolve tick.
- Empty/non-due ticks return without scanning all buckets.
- Queue rebuild from direct `world.foods` mutation recomputes earliest due tick.
- Food due at or before the current tick is still resolved in original world order.
- Tests cover no-due, one-due, many-due, and catch-up due ticks.
- Direct append, array replacement, and trimming paths keep earliest due tick correct.

### 3. Tighten Due Batch Ordering Without Broad Indexing

Keep due-food ordering exact while reducing unnecessary sort or scan work.

Exit gates:

- Due foods remain ordered exactly as before for same-tick and multi-tick catch-up resolution.
- Ordering logic is centralized in the due queue, not duplicated in `resolveFoods()`.
- No per-creator pending-count index or resolved-food retention bucket is introduced.
- Manual test paths still work.
- Strict food-order tests pass.
- Rebuilt queues preserve public `world.foods` order even when food ids are not sorted.

### 4. Replace Hot Rolling Payoff `shift()` Windows If Worthwhile

Evaluate a small reusable fixed-window helper for recent world and spawner payoffs.

Exit gates:

- Public recent-payoff arrays/materialized values remain identical.
- Window insertion and trimming semantics match current `push`/`shift()` behavior.
- The helper is shared by world and spawner payoff windows if retained.
- The helper is not used if benchmark cost is below noise.
- Tests cover window overflow and exact ordering.

### 5. Benchmark High-Action Resolution

Run the M13 benchmark command with emphasis on high-action rows.

Exit gates:

- `foodResolution`, `foodTrimming`, due-food count, pending-food count, retained-food count, and event count are reported.
- High-action 100, 250, and 500 population rows are compared against M13 and immediate pre-milestone values.
- Baseline and mostly-waiting do not regress materially.
- Same-tick food, dead-creator, payoff, learning, event order, and strict digest tests pass.
- Results are documented in a milestone report.

## Milestone 4 Exit Gates

- The accepted M9 due-queue architecture remains simple and narrow.
- No duplicate food lifecycle engine exists.
- `world.foods` remains the compatibility boundary.
- Manual `world.foods` mutation compatibility is preserved.
- No broad compatibility-signature layer is introduced around `world.foods`; direct mutation support must stay narrow and explicit.
- High-action food-resolution cost improves or the change is narrowed/rejected.
- Functional parity is exact.

## Milestone 5: Compact Trace Capture And Materialization

Goal: reduce high-action trace capture/materialization cost while preserving learning and inspection behavior.

M3 was rejected as a retained learned/effective cache optimization because exact direct-mutation-safe signatures were too expensive. This milestone should not copy that cache/signature model. Instead, it should use lifetime-scoped compact trace data created once from the already-owned runtime evaluation result, then materialized only at public boundaries.

M8 already removed trace recomputation and made public DTO materialization lazier. This milestone reduces remaining object/map materialization in non-wait decision traces.

Important architecture constraint: compact traces must not create a second learning implementation. Learning should read trace activation data through one shared accessor that works for the current public trace shape and any compact internal trace shape.

### 1. Audit Trace Producers And Consumers

Identify every place that creates, stores, reads, persists, or inspects decision traces.

Expected areas:

- `src/sine/spawner/world.ts`
- `src/sine/spawner/learning.ts`
- `src/sine/spawner/reward.ts`
- trace store helpers
- inspection helpers
- persistence/headless recorder boundaries

Exit gates:

- All trace fields required by learning are listed.
- All trace fields required by inspection/persistence are listed.
- Current no-fallback recomputation behavior is documented.
- Any legacy public trace shape requirement is identified.
- Strict digest and snapshot materialization requirements for traces are identified.
- No trace representation change is made in this step.

### 2. Add A Shared Trace Activation Accessor

Introduce one helper for reading activation data from a trace by innovation id.

Exit gates:

- Current public trace records are read through the shared accessor.
- Learning no longer reaches directly into `trace.connectionActivations[String(innovationId)]`.
- The helper preserves missing-activation behavior exactly.
- Existing learning tests pass before compact traces are introduced.
- No compact trace type is added until the accessor is the only learning read path.

### 3. Add A Compact Internal Trace Representation

Introduce a private runtime trace shape that stores active connection ids and activation values as aligned arrays, plus action/output fields needed for learning.

Exit gates:

- Compact traces preserve trace id, tick, action, strength, outputs, active connection ids, and activation values exactly.
- Array order is deterministic and tied to the compiled plan/runtime result.
- The compact trace type is internal to runtime/learning.
- Compact trace validity is based on ownership/lifetime, not per-tick content signatures.
- The legacy public trace shape can still be materialized at inspection/persistence boundaries.
- Tests prove compact-to-public materialization matches the old trace shape.
- Strict digest comparison materializes compact traces into the canonical public trace shape before comparing.

### 4. Route Learning Through The Shared Accessor

Update learning code to consume trace activations through the shared accessor for both compact and legacy traces.

Exit gates:

- Learning formulas are unchanged.
- The helper supports compact traces and legacy traces if legacy traces remain at public boundaries.
- No duplicated learning loop exists for compact and legacy traces.
- Output-bias, gate-bias, and connection-weight updates are unchanged.
- Learning tests pass for long and short traces.

### 5. Avoid Unnecessary Public Trace Materialization In The Tick Loop

Keep compact traces compact until a public boundary explicitly needs the old object shape.

Exit gates:

- The tick loop does not build a full activation record for traces that only learning will consume.
- Inspection and persistence still receive the same public data when requested.
- `fallbackTraceEvaluations` remains zero.
- Trace ids and trace deletion/retention behavior are unchanged.
- High-action trace count is unchanged.
- No per-agent/per-tick full content signature is added for compact traces.

### 6. Benchmark Trace Cost And Parity

Run strict parity tests and hot-path benchmarks.

Exit gates:

- `decisionTraceCapture`, optimized trace materialization count, fallback trace count, and high-action total runtime are compared against M13.
- Strict digest parity includes trace ids, active connection ids, activation values, learned state, and event order.
- `npm run check` passes.
- `npm run test:sine` passes.
- Results are documented in a milestone report.

## Milestone 5 Exit Gates

- Trace capture remains no-fallback.
- Learning consumes identical activation values.
- Public inspection/persistence trace output remains compatible.
- High-action trace materialization cost improves or the compact path is narrowed/rejected.
- No duplicate learning implementation remains.

## Final Verification

After all accepted milestones:

- Run `npm run check`.
- Run `npm run test:sine`.
- Run `npm run build`.
- Run the M13 hot-path benchmark command.
- Compare final results against M13 and each immediate pre-milestone report.
- Confirm strict digest parity for baseline, mostly-waiting, high-action, high-reproduction, and chunked headless paths.
- Confirm no public UI, persistence, headless, or inspection contract changed except documented timing/debug telemetry.
- Confirm no rejected prototype code remains.
- For each milestone, classify the accepted result as speedup, architecture/parity hardening, or rejected/narrowed, and make sure the final comparison does not treat architecture-only milestones as runtime speedups.
- Explicitly classify M3 as rejected/narrowed unless a later accepted change reopens learned/effective caching with new evidence.

## Final Exit Gates

- The codebase has one canonical Sine runtime path.
- Accepted runtime caches and compact views are private, versioned or lifetime-scoped, and cannot drift from canonical state.
- Rejected cache prototypes, including the M3 learned/effective cache path, are absent from the final codebase.
- Market input formulas and feature vectors are exactly unchanged.
- Brain outputs and learned-state updates are exactly unchanged.
- Food/trade resolution and event order are exactly unchanged.
- Public trace output remains compatible.
- Measured speedup or simplification is documented for each accepted milestone.
