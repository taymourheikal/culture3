# Sine Brain Hot-Path And Worker Payload Milestone 3 Report

Recorded on June 2, 2026.

Milestone 3 goal: decide whether compact browser-worker brain evaluation is fast enough to enable automatically, after measuring cold cache, warmed cache, genome churn, response transfer, response materialization, and trace materialization.

## What Changed

- Added optional worker compute timing to `BrainEvalWorkerResponse`.
- Added optional runner transport stats to `BrainEvaluationRunnerStats`.
- Instrumented `src/sine/worker/brainEvalPool.ts` to report:
  - batch wall time
  - request payload proxy KB
  - response payload proxy KB
  - request `postMessage()` time
  - worker compute time
  - result materialization time
  - estimated transport/wait time
  - object genome sends/cache hits
  - compact genome sends/cache hits
- Extended `scripts/sineBrowserPerf.ts` with benchmark scenarios:
  - `fixed`
  - `normal-churn`
  - `high-churn`
  - `high-action`
- Kept automatic live parallelism disabled by leaving `MIN_PARALLEL_BRAIN_EVAL_JOBS = Infinity`.

The instrumentation is observational. It does not change reward, learning, mutation, action selection, genome evaluation, or worker result application.

## Commands

```bash
npx tsx scripts/sineBrowserPerf.ts --populations 100,250,500,1000 --advance-ticks 200 --worker-counts 4 --scenarios fixed --timeout-ms 240000
npx tsx scripts/sineBrowserPerf.ts --populations 250 --advance-ticks 100 --worker-counts 4 --scenarios normal-churn,high-churn --timeout-ms 180000
npx tsx scripts/sineBrowserPerf.ts --populations 100 --advance-ticks 500 --worker-counts 4 --scenarios fixed --timeout-ms 180000
npx tsx scripts/sineBrowserPerf.ts --populations 250 --advance-ticks 100 --worker-counts 4 --scenarios high-action --timeout-ms 180000
```

Verification commands are listed at the end of this report.

## Fixed-Population Browser Results

Command:

```bash
npx tsx scripts/sineBrowserPerf.ts --populations 100,250,500,1000 --advance-ticks 200 --worker-counts 4 --scenarios fixed --timeout-ms 240000
```

| Population | Sync ms | Object Worker ms | Compact Worker ms | Decision |
| ---: | ---: | ---: | ---: | --- |
| 100 | 1645.1 | 2455.9 | 3950.3 | sync wins |
| 250 | 4168.5 | 5801.3 | 9911.0 | sync wins |
| 500 | 8616.1 | 11824.8 | 19870.0 | sync wins |
| 1000 | 17259.7 | 24050.6 | 39725.8 | sync wins |

Compact worker did not beat sync at any tested population. It also did not beat the object-worker path.

### Fixed-Population Transport Summary

| Population | Mode | Jobs | Request KB | Response KB | Worker Compute ms | Materialization ms | Transport/Wait ms | Genome Sends | Cache Hits |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | object | 20000 | 141839.0 | 10355.4 | 744.6 | 0.3 | 716.0 | 100 | 19900 |
| 100 | compact | 20000 | 137577.5 | 18032.6 | 848.1 | 373.4 | 1717.2 | 100 | 19900 |
| 250 | object | 50000 | 361450.6 | 25926.1 | 1832.7 | 0.3 | 1520.2 | 250 | 49750 |
| 250 | compact | 50000 | 349811.2 | 44504.3 | 2107.3 | 1006.4 | 4248.5 | 250 | 49750 |
| 500 | object | 100000 | 727810.8 | 51809.6 | 3656.1 | 0.6 | 3251.6 | 500 | 99500 |
| 500 | compact | 100000 | 703551.7 | 88983.6 | 4163.9 | 2044.2 | 8463.9 | 500 | 99500 |
| 1000 | object | 200000 | 1461256.5 | 103765.8 | 7135.6 | 0.6 | 6376.3 | 1000 | 199000 |
| 1000 | compact | 200000 | 1412835.1 | 178164.6 | 8365.9 | 4174.5 | 16677.3 | 1000 | 199000 |

Interpretation:

- Compact warmed-cache requests are smaller than object-worker requests.
- Compact responses are much larger.
- Compact result materialization adds substantial main-thread time.
- Worker compute is also slightly higher for compact because compact jobs have to rematerialize learned state and hidden records before using the shared evaluator.
- Transport/wait dominates enough that compact does not recover the savings from smaller cached requests.

## Cache Warmup And Churn

### Longer Warmed-Cache Run

Command:

```bash
npx tsx scripts/sineBrowserPerf.ts --populations 100 --advance-ticks 500 --worker-counts 4 --scenarios fixed --timeout-ms 180000
```

| Mode | ms | Final Population | Genome Sends | Cache Hits | Request KB | Response KB | Materialization ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sync | 4196.9 | 98 | n/a | n/a | n/a | n/a | n/a |
| object worker | 6018.1 | 98 | 102 | 49777 | 360739.8 | 25857.0 | 0.3 |
| compact worker | 9974.1 | 98 | 102 | 49777 | 345434.6 | 45456.6 | 1023.7 |

Even after 500 ticks, compact stayed slower. Cache warmup was not enough to overcome response and materialization costs.

### Normal And High Churn

Command:

```bash
npx tsx scripts/sineBrowserPerf.ts --populations 250 --advance-ticks 100 --worker-counts 4 --scenarios normal-churn,high-churn --timeout-ms 180000
```

| Scenario | Mode | ms | Final Population | Genome Sends | Cache Hits | Request KB | Response KB | Materialization ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| normal-churn | sync | 2921.2 | 337 | n/a | n/a | n/a | n/a | n/a |
| normal-churn | object worker | 4082.0 | 337 | 464 | 33149 | 246067.7 | 17419.4 | 0.2 |
| normal-churn | compact worker | 6822.0 | 337 | 464 | 33149 | 242250.3 | 29058.2 | 662.6 |
| high-churn | sync | 8357.8 | 500 | n/a | n/a | n/a | n/a | n/a |
| high-churn | object worker | 11343.9 | 500 | 947 | 48699 | 396739.6 | 25552.3 | 0.2 |
| high-churn | compact worker | 15215.7 | 500 | 947 | 48699 | 383114.4 | 42962.2 | 1214.8 |

Churn did not make compact workers competitive. New genomes increased sends in both worker modes, but compact still lost mostly through response size, materialization, and transport/wait time.

## High-Action Trace Behavior

Command:

```bash
npx tsx scripts/sineBrowserPerf.ts --populations 250 --advance-ticks 100 --worker-counts 4 --scenarios high-action --timeout-ms 180000
```

| Mode | ms | Action Count | Optimized Trace Materializations | Fallback Trace Evaluations | Trace ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| sync | 3158.2 | n/a | n/a | n/a | n/a |
| object worker | 4521.7 | 17119 | 0 | 17119 | 627.1 fallback ms |
| compact worker | 5528.6 | 17119 | 17119 | 0 | 258.6 optimized ms |

Compact preserves the Milestone 1 optimized trace materialization path after browser-worker `postMessage`. Object-worker results still lose the sidecar and fall back to full trace evaluation. That is a real behavioral-performance advantage for compact responses, but the total compact worker path is still slower.

## Threshold Decision

`MIN_PARALLEL_BRAIN_EVAL_JOBS` remains `Infinity`.

Reasons:

- Compact worker did not beat browser sync at 100, 250, 500, or 1000 fixed-pop agents.
- Compact worker did not beat browser sync after warmed-cache amortization.
- Compact worker did not beat browser sync under normal churn or high churn.
- Compact worker did preserve optimized high-action trace materialization, but total compact-worker time still lost to sync and object worker.
- Compact result materialization and response/transport overhead are currently decisive costs.

## Milestone 3 Exit-Gate Status

- Browser benchmarks report full advance time at 100, 250, 500, and 1000 population: passed.
- Worker responses include shard compute timing: passed.
- Benchmarks report batch count, wall time, compute time, request/response payload proxy size, materialization time, estimated transport/wait, fallback/disabled batches, and cache sends/hits: passed.
- Cold/warmed cache behavior is represented through genome sends/cache hits and last-batch stats: passed.
- High-action trace behavior reports optimized materialization versus fallback recomputation: passed.
- Node fallback results are not used as browser-worker evidence: passed; all Milestone 3 timing evidence above is browser-based.
- Cache warmup, normal churn, high churn, and longer amortization scenarios are measured: passed.
- Compact workers are not enabled because they do not beat sync under the required scenarios: passed.
- Object-worker results remain a comparison baseline only: passed.

## Notes For Milestone 4

- Compact worker protocol has diagnostic value because it preserves optimized trace materialization across `postMessage`, but it does not currently justify production auto-selection.
- Milestone 4 should either keep compact worker mode explicitly diagnostic/test-only or remove production-facing compact selection plumbing.
- If compact remains, documentation should state that sync remains the measured default and compact is retained only for parity/perf investigation.

## Verification

```bash
npm run check
npm run test:sine
npm run build
npm run test:sine:browser-parity
```

All verification commands passed.
