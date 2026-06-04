# Sine Runtime Speed Research Plan

This plan answers one question:

> What changes are most likely to speed up Sine simulation advance time, with enough evidence to choose the next implementation plan?

The plan is research and benchmarking only. It does not implement production optimizations. By the end, we should know which backend and simulation-architecture changes are likely major speedups, which are only moderate, and which are not worth the complexity.

## Scope

This plan covers two areas:

1. Backend stack and job execution model.
2. Simulation architecture and per-tick compute hot paths.

Milestones 1 and 2 include:

- local codebase benchmarks
- targeted web research
- explicit functional-parity and architecture-cleanliness checks
- evidence-ranked recommendations

## Source Rules For Web Research

- Prefer official documentation, primary specifications, and project-maintainer documentation.
- Use engineering blog posts, benchmark articles, and vendor material only as secondary evidence.
- Label secondary evidence clearly in the report.
- Do not accept generic benchmark claims without checking whether they apply to this codebase's workload.
- Cloud hardware is in scope only if evidence suggests it will materially help this workload.

## Non-Goals

- Do not change reward, learning, mutation, reproduction, payoff, food resolution, market inputs, or persistence semantics.
- Do not implement a production worker-thread runner, process runner, WASM module, Rust module, native addon, or DB rewrite.
- Do not build benchmark prototypes beyond lightweight instrumentation and benchmark scripts.
- Do not duplicate the simulation engine.
- Do not make an architecture decision automatically from a benchmark threshold. Bring the findings back for review.
- Do not treat DB unification as a speed project. DB unification remains an analysis-quality and architecture-simplification decision.
- Do not claim a speedup is guaranteed until an implementation benchmark proves it. This plan identifies highest-confidence candidates.

## Baseline Context

The existing DB write-model benchmark showed:

- Headless runtime is dominated by simulation advance/core compute.
- At 500 population / 5,000 ticks, DB/write time was about 2.0 seconds out of about 258.6 seconds.
- At 250 population / 20,000 ticks, DB/write time was about 12.3 seconds out of about 558.4 seconds.
- Lab packet size is meaningful, but raw SQLite write time is not the main speed bottleneck.

This plan starts from that finding and investigates how to reduce advance time directly.

## Milestone 0: Benchmark Harness Preparation

Goal: add the smallest benchmark-only support needed for the backend and architecture research to produce comparable, non-destructive evidence.

Current backend architecture:

- Local Node HTTP server in `server/index.mjs`.
- Manual route dispatcher in `server/routes.mjs`.
- SQLite via synchronous `node:sqlite`.
- Lab saved runs use `data/toy-market.sqlite`.
- Headless runs use `data/sine-headless.sqlite`.
- Headless jobs run in-process in `server/sineHeadlessJobs.mjs`.
- Only one active Sine headless job is allowed.
- Headless uses the same TypeScript engine in `src/sine/headless/runner.ts`.

### 1. Add API And Job Timing Harnesses

Add only benchmark-only or explicitly gated instrumentation/scripts needed to measure active jobs and server responsiveness.

Required harness support:

- API latency runner that polls selected endpoints while a headless job is active.
- Event-loop delay or utilization measurement using Node `perf_hooks`, if available.
- Run-throughput comparison with and without active API polling.
- Query timing wrapper that can separate at least:
  - total client-observed latency
  - server handler time, if instrumented
  - SQLite query time, if instrumented
  - JSON parse/serialization limitation, if not separately measurable

Constraints:

- Do not change production headless job semantics.
- Do not add a production job queue or production worker-thread runner in this milestone.
- Do not add schema migrations.
- Keep instrumentation optional and inert by default.

Exit gates:

- Event-loop delay/utilization is measured, or the report states why the metric is unavailable.
- API latency output includes p50, p95, max, and sample count.
- Run-throughput output includes active polling and no-polling comparisons.
- Endpoint timing output identifies client-observed latency and any server-side timing that was actually instrumented.
- Any unmeasured JSON parse/serialization cost is labeled as part of client-observed latency.
- Instrumentation is benchmark-only or gated and does not affect normal runs.

### 2. Define DB Isolation For Benchmarks

Define how server/API benchmarks avoid polluting or damaging real run data.

Important current constraint:

- The current headless API route sanitization does not accept a per-request `dbPath`.
- Server/API benchmarks therefore cannot assume temporary DB support unless a narrow benchmark-only server override is added first.

Allowed approaches:

- Start a benchmark server with an isolated DB path through environment/configuration, if supported or added narrowly.
- Use the production DB only when explicitly labeled, with benchmark run names and cleanup where safe.
- Use CLI/headless benchmarks with temp DB paths when measuring engine behavior that does not require API routing.

Exit gates:

- Server/API benchmark DB behavior is documented before running the benchmark.
- Any benchmark-only DB override preserves default production DB behavior.
- Production DB usage, if any, is clearly labeled in benchmark output.
- Benchmark scripts do not delete or mutate unrelated production runs.
- Cleanup steps are documented and run only against benchmark-created data.

### 3. Add Gated Simulation Phase Instrumentation Surfaces

Add only the instrumentation hooks needed by Milestone 2.

Recommended surfaces:

- `SpawnerAdvanceOptions.phaseInstrumentation` for phase timing inside `stepSpawnerWorld()`.
- Market feature resolver timing hooks inside or directly around `createMarketFeatureContext()`.
- Brain-evaluation timing hooks that can separate evaluation math from state conversion, DTO materialization, and trace-only recomputation where practical.

Constraints:

- Do not add console logging inside hot loops.
- Do not duplicate runtime logic just to time it.
- Do not change reward, learning, mutation, reproduction, or persistence semantics.

Exit gates:

- Phase instrumentation is optional and inert by default.
- Existing deterministic/parity Sine tests remain unchanged.
- `npm run check` passes after harness changes.
- `npm run test:sine` passes if shared runtime modules are touched.

Milestone 0 exit gates:

- Benchmark scripts can run without deleting or corrupting production runs.
- Benchmark DB isolation behavior is explicit.
- Event-loop, API latency, polling/no-polling throughput, and phase-timing harnesses are available or their limitations are documented.
- `npm run check` passes after harness changes.

## Milestone 1: Backend Stack And Execution Model Research

Goal: determine whether the current backend stack is limiting throughput, responsiveness, or future scalability, and whether backend isolation or cloud hardware is likely to help.

### 1. Research Node Execution And Isolation Options

Research official/primary sources for:

- Node event loop behavior under CPU-bound work.
- Node `worker_threads`.
- Node `child_process`.
- Node `cluster`, if relevant.
- Node `perf_hooks`, especially event-loop delay monitoring.
- Structured clone and transfer costs for worker communication.
- Node-native addon and WASM viability/probability at a high level, limited to whether they are plausible enough to justify deeper Milestone 2 numeric-kernel research.
- Evidence that native/WASM would or would not plausibly speed up this specific workload, including whether the likely bottleneck is numeric math, object traversal/allocation, serialization, or persistence.

Secondary sources may be used for:

- CPU-bound Node worker-thread benchmark patterns.
- Practical worker-thread pool architecture.
- Tradeoffs between worker threads and child processes.
- Native/WASM speedup case studies, clearly labeled as secondary unless they come from official/project-maintainer sources, and only used after checking whether their workload resembles Sine's runtime.

Questions to answer:

- Does CPU-bound in-process simulation block HTTP responsiveness?
- Would moving a whole headless run to a Node worker thread likely improve server responsiveness?
- Would it improve wall-clock runtime, or mostly isolate the API server?
- What data would need to cross the worker boundary: config, progress, checkpoints, final status, and DB sink messages?
- Is a child process cleaner than a worker thread for crash isolation and memory limits?
- What is the preliminary probability that native/WASM improves Sine advance time materially, given current JS object shape, serialization cost, allocation patterns, and one-canonical-engine constraints?
- Which parts of the runtime would need to move to native/WASM for a speedup to be plausible, and which parts would likely stay in TypeScript without defeating the speedup?

Exit gates:

- Official Node references are cited for event loop, worker threads, child processes, and relevant performance APIs.
- Secondary sources are labeled as secondary evidence.
- The report distinguishes wall-clock speedup from responsiveness/isolation.
- The report states whether backend offloading can reuse the same `src/sine` engine without duplicating runtime logic.
- The report identifies the minimum data that would need to cross a backend worker boundary.
- The report gives a preliminary native/WASM viability and likelihood assessment, while leaving detailed numeric-kernel research to Milestone 2.
- The report identifies the assumptions that must be true for native/WASM to be worth prototyping, and the assumptions that would make it low value or too risky for functional parity.

### 2. Measure API Responsiveness During Active Headless Runs

Run active headless jobs while polling API endpoints.

Measure at minimum:

- `/api/health` latency.
- `/api/sine/headless/runs/active` latency.
- latest-run or saved-run analysis endpoint latency if a completed run exists.
- event-loop delay through the Milestone 0 benchmark endpoint.
- active job progress cadence.
- run throughput with and without polling.

Run at representative populations:

- 100 population
- 250 population
- 500 population

Use the Milestone 0 DB isolation strategy. Prefer a benchmark server started with `SINE_BENCHMARK_INSTRUMENTATION=1` and `SINE_HEADLESS_DB_PATH=...`. The current API route does not accept a per-request temp DB path, so this benchmark must either start an isolated benchmark server or label and clean up production-DB benchmark runs.

Exit gates:

- Latency is measured while no headless job is active.
- Latency is measured while 100, 250, and 500 population headless jobs are active.
- Results report p50, p95, and max latency for each endpoint.
- Results compare simulation throughput with active polling versus no polling.
- Results show whether API polling competes with in-process simulation.
- Results correlate endpoint latency with server request timing, event-loop delay, chunk timing, and flush timing from the Milestone 0 harness.
- Any surprising polling/no-polling throughput result is rerun with a larger sample before being treated as evidence.
- Any production DB usage is labeled and justified.

### 3. Measure Chunk Size And Yield Overhead

Benchmark headless runs with the same seed, population, target ticks, checkpoint interval, and DB mode/isolation strategy, varying only `chunkTicks`.

Separate two benchmark paths:

- CLI/runtime path: can test values above the server cap.
- Server/API path: currently caps `chunkTicks` at 100 in `sanitizeSineHeadlessJobOptions()`, so it should test the effective server range unless a benchmark-only server override is added.

Suggested values:

- 1
- 10
- 25
- 50
- 100
- 250
- 500
- 1000

Record:

- total runtime
- advance time
- recorder time
- DB/write time
- flush count
- progress update count
- cancel responsiveness, if measured
- API responsiveness during run

Questions to answer:

- Is the current server cap of 100 ticks per chunk costing meaningful throughput?
- Is `yieldToEventLoop()` overhead material?
- What chunk size gives the best throughput without making progress/cancel/UI polling unacceptable?

Exit gates:

- At least five CLI/runtime chunk sizes are measured.
- Server/API chunk tests either stay within the current cap or explicitly use a benchmark-only override.
- Each run uses the same seed, population, target ticks, and DB mode.
- CLI/runtime results and server/API results are not merged into one conclusion unless their constraints match.
- The report separates throughput from responsiveness.
- The report identifies a recommended chunk-size range or states that chunk size is not material.
- The report distinguishes CLI/runtime chunk behavior from server/API chunk behavior.
- If chunk size materially improves runtime, the report explains the functional-parity risk, if any.

### 4. Measure SQLite And Analysis Query Contention

During an active headless run, run read queries against:

- active job status
- latest run summary
- completed run agent leaderboard
- completed run agent detail
- completed run lineage leaderboard
- completed run trade breakdown
- completed run event timeline

Also measure the same queries when no job is active.

Questions to answer:

- Do read queries slow down active simulation or flushes?
- Do write flushes slow down analysis queries?
- Are any analysis queries slow enough that they should be materialized post-run?
- Are current indexes sufficient for the existing headless analysis UI?

Exit gates:

- Query timings are recorded idle and under active run load.
- Slow queries are identified by endpoint and query shape.
- The report distinguishes client-observed latency, server request timing, and wrapped repository/query timing from the Milestone 0 harness.
- The report states that wrapped repository/query timing may include row parsing/materialization and does not include JSON response serialization.
- The report identifies whether JSON parsing or response serialization is likely meaningful by comparing client-observed latency with server-side timing buckets.
- The report identifies whether post-run materialization is likely worthwhile.
- No schema/index change is made in this milestone unless it is benchmark-only and isolated.

### 5. Research SQLite Write Architecture

Research official/primary sources for:

- SQLite WAL behavior.
- SQLite synchronous settings.
- Node `node:sqlite` synchronous API behavior.
- SQLite transaction batching.
- SQLite concurrent reads and writes in WAL mode.

Secondary sources may be used for:

- practical SQLite WAL tuning
- batch insert performance
- read/write contention patterns

Questions to answer:

- Is current synchronous SQLite acceptable if compute dominates?
- Would a separate DB writer worker overlap writes with simulation enough to matter?
- Would WAL settings or transaction sizes materially affect the measured workload?
- Are current `ON CONFLICT DO UPDATE` statements necessary for hot write paths?

Exit gates:

- Official SQLite and Node references are cited.
- The report identifies which current write paths are append-only versus upsert-heavy.
- The report states whether write-worker isolation is likely a speed improvement, a responsiveness improvement, or not worth it.
- The report identifies any low-risk SQLite tuning candidates, if any.
- The report does not recommend DB unification for speed unless benchmark evidence supports it.

### 6. Assess Cloud Hardware Evidence

Cloud is in scope only if the evidence suggests it will materially speed this workload.

Research:

- whether the current workload is single-thread CPU-bound, memory-bandwidth-bound, or parallelizable
- CPU clock speed versus core count tradeoffs
- Apple Silicon local performance versus likely cloud CPU performance
- cloud instances with high single-core performance
- cloud instances with high memory bandwidth, if memory bandwidth appears relevant

Questions to answer:

- Would renting more cores help before the simulation is parallelized?
- Would higher single-core performance help enough to justify cloud cost?
- Would memory bandwidth help this JS object-heavy workload, or is V8/runtime overhead the limiting factor?
- What benchmark would need to be run on cloud before committing?

Exit gates:

- Cloud recommendations are preliminary until Milestone 2 phase profiling is complete.
- Final cloud recommendations are gated on local evidence from this milestone and Milestone 2.
- The report distinguishes single-core speed, multi-core parallelism, memory bandwidth, and storage I/O.
- The report identifies at least one local benchmark that would predict cloud benefit.
- If cloud is not clearly useful yet, the report says so directly.
- No cloud migration or remote runner is proposed without a measurable expected benefit.

Milestone 1 exit gates:

- A backend research report exists.
- Milestone 0 benchmark harness gates are satisfied.
- API responsiveness under active headless compute is measured.
- Chunk-size/yield tradeoffs are measured.
- SQLite write/query contention is measured.
- Official/primary backend references are cited.
- Secondary sources are labeled.
- The report ranks backend options as likely major speedup, moderate speedup, responsiveness-only, or low value.
- The report identifies whether backend worker isolation is worth prototyping in a later implementation plan.

## Milestone 2: Simulation Architecture And Hot-Path Research

Goal: identify which simulation-engine changes will most reliably reduce advance time while preserving functional parity.

Current simulation path:

- `advanceSimulationToTarget()` advances the market timeline.
- It then advances the spawner world one tick at a time.
- `stepSpawnerWorld()` resolves food, prunes dead agents, decays learning, prunes traces, prepares plans, applies upkeep, builds market inputs, evaluates every brain, applies actions/reproduction, trims food, and records telemetry.

### 1. Run And Refine Phase-Level Tick Profiling

Use the Milestone 0 phase harness as the first-pass profiler. Refine it only where a top phase is too broad to answer the downstream question.

Recommended implementation shape:

- Extend `SpawnerAdvanceOptions` with a gated `phaseInstrumentation` object.
- Keep phase recording optional and inert by default.
- Record through a benchmark script, not console logging inside the simulation loop.
- Preserve the current first-pass phase buckets unless a narrower breakdown is needed.

- food resolution
- dead-agent pruning
- learned-state decay
- trace pruning
- plan lookup/compilation
- upkeep
- food pending-count/index creation
- market input resolver creation
- per-agent context/input construction
- per-agent input array construction
- `buildSpawnerInputs()` copy/spread cost
- brain job construction
- brain job/result array allocation where practical
- brain evaluation
- parallel brain wait time, if the parallel path is active
- result ordering/application
- output decoding
- action selection
- food spawning
- reproduction/mutation
- post-action death pruning
- food trimming
- telemetry

Run at:

- 100 population
- 250 population
- 500 population
- at least one high-action scenario
- at least one mostly-waiting scenario

Exit gates:

- Phase timings exist for representative populations.
- Results include total phase time and per-tick average time.
- Results include counts needed to interpret timings, such as population, job count, pending foods, retained foods, action count, and reproduction count where practical.
- Results identify the top three tick-loop phases by time.
- If a top phase is too broad, such as `actionApplication`, it is split enough to separate output decoding, action selection, trace capture, food spawning, and reproduction/mutation.
- Results identify whether high-action and mostly-waiting workloads have different bottlenecks.
- Sync and parallel brain-evaluation paths are labeled separately when both are measured.
- Instrumentation is benchmark-only or gated and does not affect functional behavior.
- Deterministic digest or existing parity tests remain unchanged after adding instrumentation.

### 2. Profile Market Input Construction

Instrument market input resolution:

- distinct perception keys per tick
- market-input cache hit rate
- feature-cache hit rate
- sample-cache size
- market feature context allocation count/time where practical
- cached market input copy count/time where practical
- per-agent input array allocation count/time where practical
- time spent in local scale
- time spent in rolling deltas
- time spent in trend regression
- time spent in cycle/roughness
- time spent in volume features
- time spent in RSI
- time spent in volume-price agreement

Questions to answer:

- Are agents mutating into mostly unique perception profiles, reducing cache effectiveness?
- Which feature family is the largest cost?
- Is per-agent array/object construction a larger cost than feature math?
- Would sliding-window/prefix/ring-buffer stats help?
- Are any newer inputs materially expensive relative to their value?

Exit gates:

- Instrumentation is added inside `createMarketFeatureContext()` / resolver code or through a benchmark wrapper that can attribute feature-family cost accurately.
- Feature-family timings are recorded.
- Context/input construction timings are recorded, including cached-input copy cost where practical.
- Cache hit/miss rates, distinct perception keys, feature-cache size, and sample-cache size are emitted by benchmark output.
- Results compare founder-heavy early ticks with later evolved populations.
- Results identify whether market-input construction is a major, moderate, or minor bottleneck.
- Candidate optimizations preserve the exact same input values unless explicitly marked as approximate and deferred.

### 3. Profile Brain Evaluation And Allocation Pressure

Measure:

- cached-plan brain evaluation time
- compiled-plan signature recomputation time
- plan signature lookup time
- effective-value array construction time
- hidden-state record-to-array time
- current-state array-to-record materialization time
- output array allocation time, if measurable
- public DTO materialization time
- result ordering and identity validation time
- activation materialization time
- trace-only recomputation time
- job object creation time
- result object and ordered-result array construction time where practical
- input/output/current-state allocation pressure
- GC/allocation pressure, using available V8/Node profiling tools

Research official/primary sources for:

- V8/Node CPU profiling
- V8/Node heap and allocation profiling
- JavaScript typed arrays and structured clone behavior
- Node `--prof`, inspector CPU profiles, or equivalent official tooling

Questions to answer:

- Is the brain kernel itself slow, or are conversions/materialization slow?
- Would hidden state staying array-backed through runtime materially help?
- Would cached effective-value arrays materially help?
- Would a flatter numeric plan reduce object-property access enough to matter?
- Would typed arrays help or introduce too much parity/complexity risk?

Exit gates:

- Brain evaluation is broken down into math, plan/effective values, state conversion, materialization, and trace overhead where practical.
- The report states clearly which brain costs are covered by the Milestone 0 broad `brainEvaluation` bucket and which required deeper profiling inside `brain.ts` or `brainEvaluationRunner.ts`.
- Allocation/GC evidence is recorded or the limitation is clearly stated.
- The report identifies which brain optimization has the strongest speedup evidence.
- Any typed-array recommendation includes a parity-risk assessment.
- No second brain engine is recommended unless the report also describes how to keep one canonical kernel.

### 4. Profile Food Resolution And Food Retention

Measure:

- number of pending foods per tick
- number of total retained foods per tick
- due foods per tick
- time spent scanning foods in `resolveFoods()`
- time spent trimming `world.foods`
- food count distribution by horizon
- cost under high-action and normal scenarios

Questions to answer:

- Is scanning every food every tick a material cost?
- Would bucketing pending food by `resolveTick` materially reduce work?
- Would a retention queue/ring buffer replace per-tick filtering cleanly?
- Can this be done without changing resolution order or event semantics?

Exit gates:

- Food resolution and trimming costs are measured separately.
- Results show cost as a function of pending food count and retained food count.
- Results include sampled pending-food count, retained-food count, and food count by horizon where practical.
- Results include due-food count, not just total retained-food count.
- If bucketing is recommended, parity requirements for resolution order and event ordering are documented.
- If food scanning is minor, it is explicitly deprioritized.

### 5. Profile Learning, Trace, And Reproduction Costs

Measure:

- learned-state decay time
- trace pruning time
- capture decision trace time
- reproduction trace time
- effective genome materialization for inheritance
- genome mutation time
- reproduction event/snapshot creation time

Questions to answer:

- Do high-reproduction ticks create spikes?
- Is trace pruning linear in stale trace count?
- Does materializing effective genomes for inheritance become expensive as brains grow?
- Are reproduction/mutation costs rare enough to ignore, or large enough to optimize?

Exit gates:

- Costs are measured separately for low-action, high-action, and high-reproduction scenarios.
- Results identify whether reproduction/mutation creates runtime spikes.
- Candidate optimizations preserve inheritance, learned-state, and mutation semantics.
- If costs are rare/minor, this area is deprioritized.

### 6. Research Parallelism, WASM, Native Addons, And Numeric Kernels

Use Milestone 2 measurements to decide what to research deeply.

Research official/primary sources for:

- browser Web Workers and structured clone
- Node worker threads and transferable objects
- WebAssembly numeric performance and JS/WASM boundary costs
- Rust/WASM toolchain basics
- Node native addons or N-API, if native addons remain plausible

Secondary sources may be used for:

- JS vs WASM numeric benchmark caveats
- typed-array hot-loop optimization
- worker-pool overhead patterns

Questions to answer:

- Is the workload parallelizable at the right granularity?
- Is per-agent brain evaluation large enough to amortize worker overhead?
- Would whole-run worker isolation help more than per-tick brain sharding?
- Is a WASM/Rust/native kernel likely to beat V8 on this specific object-heavy workload?
- What data representation would a native/WASM kernel require?
- Would that representation simplify or complicate the codebase?

Exit gates:

- Research is tied back to measured hot paths, not generic benchmark claims.
- Browser-worker, Node-worker, WASM, Rust, and native-addon options are compared separately.
- Any recommendation states expected speedup mechanism and parity risk.
- Cloud hardware is revisited only if the measured bottleneck can exploit more cores, faster cores, or memory bandwidth.
- The report identifies whether a later prototype should target browser Lab, headless backend, or both.

### 7. Produce A Ranked Speedup Candidate Matrix

Create a final matrix with columns:

- candidate
- targeted bottleneck
- expected speedup class: major / moderate / minor / unknown
- evidence strength
- functional-parity risk
- architecture complexity
- implementation scope
- browser Lab relevance
- headless relevance
- cloud relevance
- recommendation

Candidate examples:

- phase-specific market input caching
- sliding-window market feature summaries
- hidden-state array persistence
- effective-value cache invalidated by learning
- flatter numeric brain plan
- food resolve buckets
- food retention queue
- backend worker-thread isolation
- DB writer worker
- larger headless chunks
- post-run materialized analysis
- browser-worker brain parallelism
- Node worker-thread brain parallelism
- WASM/Rust/native numeric kernel
- cloud high-single-core CPU runs
- cloud multi-core runs after parallelization

Exit gates:

- Matrix includes backend and simulation candidates.
- Every candidate is tied to measured evidence or explicitly labeled unknown.
- At least three candidates are identified as not worth pursuing now, if evidence supports that.
- The report identifies the first implementation plan to write next.
- The report distinguishes speed improvements from UI responsiveness improvements.
- The report avoids claiming guaranteed speedups before implementation benchmarks.

Milestone 2 exit gates:

- A simulation architecture research report exists.
- Phase-level timings identify the dominant tick-loop phases.
- Market input, brain evaluation, food handling, learning/trace, and reproduction costs are measured or explicitly ruled out as unavailable.
- Web research is tied to measured bottlenecks.
- The final matrix ranks candidates by likely speedup and complexity.
- The report identifies the highest-confidence implementation candidates for speeding up simulation advance time.

## Final Verification Gates

- Milestone 0 harness behavior is documented in `docs/`.
- Milestone 1 and Milestone 2 reports exist in `docs/`.
- All benchmark scripts or instrumentation added for this research are either benchmark-only or gated.
- `npm run check` passes after any instrumentation changes.
- `npm run test:sine` passes if any shared runtime modules are touched.
- `npm run build` passes if UI/browser benchmark code is touched.
- No production simulation semantics change during research.
- No production DB schema migration is made during research.
- Findings are concrete enough to write the next implementation plan without another broad audit.
