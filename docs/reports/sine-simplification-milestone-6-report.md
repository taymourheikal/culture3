# Sine Simplification Milestone 6 Report

Milestone: `docs/plans/sine-simplification-performance-plan.md` Milestone 6.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sineSmoke.ts
npx tsx scripts/sineBrowserParity.ts
npx tsx scripts/sineBrowserPerf.ts --populations 100,250,500 --advance-ticks 200 --worker-counts 4
npx tsx scripts/sineBrowserPerf.ts --populations 1000 --advance-ticks 200 --worker-counts 4 --timeout-ms 120000
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineHeadless.ts --run-id milestone6-headless --ticks 500 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 100 --db data/milestone6-headless.sqlite
npx tsx scripts/sineHeadless.ts --run-id milestone6-ui-smoke --ticks 20 --seed 101 --market-source generated --initial-spawners 5 --max-spawners 5 --minimum-resolved-trades 0 --chunk-ticks 10 --checkpoint-interval-ticks 10
```

All commands completed successfully. `scripts/sineSmoke.ts` exited with code `0`. A direct Playwright Runs-tab smoke also passed for the completed `milestone6-ui-smoke` headless run.

## Changes

- `scripts/sineBrowserPerf.ts` now accepts `--populations`, `--advance-ticks`, `--worker-counts`, and `--timeout-ms` so Milestone 6 can attempt a bounded 1000-pop browser benchmark without changing production worker behavior.
- `scripts/sineHeadless.ts` now accepts `--chunk-ticks` and `--checkpoint-interval-ticks`, forwards them to the existing headless runner, and prints the existing timing snapshot. This is CLI/reporting output only; headless runtime semantics are unchanged.
- No production worker protocol, headless engine, brain engine, uniqueness engine, or persistence contract was added.

## Browser Parallelism Decision

Browser perf measured real Chromium sync and real 4-worker parallel paths.

| Benchmark | 100 pop | 250 pop | 500 pop | 1000 pop |
| --- | ---: | ---: | ---: | ---: |
| Browser sync advance, 200 ticks | 1427.2 ms | 3492.8 ms | 7124.0 ms | 14280.2 ms |
| Browser parallel 4 workers, 200 ticks | 1913.3 ms | 4300.4 ms | 8618.3 ms | 17100.6 ms |

Parallel remains slower at every measured population, including the bounded 1000-pop attempt. The browser-worker parity check still passed at `500 pop / 40 ticks`.

Decision: keep browser brain parallelism conservative/disabled. `src/sine/worker/brainEvalConfig.ts` still sets `MIN_PARALLEL_BRAIN_EVAL_JOBS = Number.POSITIVE_INFINITY`, and UI mode surfaces continue to report the effective brain-evaluation mode through stats packets.

## Live Runtime Timing

`npx tsx scripts/sinePerf.ts`, final Milestone 6 pass:

| Benchmark | 100 pop | 250 pop | 500 pop |
| --- | ---: | ---: | ---: |
| Pure advance, 200 ticks | 1825.9 ms | 4462.8 ms | 9022.0 ms |
| Async sync-runner advance, 200 ticks | 1653.6 ms | 4279.2 ms | 8771.6 ms |
| Node parallel-pool fallback, 200 ticks | 1629.0 ms | 4221.5 ms | 8724.6 ms |
| RNN cached plan | 3.341 ms | 8.117 ms | 17.209 ms |
| RNN fresh plan | 6.494 ms | 16.629 ms | 34.512 ms |
| Persistence packet build | 34.0 ms | 84.5 ms | 170.1 ms |
| Uniqueness compute | 30.6 ms | 64.9 ms | 137.2 ms |
| Chart + roster + stats packets | 3.8 ms | 5.8 ms | 6.2 ms |

Node parallel-pool rows are fallback rows only because `browserWorkerApiAvailable` was `false`.

## Headless Timing Impact

Measured with the same representative generated run shape used in Milestone 4:

- seed: `101`
- target ticks: `500`
- initial/max population: `100 / 100`
- chunk size: `100`
- checkpoint interval: `100`
- minimum resolved trades: `1`

| Timing | Milestone 4 post-batching | Milestone 6 |
| --- | ---: | ---: |
| Run time | 6215.5 ms | 4557.6 ms |
| Advance total | 6145.9 ms | 4497.0 ms |
| Recorder event time | 16.9 ms | 12.8 ms |
| DB/write time | 48.3 ms | 41.5 ms |
| Sink enqueue time | not separated in report total | 1.3 ms |
| Sink flush time | not separated in report total | 40.2 ms |
| Sink writes/enqueues | 5031 | 5031 |
| Sink flushes | 7 | 7 |

Latest chunk comparison:

| Latest chunk timing | Milestone 4 post-batching | Milestone 6 |
| --- | ---: | ---: |
| Chunk ms | 1212.4 ms | 895.7 ms |
| Advance ms | 1206.7 ms | 890.9 ms |
| Recorder ms | 4.4 ms | 3.4 ms |
| DB/write ms | 5.9 ms | 4.9 ms |
| Core estimate ms | 1202.3 ms | 887.5 ms |
| Ticks/sec | about 82.5 | 111.6 |

The headless speedup came from the shared brain/runtime path improved in Milestone 5. Recorder and DB/write work remained small after Milestone 4 batching.

The measurement run was reopened through the headless repository facade and analysis queries:

- run status: `completed`
- tick: `500`
- row counts: `runs 1`, `agents 102`, `events 106`, `trades 1527`, `snapshots 78`, `metrics 74`, `checkpoints 6`
- analysis smoke: agent leaderboard, lineage leaderboard, event timeline, and trade breakdown returned rows.

A smaller default-DB run, `milestone6-ui-smoke`, was created and then opened through the app's Runs tab with Playwright. The page showed the completed run ID and headless experiment panel.

## Fresh-Plan Usage Audit

Search:

```bash
rg "useCachedPlan\\s*:\\s*false|useCachedPlan: false" src/sine scripts -n
```

Results:

- `scripts/sinePerf.ts`: fresh-plan benchmark only.
- `scripts/sine-tests/genomeRuntime.test.ts`: cached/fresh parity test only.

No production runtime path depends on fresh-plan evaluation. The fresh-plan slowdown remains accepted because cached-plan RNN and full runtime improved, and `scripts/sinePerf.ts` keeps measuring fresh-plan timing so the tradeoff stays visible.

## Cleanup And Architecture Audit

No transitional wrapper was removed in this milestone. The search-driven audit did not find an old helper that solely forwards to a new helper and can be safely deleted without touching stable public APIs.

Kept stable entry points:

- `forwardSpawner`, `evaluateSpawnerBrain`, and `evaluateSpawnerBrainPure` remain public brain/runtime entry points.
- `createEffectiveBrainValues` remains the object-based effective-value path for inspection, inheritance, uniqueness, and non-plan code.
- `createPlanAlignedEffectiveBrainValues` remains the plan-indexed hot-path materializer.
- Server routes still use one headless repository facade.
- The live worker still uses one simulation engine through `advanceSimulationToTargetAsync`; headless uses the same simulation runtime through `advanceSimulationToTarget`.

Audit searches found:

- no second brain engine
- no second uniqueness engine
- no second headless simulation engine
- no parallel persistence contract
- no long-lived effective-array cache
- bounded worker plan/genome caches remain in the worker path

## Remaining Work Outside This Parity Plan

- Browser parallelism should not be expanded unless a future payload/serialization redesign changes the economics and re-benchmarks show a real crossover.
- Cluster-aware uniqueness remains future semantic analysis work, not part of this parity-preserving simplification plan.
- Seed-bank market-regime analysis remains future semantic/product work.
- A later hot-path audit can reassess whether JS is still the right execution target or whether WASM/Rust/native addon work is justified.

## Plan Result

The simplification plan produced measurable side-cost and core-runtime improvements while preserving functional parity. The largest final runtime lesson is that reducing per-agent synchronous work beat adding browser-worker parallelism for the current payload shape and population range.
