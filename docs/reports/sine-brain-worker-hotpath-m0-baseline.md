# Sine Brain Hot-Path And Worker Payload Milestone 0 Baseline

Recorded on June 2, 2026.

Milestone 0 goal: capture the current runtime, trace-fallback cost, and parity fixtures before changing brain evaluation internals or the browser-worker payload protocol.

## Commands

```bash
npm run test:sine
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineBrowserPerf.ts --populations 100,250,500 --advance-ticks 200 --worker-counts 4
npx tsx scripts/sineBrowserPerf.ts --populations 1000 --advance-ticks 200 --worker-counts 4 --timeout-ms 120000
npx tsx scripts/sineHeadless.ts --run-id brain-worker-baseline --ticks 500 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 100 --db data/brain-worker-baseline.sqlite
npx tsx scripts/sineBrowserParity.ts
npm run check
npm run build
```

## Node Runtime Baseline

`npx tsx scripts/sinePerf.ts`

Settings:
- generated market runtime defaults
- `advanceTicks: 200`
- `initialSpawners = maxSpawners = population`
- `uniquenessPopulationLimit: 1000`

| Row | Population | Ticks | Avg ms | Notes |
| --- | ---: | ---: | ---: | --- |
| pure advance | 100 | 200 | 1776.963 | sync runtime |
| pure advance | 250 | 200 | 4410.447 | sync runtime |
| pure advance | 500 | 200 | 8908.459 | sync runtime |
| async sync-runner advance | 100 | 200 | 1651.326 | async path with sync runner |
| async sync-runner advance | 250 | 200 | 4284.391 | async path with sync runner |
| async sync-runner advance | 500 | 200 | 8827.478 | async path with sync runner |
| parallel-pool advance | 100 | 200 | 1669.711 | Node fallback, `browserWorkerApiAvailable: false` |
| parallel-pool advance | 250 | 200 | 4282.813 | Node fallback, `browserWorkerApiAvailable: false` |
| parallel-pool advance | 500 | 200 | 8791.268 | Node fallback, `browserWorkerApiAvailable: false` |

Node parallel-pool rows are not browser-worker evidence. They fell back to sync because `globalThis.Worker` was unavailable in Node.

## Brain-Only Baseline

`npx tsx scripts/sinePerf.ts`

Settings:
- generated market runtime defaults
- simulation advanced to tick 50 before input capture
- 20 iterations per row

| Row | Population | Avg ms | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: |
| RNN evaluate cached plan | 100 | 3.512 | 3.391 | 4.256 |
| RNN evaluate fresh plan | 100 | 6.926 | 6.723 | 7.919 |
| RNN evaluate cached plan | 250 | 8.560 | 8.406 | 8.990 |
| RNN evaluate fresh plan | 250 | 16.757 | 16.816 | 17.736 |
| RNN evaluate cached plan | 500 | 17.662 | 17.769 | 18.366 |
| RNN evaluate fresh plan | 500 | 34.498 | 33.974 | 36.036 |

## Trace-Fallback Baseline

`npx tsx scripts/sinePerf.ts`

The trace instrumentation is gated behind `SpawnerAdvanceOptions.traceInstrumentation`. It records counters only when explicitly passed by benchmark code.

| Scenario | Population | Ticks | Avg ms | Evaluated agents | Wait | Long | Short | Reproduction traces | Fallback evals | Fallback ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mostly waiting | 250 | 200 | 2170.537 | 50000 | 50000 | 0 | 0 | 0 | 0 | 0 |
| high action | 250 | 200 | 5718.857 | 27062 | 1246 | 7030 | 18786 | 0 | 25816 | 1066.205 |

Observations:
- Mostly-waiting agents create no trace fallback work.
- High-action agents trigger one fallback evaluation per long/short action.
- In the high-action run, fallback trace recomputation was material: `1066.205 ms`, close to first-pass brain timing for that same run (`1105.979 ms`).

## Browser Web Worker Baseline

`npx tsx scripts/sineBrowserPerf.ts --populations 100,250,500 --advance-ticks 200 --worker-counts 4`

| Row | Population | Ticks | ms |
| --- | ---: | ---: | ---: |
| browser sync advance | 100 | 200 | 1419.500 |
| browser parallel 4 workers advance | 100 | 200 | 1930.900 |
| browser sync advance | 250 | 200 | 3544.900 |
| browser parallel 4 workers advance | 250 | 200 | 4232.600 |
| browser sync advance | 500 | 200 | 7175.100 |
| browser parallel 4 workers advance | 500 | 200 | 8463.600 |

`npx tsx scripts/sineBrowserPerf.ts --populations 1000 --advance-ticks 200 --worker-counts 4 --timeout-ms 120000`

| Row | Population | Ticks | ms |
| --- | ---: | ---: | ---: |
| browser sync advance | 1000 | 200 | 14159.900 |
| browser parallel 4 workers advance | 1000 | 200 | 16946.000 |

Observations:
- Current browser object-payload workers are slower than browser sync at 100, 250, 500, and 1000 population.
- The 1000-pop attempt completed before the configured `120000 ms` timeout.
- These are browser Web Worker results and should not be generalized to Node worker threads, WASM, Rust, or native addons.

## Headless JS Baseline

`npx tsx scripts/sineHeadless.ts --run-id brain-worker-baseline --ticks 500 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 100 --db data/brain-worker-baseline.sqlite`

Settings:
- `runId: brain-worker-baseline`
- `seed: 101`
- generated market source
- `targetTicks: 500`
- `initialSpawners: 100`
- `maxSpawners: 100`
- `chunkTicks: 100`
- `checkpointIntervalTicks: 100`
- `minimumResolvedTrades: 1`
- DB: `data/brain-worker-baseline.sqlite`

Timing:
- `runMs: 4506.636`
- `simulatedTicks: 500`
- `advanceTotalMs: 4443.712`
- `recorderEventMs: 12.663`
- `recorderEventCount: 3022`
- `recorderFounderMs: 12.183`
- `recorderFinalizeMs: 0.085`
- `checkpointMs: 0.471`
- `sinkWriteMs: 44.733`
- `sinkWrites: 5031`
- `sinkEnqueueMs: 1.326`
- `sinkFlushMs: 43.406`
- `sinkFlushes: 7`
- `sinkBufferedRows: 5031`
- latest chunk core estimate: `909.353 ms`
- latest chunk ticks/sec: `108.922`
- top sink method: `writeTrade`, `3018 calls`, `0.695 ms`

Row counts:
- runs: `1`
- agents: `102`
- events: `106`
- trades: `1527`
- snapshots: `78`
- metrics: `74`
- checkpoints: `6`

## Parity And Verification

`npm run test:sine`
- Passed.
- Added baseline fixtures:
  - `Compact Evaluation Preserves Trace Fallback Source State`
  - `Learned Delta Fixture Covers Clamping And Precision Sensitive Values`
- Existing async stale/missing/failed/out-of-order worker-result tests still pass.

`npx tsx scripts/sineBrowserParity.ts`
- Passed: browser brain worker parity at `500 pop / 40 ticks`.

`npm run check`
- Passed.

`npm run build`
- Passed.

## Milestone 0 Exit-Gate Status

- Cached-plan and fresh-plan RNN timings recorded at 100, 250, and 500 population: passed.
- Pure advance and async sync-runner timings recorded at 100, 250, and 500 population: passed.
- Browser sync and browser 4-worker parallel timings recorded at 100, 250, 500, and 1000 population: passed.
- Headless timing records run time, advance time, recorder time, DB/write time, core estimate, ticks/sec, and row counts: passed.
- Node parallel-pool rows explicitly labeled as fallback when `browserWorkerApiAvailable` is false: passed.
- Baseline notes distinguish browser Web Worker results from headless Node JS results: passed.
- Trace fallback instrumentation distinguishes first-pass evaluation from fallback evaluation: passed.
- Trace counts include evaluated agents, wait, long, short, reproduction traces, fallback evaluations, and fallback milliseconds: passed.
- Mostly-waiting and high-action trace runs measured: passed.
- Worker payload parity fixtures strengthened before compact-payload implementation: passed.
- Browser-worker parity passes at representative population: passed.
- No production runtime behavior change is intended; instrumentation is opt-in through benchmark options and normal callers do not pass it: passed.
