# Sine Simplification And Runtime Performance Plan

This plan simplifies the Sine module while preserving functional parity. The target is not to shrink files for its own sake. The target is to remove duplicated work, move repeated calculations into shared context objects, keep responsibilities crisp, and reduce runtime load without changing simulation semantics.

The plan is split into seven milestones, numbered from Milestone 0 through Milestone 6. Earlier milestones extend parity harnesses and complete low-risk consolidation. Later milestones touch hotter paths such as market-input construction, packet/persistence weight, uniqueness scoring, headless writes, brain evaluation, and browser-worker parallelism.

## Non-Goals

- Do not change reward, payoff, transaction-cost, reproduction, death, mutation, learning, or market-input semantics.
- Do not change saved-run schemas except where a headless write-path optimization can be implemented behind the existing repository contract.
- Do not rename the Sine module in this plan.
- Do not refactor Ant World.
- Do not create a generic simulation framework shared by Ant and Sine.
- Do not duplicate old and new implementations behind permanent compatibility wrappers.
- Do not optimize by dropping data that is currently required by live UI, historical inspection, headless analysis, learning, or persistence.
- Do not treat benchmark improvement as sufficient if deterministic simulation parity fails.

## Architecture Gates

These gates apply to every milestone.

- Functional parity must be tested before and after any step that touches simulation math, agent selection, brain evaluation, uniqueness vectors, persistence packets, or headless writes.
- Shared context objects should be explicit and domain-shaped. Prefer names such as `MarketFeatureContext`, `PacketRuntimeContext`, `FunctionalGenomeSummary`, and `HeadlessSourcePoint` over generic utility buckets.
- Hot-path helpers should be pure or locally scoped where possible. They should not import React, server repositories, or persistence clients.
- Existing module boundaries should remain clear: spawner runtime logic in `src/sine/spawner`, packet assembly in `src/sine/packets` and worker services, headless orchestration in `src/sine/headless`, server persistence in `server/`, and canvas drawing in `src/sine/charts`.
- Caches must have an explicit lifetime: per tick, per packet build, per headless chunk, per genome signature, or per run. Avoid unbounded process-lifetime caches.
- Optimizations must keep deterministic order stable where the existing behavior depends on order, including roster ordering, event ordering, DB row ordering, and brain-output application.
- Any compact representation must have a single materialization path back to the existing DTO shape when that DTO is still the public contract.
- Verification should include `npm run check`, `npm run test:sine`, and targeted perf comparisons. UI/chart refactors should also use Playwright screenshots or browser smoke checks.

## Milestone 0: Baselines And Parity Fixtures

Goal: create the measurement and parity harnesses needed to simplify safely. This milestone should not change production behavior.

### 1. Capture Runtime Baselines

Record current runtime performance at representative populations and current headless timing behavior.

Suggested baselines:
- Live simulation perf at 100, 250, and 500 population.
- Headless run chunk timing with the existing timing counters: advance, recorder, sink writes, core estimate, top sink method.
- Packet-size samples for chart, roster, stats, persistence, architecture, inspection, and uniqueness packets.

Exit gates:
- A baseline file or documented benchmark note records command, seed, settings, population, tick count, and measured timings.
- Baselines include both browser/live-worker behavior and Node headless behavior where practical.
- Timing output separates simulation core, recorder work, and DB writes.
- No production code changes are required for this step beyond optional test-only or script-only instrumentation.

### 2. Extend Deterministic Parity Fixtures

Extend the existing Sine fixture coverage instead of creating a parallel harness. Current relevant tests include `scripts/sine-tests/parityFixtures.test.ts`, `scripts/sine-tests/brainEvaluation.test.ts`, `scripts/sine-tests/marketInputs.test.ts`, and `scripts/sine-tests/headless.test.ts`.

Add focused before/after comparisons for the areas this plan will touch.

Required fixtures:
- Market-input vector equality for fixed timeline ticks and fixed perception profiles.
- Brain forward-pass equality for fixed genomes, learned state, hidden state, inputs, and compiled plans.
- Uniqueness vector equality for representative simple, recurrent, learned, and mutated genomes.
- Headless recorder output equality for a small deterministic run.
- Packet shape equality for chart, roster, stats, and persistence packets.

Exit gates:
- New fixture coverage lives inside the existing `scripts/sine-tests/` suite and is run by `npm run test:sine`.
- Fixtures cover generated-market and candle-backed timeline samples where the current test harness supports both.
- Brain fixture compares outputs, previous/current hidden state, active connection IDs, and activation maps when activations are requested.
- Uniqueness fixture checks version, feature keys, feature order, and numeric values.
- Packet fixture checks shape, packet cadence assumptions, and representative scalar values without relying on volatile timestamps.
- Headless fixture checks row counts and representative parsed rows, not only aggregate analysis summaries.
- `npm run test:sine` still passes before any refactor work begins.

### 3. Define Perf Acceptance Reporting

Create a lightweight reporting convention for the later milestones.

Exit gates:
- Each milestone can report before/after timing for at least one relevant benchmark.
- Regression tolerance is explicit: parity-sensitive changes may be accepted with no speedup, but not with unexplained slowdown.
- Perf notes distinguish live tick runtime from headless DB-write throughput.
- The report format is small enough to keep updated without turning into a separate benchmark framework.

Milestone exit gates:
- Production behavior is unchanged.
- Deterministic fixtures exist for all high-risk refactor targets.
- Baseline timings exist for live runtime and headless mode.
- Later milestones can prove both functional parity and measured impact.

## Milestone 1: Low-Risk Consolidation

Goal: remove obvious duplication and repeated passes without changing architecture or simulation decisions.

### 1. Convert Telemetry To A One-Pass Reducer

Refactor `src/sine/spawner/telemetry.ts` so `recentResolvedPayoffs` is scanned once for rolling loss, hit count, loss count, payoff sum, and recent trade count.

Exit gates:
- `rollingLoss`, `rollingHitRate`, `rollingAveragePayoff`, `lossRate`, and `resolvedVolume` match the current implementation for existing tests.
- The population-adjusted rolling average payoff added recently is preserved exactly.
- The function performs one pass over `recentResolvedPayoffs` instead of separate `map`, `filter`, and `reduce` passes.
- Existing telemetry tests and `npm run test:sine` pass.

### 2. Consolidate Headless Source-Point Helpers

Move duplicated helpers from `src/sine/headless/runner.ts` and `src/sine/headless/recorder.ts` into a focused headless helper module.

Suggested helpers:
- `sourcePointForTick`
- `datetimeFromTimestamp`
- `nullableNumber`
- finite-number sanitization for headless records

Exit gates:
- `runner.ts` and `recorder.ts` use the shared helper instead of local duplicate implementations.
- The shared helper has no dependency on repositories, React, workers, or UI code.
- Headless checkpoint records and agent/trade/snapshot records remain byte-for-byte equivalent except for volatile timestamps.
- `npm run check` and headless recorder tests pass.

### 3. Add Shared Chart Drawing Primitives

Consolidate repeated canvas helpers from `src/sine/charts/tradingPerformanceChart.ts` and `src/sine/charts/selectedSpawnerTimelineChart.ts`.

Candidate primitives:
- zero-centered normalization
- zero-line drawing
- split-panel bounds calculation
- compact bar-strip drawing where semantics match

Exit gates:
- Trading Performance chart and selected-agent timeline chart render the same data with the same visible semantics.
- Shared helpers are chart-specific and do not become a broad UI utility module.
- Playwright or browser smoke screenshots show no clipped labels, overlapping panels, blank charts, missing zero lines, or changed panel proportions.
- Existing chart callers do not need new data shapes.

### 4. Keep Roster And Inspector Summary Helpers Centralized

Review compact summary helpers for perception, mutation profile, payoff profile, plasticity, and trading policy. The codebase already has focused model helpers in `perception.ts`, `mutationProfile.ts`, `payoffProfile.ts`, `plasticity.ts`, and `tradingPolicy.ts`; this step should reuse or tighten those helpers rather than inventing another summary layer.

Exit gates:
- UI components do not recompute model-specific summaries that are already available from focused domain helpers.
- Roster packets remain compact and do not start carrying full genomes.
- Inspector details still use normalized genome data.
- Existing helper modules remain the ownership boundary for their own model summaries.
- No new generic "format everything" helper is introduced.

Milestone exit gates:
- Low-risk consolidation is complete without changing simulation behavior.
- Tests pass: `npm run check` and `npm run test:sine`.
- Browser smoke or Playwright validation covers the chart helper change.
- Code searches show duplicated helper names were removed or intentionally retained with a reason.

## Milestone 2: Per-Tick And Per-Packet Runtime Context

Goal: reduce repeated sampling, indexing, and packet assembly work by building scoped context objects once and reusing them within the same tick or packet post. This milestone also adds a measured packet/persistence weight audit because Milestone 0 showed persistence packets are large enough to be an architectural concern.

### 1. Introduce `MarketFeatureContext`

Create a per-tick market context in `src/sine/spawner` that owns timeline sample resolution and reusable sampled histories for market-input calculation.

It should integrate the current responsibilities of:
- `createTimelineSampleResolver`
- `computeLocalSignalStats`
- `collectSignalHistory`
- `collectNumericHistory`
- `buildVolumeRsiInputs`
- repeated lag sampling in `buildMarketInputs`

Exit gates:
- `buildMarketInputs` continues to return the same input vector for every tested perception profile and tick.
- The context lifetime is per tick or per resolver, not process-wide.
- Market-derived feature caches are keyed by timeline, tick, and perception-derived sampling parameters.
- Pending-food density remains outside reusable market-feature caching because it is environment state, not a market feature.
- Changing `pendingFoodCount` with the same timeline, tick, and perception changes only the pending-density input.
- The context reduces repeated timeline sampling for agents that share perception settings and avoids extra array allocation where possible.
- Generated and candle-backed timeline behavior remain identical to current fixtures.

### 2. Preserve `createMarketInputResolver` As The Runtime Entry

Keep the existing resolver-style runtime API, but make it delegate to `MarketFeatureContext`.

Exit gates:
- World code can keep asking the resolver for inputs by perception without learning a new API.
- Existing perception-cache behavior is preserved: same perception key in the same tick reuses the same input vector.
- Different pending-food counts cannot accidentally reuse a stale full input vector.
- `getComputeCount()` and `getCacheSize()` still report meaningful per-tick values.
- No caller outside the spawner runtime needs to understand internal market-feature caching.

### 3. Add `PacketRuntimeContext`

Build a packet-level context in the worker packet path so chart, roster, stats, persistence, uniqueness, and selected-agent timeline builders can share indexes and selected-agent facts during one posting pass.

Candidate values:
- render tick
- selected spawner
- food index or pending-food counts
- uniqueness scores and last uniqueness tick
- selected-agent timeline sample
- packet-level population/food counts

Exit gates:
- `createWorkerPacketPoster` builds shared context once per forced or scheduled posting pass where practical.
- Chart, roster, stats, and persistence packets keep the same public DTO shapes.
- Uniqueness inspection and selected-agent timeline services are not duplicated.
- Context construction does not force expensive packet work for packets that are not scheduled to post.
- `packetScheduler.shouldPost()` call order and packet cadence remain unchanged for chart, roster, stats, and persistence packets.
- Forced posts still include the same packet set as before.

### 4. Audit Persistence Packet Weight And Contract

Measure why the live persistence packet is large before changing the persistence contract. Milestone 0 measured an initial 250-pop persistence packet at about `9362.9 KB`, but that includes initial births, genome snapshots, state snapshots, food events, event rows, and uniqueness snapshots. Initial-packet weight and steady-state packet weight should be understood separately.

This step is an audit and design step, not a schema rewrite. The current live persistence contract stores full `SpawnerAgent` payloads for births, deaths, and genome snapshots, compact state snapshots for runtime state, full food payloads for food events, and full uniqueness detail snapshots. Those payloads are used by server persistence and historical inspection, so packet thinning must be proven safe before implementation.

Exit gates:
- Packet-size reporting breaks down byte contribution by row family: births, deaths, genome snapshots, state snapshots, food events, event rows, and uniqueness snapshots.
- Initial persistence packet size and steady-state persistence packet size are measured separately.
- The audit identifies which full snapshot fields are required by historical inspection, seed-bank reconstruction, compatibility, or server analysis.
- The audit identifies duplicated fields that are candidates for removal or scalarization without changing saved-run semantics.
- No persistence DTO, DB schema, or server write behavior is changed in this step.
- Any proposed packet-thinning follow-up has explicit compatibility gates for old saved runs and new saved runs.

### 5. Replace Repeated Roster Sorting With Bounded Selection

Refactor `src/sine/packets/rosterSelection.ts` so it avoids repeated full-population sorts when only a fixed roster limit is needed.

Exit gates:
- Roster membership and ordering match current behavior for deterministic fixtures, including selected spawner inclusion.
- Founder, generation, recent-active, newest, and fallback bucket membership match current behavior for representative populations.
- Final returned order remains ascending by `spawner.id`.
- The selection helper handles small populations, empty populations, dead selected agents, and ties deterministically.
- The selected spawner is included when present even if it appears in multiple buckets.
- The implementation uses one clear bounded-selection strategy rather than several ad hoc sort branches.
- Roster packets remain capped at `ROSTER_AGENT_LIMIT`.

Milestone exit gates:
- Market input fixtures pass with exact numeric parity.
- Packet shape fixtures pass.
- Persistence packet weight audit is complete, with initial and steady-state packet sizes separated.
- No live persistence contract changes are made without a follow-up plan and compatibility gates.
- Roster selection fixtures pass.
- Live perf at 100, 250, and 500 population is compared against Milestone 0 baselines.
- No per-tick or per-packet context escapes into long-lived global state.

## Milestone 3: One-Pass Uniqueness Construction

Goal: make uniqueness vector construction cheaper while preserving exact vector and score semantics. Milestone 0 measured uniqueness at about `41 ms`, `93 ms`, and `187 ms` for 100, 250, and 500 population, so this is high-value enough to move ahead of headless DB batching.

This milestone does not change what uniqueness means. It only changes how the existing functional vector is assembled.

### 1. Build A One-Pass `FunctionalGenomeSummary`

Refactor `src/sine/spawner/uniquenessVector.ts` so it computes unit groups, connection groups, gate counts, output counts, input accumulators, output accumulators, weight summaries, reachability inputs, and disabled counts in one summary pass.

Exit gates:
- `FUNCTIONAL_GENOME_VECTOR_VERSION` is changed only if feature semantics or ordering intentionally change.
- Feature keys, labels, ordering, count, and numeric values match existing fixtures when semantics are unchanged.
- Existing Milestone 0 golden vector anchors still pass.
- Repeated `filter` scans over the same connection and unit arrays are replaced by summary accumulators.
- The summary helper uses `GenomeIndex` and existing uniqueness model helpers rather than duplicating topology rules.

### 2. Preserve Full Uniqueness Score Parity

Because uniqueness packets and historical uniqueness rows store more than raw vectors, verify the complete score output, not only the vector rows.

Exit gates:
- `computeSpawnerUniqueness()` returns the same `score`, `rawDistance`, `activeFeatureCount`, `droppedFeatureCount`, and nearest-neighbor IDs for deterministic fixtures.
- Most-similar and most-dissimilar feature explanations remain the same for detail fixtures.
- Roster uniqueness summaries and uniqueness detail packets keep the same DTO shape.
- Persistence uniqueness snapshots keep the same row semantics.

### 3. Keep Cluster-Aware Future Work Separate

Uniqueness clustering is an analysis change, not a parity-preserving runtime simplification. Keep this milestone focused on making the existing vector cheaper.

Exit gates:
- This milestone does not change how uniqueness distance or candidate interpretation is calculated.
- TODO items about cluster-aware uniqueness remain future analysis work.
- Runtime uniqueness packets remain compatible.
- Any measured uniqueness speedup comes from cheaper vector construction, not from dropping dimensions.

Milestone exit gates:
- Uniqueness vector parity passes for representative genomes.
- Full uniqueness score parity passes for representative populations.
- Uniqueness compute timing at 100, 250, and 500 population is compared against Milestone 0 baselines.
- No second uniqueness engine or duplicate feature-definition path exists after the refactor.

## Milestone 4: Headless Write Throughput And Repository Shape

Goal: make headless runs faster and easier to reason about without creating a second simulation engine or changing saved data semantics. Milestones 2 and 3 confirmed that packet and uniqueness work can reduce side costs, but core simulation still dominates total tick time. This milestone is therefore about headless persistence/write throughput and SQLite overhead, not about fixing core simulation speed.

### 1. Reconfirm Current Headless Timing Split

Before changing the write path, run a current headless timing sample and record where time is actually going.

Required timing fields:
- chunk time
- advance time
- recorder event time
- sink/DB write time
- core estimate
- top sink method
- write counts by method where available

Exit gates:
- The timing sample records seed, settings, population, target ticks, chunk size, checkpoint interval, and market source.
- The report states the percentage of chunk time spent in simulation core, recorder work, and sink/DB writes.
- `writeTrade`, `writeSnapshot`, `writeMetrics`, and checkpoint write costs are visible separately where current counters support it.
- If sink/DB write time is small relative to core simulation, the milestone explicitly treats batching as a headless persistence cleanup rather than a major runtime speed fix.
- No code changes are made in this step except optional report-only instrumentation if the current counters are insufficient.

### 2. Add A Chunk-Buffered Headless Sink

Wrap the existing `HeadlessRecordSink` in a buffered sink that accumulates writes during a headless chunk and flushes them in deterministic order.

Recommended flush order:
- run start and checkpoint/control records
- agent records and eligibility/death updates
- lifecycle events
- trades
- snapshots
- metrics
- run completion

Exit gates:
- Existing recorder code can keep calling `sink.writeTrade`, `sink.writeSnapshot`, `sink.writeMetrics`, and related methods.
- Buffered flushing preserves current row contents and deterministic ordering within each record category.
- Buffered flushing preserves checkpoint semantics: checkpoint rows must not claim writes that have not been flushed unless the checkpoint explicitly reports buffered counts and that distinction is visible in progress/timing data.
- Cancellation, failure, population-extinction, and market-end paths flush required records before closing the run.
- Failure handling either rolls back the active chunk transaction or writes a clearly failed run status without partial ambiguous chunk state.
- Injected failure tests cover mid-flush failure, cancellation before a flush, and finalization failure.
- Timing counters separately report recorder event time, buffer enqueue time, flush count, buffered row count, and DB flush time.
- The buffered sink has a chunk/run lifetime and does not retain records after flush, cancellation, failure, or run completion.

### 3. Batch DB Writes Behind The Repository Contract

Update `server/sineHeadlessRepository.mjs` or a repository-adjacent sink implementation so buffered records are written in fewer transactions while preserving existing table shapes and query behavior.

Exit gates:
- The public headless repository API remains compatible with current server routes.
- No duplicate live/headless simulation code is introduced.
- New batch write methods and old single-record write methods share statement preparation and row serialization.
- No duplicate event rows, trade rows, snapshot rows, or metrics rows are inserted.
- A small deterministic headless run produces the same row counts, representative rows, and analysis results before and after batching.
- Batch transactions commit atomically and rollback cleanly on an injected write failure.
- Old completed headless runs still load through the run browser and analysis endpoints.
- New completed headless runs preserve trade ledgers, lifecycle events, snapshots, metrics, and checkpoint semantics exactly.
- The implementation does not introduce parallel live/headless persistence DTOs; compact or buffered records materialize through one repository-owned row serialization path.

### 4. Split The Headless Repository By Responsibility

After batching is stable, split the large headless repository file into focused modules only if batching makes the repository harder to reason about or leaves unrelated responsibilities tightly interleaved. This step is conditional; do not split merely to satisfy the plan if the batch sink can stay clear inside the existing facade.

Suggested split:
- schema and migrations
- write sink and batch sink
- analysis queries
- row parsers
- JSON/bounds helpers

Exit gates:
- Server routes still import one repository facade.
- Statement definitions are not duplicated across write and query modules.
- Row parsers are shared by list/detail methods instead of copied.
- Existing headless run browser and analysis endpoints return the same shapes.
- The split reduces cognitive load without introducing circular imports.
- If the split is skipped, the milestone report states why the existing repository shape remains clearer and identifies any future split trigger.
- If the split is performed, searches show no duplicate statement text or duplicate JSON parsing helpers across the new modules.

### 5. Preserve Headless Timing Diagnostics

Keep the timing counters useful after buffering and batching.

Exit gates:
- Progress UI still shows chunk time, advance time, recorder time, DB/write time, core estimate, and top write method.
- Sink timing distinguishes recorder call count, enqueue count, buffered row count, flush count, and DB write time where batching changes call semantics.
- Completed runs persist checkpoints and timing data as before.
- A slow DB sink remains visible instead of being hidden inside the batch wrapper.
- Milestone reporting compares preflight timing to post-batching timing and states whether speedup came from fewer SQLite calls, less recorder overhead, or neither.
- The report includes total runtime and DB/write percentage, not only absolute DB/write milliseconds.

Milestone exit gates:
- Headless deterministic output fixtures pass.
- Headless analysis UI can load completed runs created before and after the refactor.
- Timing shows whether speedup came from DB writes, recorder work, or simulation core.
- Milestone reporting states clearly whether speedup came from reduced SQLite overhead or from core simulation changes, and does not claim core runtime improvement unless pure advance timing also improves.
- No headless behavior changes require updating the live UI mode.
- No second headless simulation engine, repository contract, or recorder event model is introduced.

## Milestone 5: Brain Effective-Value Hot Path

Goal: reduce synchronous brain-evaluation overhead while protecting exact brain-output parity. Milestones 2 and 3 did not materially change pure advance timing, and Milestone 3 still measured RNN cached-plan evaluation as a meaningful hot path. Browser 4-worker parallelism was slower than browser sync at 100, 250, and 500 population, so this milestone should optimize per-agent computation, effective-value materialization, and allocation behavior before making further claims about multithreading.

### 1. Capture Immediate Brain Hot-Path Baseline

Before changing brain/effective-value code, capture the current post-Milestone-4 baseline for the exact code being modified.

Required command:

```bash
npx tsx scripts/sinePerf.ts
```

Exit gates:
- Cached-plan RNN evaluation timing is recorded at 100, 250, and 500 population.
- Fresh-plan RNN evaluation timing is recorded at 100, 250, and 500 population.
- Pure advance timing is recorded at 100, 250, and 500 population.
- Async sync-runner timing is recorded at 100, 250, and 500 population.
- Parallel-pool timing records whether it is a real browser-worker path or Node fallback via `browserWorkerApiAvailable`.
- The baseline note distinguishes RNN-only timing from full pure-advance timing.
- No production code changes are made in this step.

### 2. Add Plan-Aligned Effective Brain Value Arrays

Extend `createEffectiveBrainValues` or add a plan-aligned companion helper that materializes effective connection weights, output biases, and gate biases into arrays keyed by compiled brain plan indexes.

Exit gates:
- Brain forward-pass fixtures match exactly for outputs, hidden state, active connection IDs, and activation maps.
- Learned-state deltas still apply through the same effective-value path and respect max learned-delta clamps.
- Object-based effective-value access and plan-aligned array access are built from one shared effective-value materialization path.
- The optimization does not introduce a second independent implementation of effective learned values or GRU-like brain math.
- Existing object-based effective-value access remains available for inspection, inheritance materialization, and non-plan code.
- The plan-aligned helper is scoped to a compiled brain plan and cannot be reused with a different topology signature.
- Array indexes are derived from `CompiledBrainPlan` order, not from ad hoc innovation/unit-id assumptions.
- Tests cover base genome changes, learned-state changes, and max learned-delta changes that must alter effective array values.

### 3. Update Brain Evaluation To Use Fast Effective Values

Modify `src/sine/spawner/brain.ts` so hot loops can use plan-aligned arrays instead of repeated string-key and map lookups.

Exit gates:
- `evaluateSpawnerBrain`, `evaluateSpawnerBrainPure`, and `forwardSpawner` keep their public signatures unless a narrower internal overload is clearly justified.
- Sync brain evaluation, async sync-runner evaluation, and browser-worker evaluation produce identical results.
- Activation recording still reports the same connection IDs and source/target values when requested.
- `includeActivations: false` and `includePreviousState: false` remain fast paths and do not allocate unused maps.
- Hot loops no longer call string-key learned-delta lookup helpers per connection/gate/output when plan-aligned arrays are available.
- Source-value lookup and hidden-state array access remain deterministic and preserve current/update/previous-state semantics.
- Brain perf at 100, 250, and 500 population is compared to Milestone 0, Milestone 2, Milestone 3, and the immediate pre-Milestone-5 baseline.
- Pure advance timing at 100, 250, and 500 population is also compared, so a faster microbenchmark is not mistaken for full runtime speedup.

### 4. Preserve Bounded And Correct Brain Optimization Caches

The current worker genome and plan caches are already bounded, and `brainGenomeCacheSignature()` already includes forward-pass weights, output biases, gate biases, and max learned-delta cap. Any new effective-array or summary cache must preserve and extend that correctness rather than replacing it with weaker keys.

Exit gates:
- Long evolutionary runs do not accumulate stale effective-value arrays for dead agents indefinitely.
- Worker and main-thread caches have explicit invalidation or size bounds.
- Cache keys include every value needed for correctness, including structural plan signature, base forward values, max learned-delta cap, and learned state if learned values are cached.
- Existing `brainGenomeCacheSignature()` correctness tests continue to pass.
- Tests cover a genome/learned-state change that must invalidate cached effective values.
- Caches distinguish base effective values from learned-state-specific effective values; learned-state-specific arrays are not cached globally unless the key includes learned deltas.
- Worker cache behavior remains bounded and still resends genomes/effective data correctly after eviction, failed shards, reset, and worker disable/re-enable.
- Cache invalidation tests cover structural mutation, weight-only mutation, output-bias mutation, gate-bias mutation, and learned-delta mutation.

Milestone exit gates:
- Brain forward-pass parity passes for sync, async sync-runner, and browser-worker paths.
- Cached-plan and fresh-plan RNN timing is measured at 100, 250, and 500 population.
- Pure advance timing is measured at 100, 250, and 500 population and reported separately from RNN-only timing.
- Timing comparisons include the immediate pre-Milestone-5 baseline, not only older milestone reports.
- Node parallel-pool fallback numbers are not treated as browser-worker evidence unless `browserWorkerApiAvailable` is true.
- Allocation/materialization changes are described clearly enough to show where object/map/string-key work was reduced.
- Browser sync and browser parallel are remeasured, but parallelism is not considered successful merely because parity passes.
- No second brain engine, uniqueness engine, or learned-value implementation exists after the refactor.

## Milestone 6: Reassess Browser Parallelism And Final Cleanup

Goal: finish the simplification plan with measurement, cleanup, and architectural audit work. Milestone 5 already remeasured real browser sync versus 4-worker parallel after the brain hot-path optimization, and parallel remained slower through 500 population. This milestone should therefore treat browser parallelism as an audit and decision point, not as an implementation target. It should also confirm the headless impact of Milestone 5, because headless uses the same optimized brain/runtime path.

Do not add new worker protocol, headless-engine, or brain/effective-value abstractions in this milestone unless a failing gate proves they are necessary. The default expectation is reporting, conservative cleanup, and final parity verification.

### 1. Reassess Browser Parallelism

Rerun browser sync and browser Worker benchmarks after the runtime, uniqueness, headless, and brain hot-path refactors. Milestone 5 already showed that browser sync and browser parallel both improved, but 4-worker parallel still lost to sync at 100, 250, and 500 population. Do not expand worker complexity unless a larger-population benchmark shows a clear crossover.

Current browser-worker configuration is intentionally conservative: `MIN_PARALLEL_BRAIN_EVAL_JOBS` remains effectively disabled unless later measurements justify changing it.

Exit gates:
- Browser sync and browser parallel timings are measured at 100, 250, and 500 population.
- A 1000-population browser benchmark is attempted with fixed tick count, bounded timeout, and comparable settings; if the local machine cannot run it reasonably, the report records the attempted command, timeout/abort reason, and does not treat the missing 1000-pop result as a speedup claim.
- Browser-worker parity still passes.
- Parallelism is considered a speed win only if it beats browser sync by a meaningful margin at a defined population threshold, such as `>=500` or `>=1000` population, after warmup and with comparable settings.
- Benchmarks report full tick/advance time. Batch brain-evaluation time and serialization overhead are reported only where current runner stats or lightweight benchmark-only instrumentation can expose them without adding worker protocol complexity.
- If parallelism remains slower or only marginally faster, the plan documents that result, keeps the automatic threshold conservative, and does not add more worker architecture.
- If parallelism is enabled at a threshold, the threshold and worker count are documented and guarded by tests or config assertions.
- Node fallback behavior remains clear: lack of browser `Worker` support must not be mistaken for a browser parallel benchmark.
- If parallelism remains disabled, `MIN_PARALLEL_BRAIN_EVAL_JOBS` stays conservative and the UI/footer still reports the effective brain-evaluation mode accurately.

### 2. Measure Post-Milestone-5 Headless Impact

Milestone 4 reduced headless recorder/sink overhead but did not materially reduce total runtime because core simulation still dominated. Milestone 5 improved core brain/runtime advance, so headless should be remeasured directly.

Exit gates:
- A post-Milestone-5 headless timing sample records seed, market source, target ticks, initial/max population, chunk size, checkpoint interval, and minimum resolved trades.
- The timing sample reports chunk time, advance time, recorder event time, DB/write time, enqueue time, flush time, core estimate, ticks/sec, top sink method, and row/write counts where available.
- Results are compared against the Milestone 4 post-batching timing sample, especially `advanceTotalMs`, `simulationCoreEstimateMs`, `recorderEventMs`, and `sinkWriteMs`.
- The report states whether any headless speedup came from the shared brain/runtime path, recorder/sink work, DB writes, or neither.
- Timing can be captured through the Runs UI/API or by extending `scripts/sineHeadless.ts` to print the existing timing snapshot; any CLI change is script/output-only and does not change headless runtime semantics.
- A completed headless smoke run can still be opened through the Runs page after the measurement.

### 3. Audit Fresh-Plan Usage And Accepted Tradeoff

Milestone 5 made cached-plan RNN evaluation faster but made fresh-plan evaluation slower because compiled plans now carry richer indexed metadata. Runtime should stay on cached plans; fresh plans should remain diagnostic/test-only.

Exit gates:
- Searches confirm production runtime paths do not call `evaluateSpawnerBrain` or `evaluateSpawnerBrainPure` with `useCachedPlan: false`.
- Existing fresh-plan tests remain limited to parity/diagnostic coverage.
- `scripts/sinePerf.ts` continues to measure fresh-plan RNN timing so the tradeoff remains visible.
- The final report documents the fresh-plan slowdown as an accepted tradeoff only because cached-plan/full-runtime paths improved and production uses cached plans.
- No runtime behavior is changed to hide or special-case the fresh-plan benchmark.

### 4. Remove Transitional Wrappers

Delete temporary compatibility wrappers created only to sequence the refactor.

Exit gates:
- No old helper remains solely to call the new helper with the same arguments.
- Public APIs that need to remain for callers are documented by usage, not by stale compatibility comments.
- Searches for old helper names show no accidental duplicate paths.
- TypeScript checks pass without unused exports.
- Context helpers, buffered sinks, effective-value materializers, and packet builders each have one ownership boundary.
- No permanent compatibility layer keeps both old and new hot-path implementations active.
- Stable public entry points such as `forwardSpawner`, `evaluateSpawnerBrain`, worker packet builders, repository facades, and UI-facing API helpers are not removed merely because they delegate internally.
- Cleanup is search-driven and conservative: if a wrapper is kept for a real public call site, the report says why.

### 5. Run Full Verification

Run the full verification suite and targeted browser checks.

Exit gates:
- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.
- Browser smoke or Playwright checks cover charts, right sidebar, modals, run archive, Runs page, and selected-agent inspector if those surfaces were touched.
- Headless run smoke test completes and can be opened through the UI.

### 6. Report Speed And Complexity Results

Summarize what changed, what sped up, and what did not.

Exit gates:
- Report includes before/after live tick timings at 100, 250, and 500 population.
- Report includes before/after headless chunk timing and DB-write timing.
- Report includes the post-Milestone-5 browser sync versus browser parallel measurements and any 1000-population attempt.
- Report includes the fresh-plan usage audit and explains the accepted fresh-plan slowdown.
- Report identifies any optimization that preserved parity but did not materially improve speed.
- Report lists remaining high-risk performance targets separately from completed simplifications.
- Report separates side-cost wins, such as uniqueness or packet/build savings, from core simulation wins.
- Report states whether browser parallelism is enabled, disabled, or left behind a conservative threshold, with measured justification.
- Report identifies any deferred semantic work, such as cluster-aware uniqueness or seed-bank regime analysis, as outside this parity-preserving simplification plan.

Milestone exit gates:
- All completed refactors have parity evidence.
- The codebase has fewer duplicated helper paths than before the plan.
- Performance measurements are available for both live runtime and headless mode.
- Browser parallelism is either justified by measured speedup at a defined threshold or explicitly left disabled/conservative.
- Any deferred work is explicit and does not leave half-adopted architecture in production code.
- Final verification includes a short audit that no second brain engine, uniqueness engine, headless engine, or persistence contract remains in parallel with the adopted path.
- Final verification includes a short audit that no runtime path accidentally depends on fresh-plan brain evaluation.
