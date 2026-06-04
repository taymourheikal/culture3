# Sine Brain Hot-Path And Worker Payload Milestone 2 Report

Recorded on June 2, 2026.

Milestone 2 goal: add a compact browser-worker brain-evaluation protocol foundation, including compact request payloads, compact response payloads, bounded worker caches, parity tests, browser-worker parity, and payload proxy-size evidence, without enabling automatic live parallelism.

## What Changed

- Added compact protocol DTOs in `src/sine/protocol/brainEvalProtocol.ts`.
- Added `src/sine/spawner/compactBrainEvaluation.ts` as the shared serializer/materializer boundary for compact jobs and compact results.
- Added `materializeBrainEvaluationFromRuntimeArrays()` in `src/sine/spawner/brain.ts` so compact responses materialize through the same runtime-array materializer pattern as sync evaluation.
- Added `createCompactSyncBrainEvaluationRunner()` in `src/sine/spawner/brainEvaluationRunner.ts` for explicit tests/benchmarks.
- Added `buildCompactBrainEvaluationJobs()` in `src/sine/spawner/worldBrainEvaluation.ts` as a companion helper from the existing `SpawnerTickContext`.
- Extended `src/sine/worker/brainEval.worker.ts` to handle `protocol: "compact"` requests and return compact results.
- Extended `src/sine/worker/brainEvalPool.ts` with explicit `protocol: "compact"` config, compact per-worker send-key caching, compact result materialization against original source jobs, and fallback behavior shared with object mode.
- Updated browser parity and browser perf scripts to include explicit compact-worker paths.
- Added compact parity, trace materialization, stale/missing/failed/out-of-order, and cache resend tests in `scripts/sine-tests/brainEvaluation.test.ts`.
- Added payload proxy-size rows to `scripts/sinePerf.ts`.

The compact worker path still calls the shared brain evaluator. It does not add worker-only GRU-like math. First-send compact jobs still include the full genome so the worker can reuse the existing evaluator; subsequent cached compact jobs omit the genome and compact genome payload. This preserves architecture while making the request/response protocol measurable before any enablement decision.

## Commands

```bash
npm run check
npm run test:sine
npm run build
npm run test:sine:browser-parity
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineBrowserPerf.ts --populations 100 --advance-ticks 20 --worker-counts 4 --timeout-ms 60000
```

All commands passed on the final code.

## Payload Proxy Sizes

From `npx tsx scripts/sinePerf.ts`:

| Population | Object Request KB | Compact First Request KB | Compact Cached Request KB | Object Response KB | Compact Response KB |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 1858.70 | 3403.49 | 687.28 | 51.45 | 90.25 |
| 250 | 4674.62 | 8645.44 | 1740.70 | 129.23 | 225.76 |
| 500 | 9349.18 | 17357.25 | 3491.93 | 258.49 | 451.85 |

Interpretation:

- Cached compact requests are much smaller than object requests.
- First-send compact requests are currently larger because they carry both the backing genome and compact genome descriptors.
- Compact responses are currently larger because they include clone-safe runtime trace state to preserve Milestone 1 trace materialization after `postMessage`.
- These measurements support keeping compact mode explicit/test-only until Milestone 3 benchmarks the full browser request/response/materialization path.

## Browser Worker Evidence

`npm run test:sine:browser-parity` passed at `500 pop / 40 ticks` for both:

- object browser worker path
- compact browser worker path

Small browser perf smoke:

| Row | Time |
| --- | ---: |
| browser sync advance 100 pop / 20 ticks | 136.40 ms |
| browser parallel 4 workers advance 100 pop / 20 ticks | 310.60 ms |
| browser compact parallel 4 workers advance 100 pop / 20 ticks | 392.40 ms |

Interpretation: this smoke only verifies the benchmark path and reinforces that compact workers should not be enabled automatically yet.

## Functional Parity Evidence

New/updated contract coverage includes:

- `Compact Job Serialization And Response Materialization Match Object Evaluation`
- `Compact Response Materialization Preserves Trace Activation Materializer`
- `Compact Runner Matches Sync Parity With Out Of Order Results`
- `Compact Async Stale Result Fails Before Decision Mutation`
- `Compact Async Missing Result Fails Before Decision Mutation`
- `Compact Async Failed Result Fails Before Decision Mutation`
- `Compact Brain Eval Pool Resends Evicted Genome Payloads`
- `Compact Brain Eval Pool Resends Genome Payload After Failed Shard`

The full Sine suite passed after these tests were added.

## Milestone 2 Exit-Gate Status

- Compact payload implementation exists and automatic live parallelism remains disabled: passed.
- Object and compact worker paths produce identical results in tests and browser parity: passed.
- Sync sidecar, object worker, compact request, and compact response paths are covered by parity fixtures: passed.
- Compact worker responses rebuild Milestone 1 trace-materialization behavior without relying on `WeakMap` crossing `postMessage`: passed.
- Cache size and invalidation behavior are tested through bounded cache, signature, eviction, failure, and resend tests: passed.
- No duplicate worker-only GRU math exists: passed; compact mode calls the shared evaluator/materializer.
- Structured-clone/proxy payload size is measured before enablement decisions: passed.
- No world, UI, or persistence code needs to understand compact serialization internals: passed; compact serialization stays in the protocol/domain boundary and runner/worker layers.

## Notes For Milestone 3

- Cached compact request size is promising.
- Compact first-send request and compact response size are not yet promising.
- Milestone 3 should separate request posting, worker compute, response transfer, and response materialization time before considering any threshold.
- The current result argues against enabling compact workers until the full browser path is faster than sync at a measured population threshold.
