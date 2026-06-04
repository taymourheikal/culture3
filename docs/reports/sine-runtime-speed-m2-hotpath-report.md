# Sine Runtime Speed Milestone 2 Report

Milestone 2 asks which simulation-engine changes are most likely to reduce advance time while preserving functional parity.

## Short Answer

The dominant ordinary tick-loop costs are:

1. brain evaluation
2. learned-state decay
3. market input/context construction
4. plan lookup

Under high-action workloads, the bottleneck changes: food resolution, trace capture/materialization, and food trimming become major. That means the next implementation plan should not focus on DB writes or backend routing. It should target:

- sparse/no-op learned-state decay
- market input and perception-cache reuse
- food resolve/retention indexing for high-action runs
- trace capture/materialization cost under high-action runs
- only then more brain hot-path work

Per-agent brain evaluation is still important, but the direct cached-plan microprofile is about `0.04 ms` per evaluation. Browser-worker brain sharding has already failed to beat sync at 100-1000 population in prior reports, and M2 does not change that conclusion. Native/WASM remains conditional: it is plausible only for a narrow, array-backed kernel, not for the current object-heavy full tick loop.

## Benchmark Artifacts

Main artifact:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10 \
  > /tmp/sine-m2-hotpath-main.json
```

Evolved-population market-input artifact:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 100 \
  --warmup-ticks 1000 \
  --populations 250 \
  --scenarios baseline \
  --brain-iterations 5 \
  > /tmp/sine-m2-hotpath-evolved.json
```

Benchmark source:

- `scripts/sineRuntimeHotPathBenchmark.ts`

Instrumentation source:

- `src/sine/spawner/world.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- `src/sine/spawner/marketInputs.ts`
- `src/sine/spawner/marketFeatureContext.ts`
- `src/sine/spawner/marketFeatureInputs.ts`
- `src/sine/spawner/brain.ts`

The instrumentation is optional and inert unless a benchmark passes instrumentation objects.

## Phase-Level Tick Profile

Baseline, generated market, fixed population, 200 ticks. The raw JSON artifact records `totalMs`, `msPerTick`, `msPerCall`, and `msPerCount` for every phase; the table below shows the dominant totals plus whole-run average tick time.

| Population | Ticks/s | Avg tick ms | Brain ms | Learned decay ms | Input/context ms | Market input ms | Plan lookup ms | Food resolve ms | Food trim ms | Actions | Avg pending food | Avg retained food | Avg due food |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 108.265 | 9.236 | 693.908 | 437.107 | 319.690 | 308.811 | 233.707 | 48.438 | 3.037 | 855 | 67.680 | 463.135 | 4.020 |
| 250 | 43.098 | 23.203 | 1822.773 | 1170.527 | 651.689 | 632.927 | 629.394 | 98.396 | 19.413 | 1892 | 149.000 | 1055.725 | 8.930 |
| 500 | 20.659 | 48.405 | 3770.316 | 2499.170 | 1296.737 | 1238.703 | 1324.127 | 197.105 | 38.892 | 3664 | 292.305 | 2042.800 | 17.285 |

Top three baseline phases:

- 100 pop: brain evaluation, learned-state decay, spawner context/input construction.
- 250 pop: brain evaluation, learned-state decay, spawner context/input construction.
- 500 pop: brain evaluation, learned-state decay, plan lookup.

Sync path note: these phase profiles use the sync/default brain-evaluation path. Browser-worker parallelism was previously measured separately and remained slower through 1000 population.

## Scenario Differences

250 population, 200 ticks:

| Scenario | Ticks/s | Brain ms | Learned decay ms | Market input ms | Food resolve ms | Trace capture ms | Trace materialize ms | Repro attempt ms | Actions | Births | Avg pending | Avg retained | Avg due |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 43.098 | 1822.773 | 1170.527 | 632.927 | 98.396 | 77.515 | 33.700 | 4.856 | 1892 | 0 | 149.000 | 1055.725 | 8.930 |
| mostly-waiting | 81.522 | 1100.020 | 13.928 | 606.868 | 3.016 | 0.000 | 0.000 | 4.679 | 0 | 0 | 0.000 | 0.000 | 0.000 |
| high-action | 32.175 | 1264.035 | 1022.372 | 406.958 | 1264.630 | 1091.119 | 467.957 | 5.548 | 25816 | 0 | 2061.900 | 15980.395 | 124.880 |
| high-reproduction | 24.484 | 3525.418 | 1336.964 | 1310.328 | 6.395 | 0.000 | 5.432 | 275.872 | 0 | 250 | 0.000 | 0.000 | 0.000 |

Interpretation:

- Mostly-waiting runs are much faster because no trades resolve and learned-state decay stays near zero.
- High-action runs make food scanning/resolution and trace capture/materialization first-class bottlenecks.
- High-reproduction runs spend more time in brain/input/plan/decay because population grows to the cap; reproduction attempt itself is measurable but not the largest cost.

## Market Input Construction

250-pop baseline market-feature timings:

| Feature family | Total ms | Calls |
| --- | ---: | ---: |
| market feature build | 366.651 | 50000 |
| cycle shape | 97.288 | 50000 |
| trend shape | 55.732 | 50000 |
| local signal stats | 38.330 | 21800 |
| volume/RSI wrapper | 22.976 | 50000 |
| rolling deltas | 18.514 | 50000 |
| signal history | 17.824 | 29200 |
| RSI signal | 16.292 | 50000 |
| rolling window stats | 10.839 | 50000 |

Founder-heavy early baseline versus evolved baseline:

| Sample | Warmup | Pop | Market resolves | Input cache hits | Input hit rate | Feature hits | Avg sample cache | Market input ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| early baseline | 0 | 250 | 50000 | 0 | 0.000 | 0 | 255.000 | 632.927 |
| evolved baseline | 1000 | 250 | 24439 | 200 | 0.008 | 0 | 250.650 | 360.091 |

Interpretation:

- Agents mostly have unique perception keys, so market-input cache reuse is extremely low.
- The feature-cache hit rate is also effectively zero in these samples.
- The largest feature family is cycle shape, followed by trend shape and local scale/history work.
- Sliding-window or prefix/ring-buffer summaries are plausible for local stats, signal history, cycle, and trend features, but they must preserve exact input values unless explicitly made approximate in a later plan.

## Brain Evaluation And Allocation

Direct brain microprofile after a 50-tick warmup:

| Population | Cached ms/eval | Fresh ms/eval | Cached plan lookup ms/eval | Hidden math ms/eval | Effective values ms/eval | Output math/array ms/eval | Fresh compile ms/eval |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.044 | 0.082 | 0.013 | 0.014 | 0.009 | 0.006 | 0.053 |
| 250 | 0.042 | 0.080 | 0.014 | 0.012 | 0.009 | 0.005 | 0.052 |
| 500 | 0.044 | 0.078 | 0.014 | 0.013 | 0.009 | 0.005 | 0.050 |

What the broad `brainEvaluation` bucket covers:

- job evaluation through the runner
- cached-plan lookup
- effective-value array construction
- hidden-state record-to-array conversion
- hidden layer math
- output math/output array allocation
- current-state/public DTO materialization

What required deeper profiling:

- the breakdown above inside `brain.ts`
- trace activation materialization, measured separately in `world.ts`

Allocation/GC evidence:

- The benchmark records `process.memoryUsage()` deltas, but heap deltas are noisy because GC is not forced.
- This milestone did not run an explicit `--trace-gc`, heap snapshot, or allocation timeline pass.
- Official Node docs support using the built-in V8 profiler, heap snapshots, GC traces, Linux `perf`, and flame graphs for deeper allocation analysis; this should be the next step only if a candidate implementation needs allocation proof.

Brain interpretation:

- Fresh plan compilation is clearly expensive, but production runtime already uses cached plans.
- Cached-plan lookup, hidden math, and effective-value array construction are the largest direct cached-eval subcosts.
- Hidden-state record-to-array and public DTO materialization are small in this direct profile.
- A flatter numeric brain plan may still help, but the stronger M2 evidence points first to learned-state decay, market-input reuse, and high-action food/trace costs.

## Food Resolution And Retention

High-action food costs:

| Population | Food resolve ms | Food trim ms | Avg pending | Avg retained | Avg due | Final horizon buckets |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 100 | 475.171 | 70.730 | 860.615 | 6542.665 | 52.145 | <=10: 2, <=25: 365 |
| 250 | 1264.630 | 266.514 | 2061.900 | 15980.395 | 124.880 | <=10: 16, <=25: 820, <=50: 4 |
| 500 | 2714.401 | 564.220 | 4088.180 | 31366.325 | 243.460 | <=10: 42, <=25: 1661, <=50: 33 |

Interpretation:

- In normal runs, food resolution is not a top bottleneck.
- In high-action runs, scanning retained foods every tick becomes a major bottleneck.
- Bucketing pending foods by `resolveTick` is high-value for high-action regimes.
- A retention queue/ring buffer could also reduce trimming cost.

Parity requirements for food bucketing:

- Preserve exact resolution tick.
- Preserve event ordering for foods due on the same tick.
- Preserve dead-creator policy and learning behavior.
- Preserve retained historical food visibility for UI/persistence.
- Preserve one-resolution-only semantics.

## Learning, Trace, And Reproduction

Measured costs:

- Learned-state decay is a top ordinary cost when agents have active learned deltas.
- Mostly-waiting runs show learned-state decay drops from `1170.527 ms` to `13.928 ms` at 250 population, which implies the cost is tied to non-empty learned state.
- High-action trace capture is expensive: `1091.119 ms` at 250 population.
- High-action trace activation materialization is also expensive: `467.957 ms` at 250 population.
- High-reproduction attempt cost is measurable: `275.872 ms` at 250 population with 250 births.

Interpretation:

- Sparse/no-op learned-state decay is one of the strongest candidates.
- Trace capture/materialization should be optimized for high-action scenarios.
- Reproduction/mutation can spike, but it is not the top cost unless the run is explicitly birth-heavy.

Parity requirements:

- Learned-state decay must preserve exact decay, clamping, learned-delta keys, and reproduction-learning counts.
- Trace capture must preserve learning inputs, active connection IDs, activation maps, action labels, and strength.
- Reproduction optimization must preserve inheritance of effective genomes, mutation order, RNG order, child IDs, lineage IDs, event order, and snapshots.

## Parallelism, WASM, Native, And Cloud

Primary/official sources used:

- Node profiling: https://nodejs.org/en/docs/guides/simple-profiling/
- Node flame graphs/perf: https://nodejs.org/en/docs/guides/diagnostics-flamegraph/
- Node heap snapshots: https://nodejs.org/en/docs/guides/diagnostics/memory/using-heap-snapshot
- Node GC traces: https://nodejs.org/en/learn/diagnostics/memory/using-gc-traces
- Node worker threads: https://nodejs.org/api/worker_threads.html
- Node N-API/native addons: https://nodejs.org/api/n-api.html
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- MDN structured clone: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
- WebAssembly JS API/memory: https://webassembly.org/getting-started/js-api/
- WebAssembly specs: https://webassembly.org/specs/
- Rust wasm target: https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html
- wasm-bindgen guide: https://wasm-bindgen.github.io/wasm-bindgen/

Browser workers:

- Prior browser-worker reports show sync still beats 4-worker parallel through 1000 population.
- M2 direct brain evaluation is too small per agent, about `0.04 ms`, to justify per-agent worker sharding with the current payload shape.
- Browser workers remain diagnostic unless payload economics change.

Node workers:

- Per-tick brain sharding is not the best next target.
- Whole-run Node worker/process isolation remains useful for API responsiveness, as concluded in M1.

WASM/Rust/native:

- Worth considering only for a narrow kernel with compact typed-array inputs.
- The current full tick loop is object-heavy and touches mutation, learning, event, food, and UI-facing state; moving that wholesale would duplicate semantics and raise parity risk.
- Candidate native/WASM kernels would need to be narrow: brain math, possibly market-feature rolling summaries, not the whole simulation.

Cloud:

- Still not recommended as the next move.
- More cores will not help without parallelizable kernels.
- Faster single-core CPU may help, but local M2 evidence says code-path optimization is still more actionable than renting hardware.

## Candidate Matrix

| Candidate | Targeted bottleneck | Expected speedup | Evidence | Parity risk | Complexity | Browser | Headless | Cloud relevance | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sparse/no-op learned-state decay | learned-state decay | major | high | medium | medium | high | high | low | first implementation candidate |
| Food resolve buckets by `resolveTick` | high-action food resolution | major in high-action, minor normal | high | medium | medium | high | high | low | implement after decay or alongside high-action work |
| Food retention queue/ring | high-action trimming | moderate in high-action | high | medium | medium | high | high | low | pair with food buckets |
| Market feature rolling/prefix summaries | market input construction | moderate | high | medium-high | medium-high | high | high | low | plan carefully with golden input parity |
| Perception-key reuse/canonicalization | market input cache misses | moderate/unknown | high cache-miss evidence | medium | medium | high | high | low | investigate exact-value-safe reuse only |
| Trace capture/materialization slimming | high-action trace cost | moderate-high in high-action | high | medium-high | medium | high | high | low | high-action follow-up candidate |
| More cached-plan brain optimization | brain evaluation | moderate | high | medium | medium | high | high | low | useful but not first after M2 |
| Typed-array brain kernel | brain math/effective values | unknown/moderate | medium | high | high | high | high | medium | defer until JS candidates exhausted |
| Browser brain worker sharding | brain evaluation | low/negative current | high prior evidence | medium | high | high | low | low | do not pursue now |
| Node per-tick brain worker sharding | brain evaluation | unknown/low | medium | medium | high | low | high | low | do not pursue before payload redesign |
| Whole-run backend worker/process | API responsiveness | responsiveness-only major | high from M1 | low-medium | medium | n/a | high | low | separate responsiveness plan, not speed plan |
| DB writer worker | DB/write | low speed | high from M1/DB report | low-medium | medium | low | medium | low | do not pursue for speed |
| Post-run materialized analysis | analysis queries | minor speed, UI convenience | medium | low | medium | medium | high | low | defer; not advance-time speed |
| WASM/Rust/native numeric kernel | narrow math kernel | unknown | low-medium | high | high | high | high | medium | defer until a narrow kernel is chosen |
| Cloud high-single-core CPU | whole JS runtime | unknown | low | low | medium | n/a | high | medium | benchmark only after local optimizations |
| Cloud multi-core | parallel kernels | low now, moderate later | low | low | medium | n/a | high | high | defer until parallelism exists |

Not worth pursuing now:

- Browser brain worker sharding.
- DB writer worker for speed.
- Cloud migration/rental as the primary speed strategy.
- Whole-simulation WASM/native rewrite.

## First Implementation Plan To Write Next

Write a plan for:

1. sparse/no-op learned-state decay
2. high-action food resolve/retention indexing
3. exact-value-safe market-feature summary reuse
4. high-action trace capture/materialization slimming

Keep backend worker/process isolation separate as a responsiveness plan, not a core simulation-speed plan.

## Verification

Commands run after instrumentation changes:

```bash
npm run check
npm run test:sine
```

Both passed. `npm run build` was not run because this milestone did not touch UI/browser source; it added benchmark-only scripts and optional runtime instrumentation.

## Milestone 2 Gate Audit

- Simulation architecture research report exists: this document.
- Phase-level timings identify dominant tick-loop phases: baseline and scenario tables above.
- Market input costs are measured: cache counters, feature-family timings, early/evolved comparison.
- Brain evaluation costs are measured: broad tick bucket plus direct cached/fresh internal microprofile.
- Food handling costs are measured: pending/retained/due counts, resolution/trimming timing, high-action horizon buckets.
- Learning/trace/reproduction costs are measured: decay, trace capture/materialization, reproduction attempt, births.
- Allocation/GC evidence is recorded at a basic memory-delta level; deeper GC/heap profiling is explicitly deferred and linked to official tooling.
- Web research is tied back to measured hot paths.
- Final matrix ranks backend and simulation candidates by speedup, evidence, parity risk, and complexity.
- The report identifies the highest-confidence implementation candidates.
