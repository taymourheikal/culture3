# Sine Exact-Parity Runtime Speedup M10 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 10.

## Summary

Milestone 10 made headless chunk-size behavior explicit by execution mode without changing simulation semantics.

The implementation keeps the existing direction from the M1 backend report:

- API/headless interactive mode prioritizes progress and cancel responsiveness with small chunks.
- Pure CLI/headless throughput mode uses larger chunks to reduce yield/flush overhead.
- Benchmark mode stays explicitly configured by benchmark scripts.

No simulation loop semantics changed. The same `runHeadlessSineExperiment()` engine still owns execution; this milestone only centralizes chunk policy and makes the effective API chunk size visible in job DTOs.

## Implementation

Changed files:

- `src/sine/headless/chunkPolicy.ts`
- `src/sine/headless/runner.ts`
- `src/sine/headless/headlessApi.ts`
- `server/sineHeadlessJobs.mjs`
- `scripts/sineHeadless.ts`
- `scripts/sineApiLatencyBenchmark.ts`
- `scripts/sine-tests/headless.test.ts`

Policy constants:

| Mode | Default | Cap | Use |
| --- | ---: | ---: | --- |
| interactive/API | `25` ticks | `100` ticks | Runs tab/server jobs where progress/cancel responsiveness matters |
| throughput/CLI | `1000` ticks | none | pure headless CLI/default runner path |
| benchmark | explicit | none | benchmark scripts choose exact values |

Key changes:

- Added `sanitizeHeadlessChunkTicks()` as the shared chunk-size sanitizer.
- Server job sanitization uses interactive defaults and cap.
- `startSineHeadlessJob()` also applies the interactive policy for direct server-module callers.
- Headless runner uses throughput defaults when no caller supplies `chunkTicks`.
- CLI default now references `HEADLESS_THROUGHPUT_CHUNK_TICKS` instead of a string literal.
- API latency benchmark default now references `HEADLESS_INTERACTIVE_CHUNK_TICKS` instead of a string literal.
- `SineHeadlessJob` now includes `chunkTicks`, and run requests may explicitly provide `chunkTicks` for API callers that need an override.

## Current Behavior Documented

Current server/API behavior:

- Default chunk size: `25` ticks.
- Maximum accepted chunk size: `100` ticks.
- Effective chunk size is serialized on active job DTOs as `chunkTicks`.
- Cancel and progress checks happen at chunk boundaries because the runner checks cancellation and emits progress between chunks.

Current CLI/default runner behavior:

- Default chunk size: `1000` ticks.
- No cap is applied for throughput mode.
- Checkpoint interval can still constrain effective chunk length because the runner stops at `checkpointScheduler.nextTick()`.

Benchmark behavior:

- Benchmark scripts pass explicit chunk sizes.
- `scripts/sineApiLatencyBenchmark.ts` defaults to the interactive policy but still accepts `--chunk-ticks`.
- `scripts/sineHeadless.ts` defaults to the throughput policy but still accepts `--chunk-ticks`.

## Verification And Benchmarks

### Cross-Chunk Parity

`npm run test:sine` passed, including existing strict digest coverage that compares headless chunk sizes `10`, `25`, `100`, and `1000`.

Relevant tests:

- `exact parity: Headless Chunk Sizes Preserve Strict Digest`
- `headless: Headless Progress Emits Between Checkpoints`
- `headless: Headless Job Manager Active Conflict And Cancel`
- `headless: Headless Chunk Policy Defaults And Caps`

### Throughput Benchmark

Artifacts:

- `/tmp/sine-m10-throughput-25.json`
- `/tmp/sine-m10-throughput-1000.json`

Command shape:

```bash
npx tsx scripts/sineHeadless.ts --run-id m10-throughput-25 --ticks 1000 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 25 --checkpoint-interval-ticks 0 --db /tmp/sine-m10-throughput-25.sqlite
npx tsx scripts/sineHeadless.ts --run-id m10-throughput-1000 --ticks 1000 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 1000 --checkpoint-interval-ticks 0 --db /tmp/sine-m10-throughput-1000.sqlite
```

| Chunk ticks | Run ms | Advance ms | Chunks | Flushes | Ticks/sec | Row counts |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `25` | `7697.079` | `7534.432` | `40` | `42` | `129.919` | identical |
| `1000` | `7264.754` | `7181.241` | `1` | `3` | `137.651` | identical |

Pure throughput mode was about `5.6%` faster with the larger chunk in this sample. This is modest, consistent with the M1 finding that core simulation dominates and chunk overhead is secondary.

A second comparison with `checkpointIntervalTicks = 100` showed the checkpoint interval constrains chunk length; both runs wrote identical row counts and the `1000` setting effectively yielded at checkpoint boundaries.

### API Responsiveness Smoke

Artifact:

- `/tmp/sine-m10-api-latency.json`

Temporary server:

```bash
SINE_BENCHMARK_INSTRUMENTATION=1 SINE_HEADLESS_DB_PATH=/tmp/sine-m10-api.sqlite PORT=18787 npm run start:server
```

Command:

```bash
npx tsx scripts/sineApiLatencyBenchmark.ts --base-url http://127.0.0.1:18787 --ticks 200 --seed 101 --initial-spawners 100 --max-spawners 100 --chunk-ticks 25 --checkpoint-interval-ticks 100 --minimum-resolved-trades 1 --poll-interval-ms 100 --status-interval-ms 250
```

Results:

- isolated benchmark DB: `/tmp/sine-m10-api.sqlite`
- event-loop p95: `208.142 ms`
- event-loop max: `232.391 ms`
- active analysis endpoint p95s in this smoke: about `188-196 ms`
- wrapped analysis query p95s: below `5 ms`
- active run completed successfully at tick `200`

This does not solve the high-population event-loop blocking problem identified in M1; that remains Milestone 11. It does confirm the interactive default/cap path is active and produces the expected chunk-boundary responsiveness for a representative 100-pop smoke.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sineHeadless.ts --run-id m10-throughput-25 --ticks 1000 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 25 --checkpoint-interval-ticks 0 --db /tmp/sine-m10-throughput-25.sqlite
npx tsx scripts/sineHeadless.ts --run-id m10-throughput-1000 --ticks 1000 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 1000 --checkpoint-interval-ticks 0 --db /tmp/sine-m10-throughput-1000.sqlite
SINE_BENCHMARK_INSTRUMENTATION=1 SINE_HEADLESS_DB_PATH=/tmp/sine-m10-api.sqlite PORT=18787 npm run start:server
npx tsx scripts/sineApiLatencyBenchmark.ts --base-url http://127.0.0.1:18787 --ticks 200 --seed 101 --initial-spawners 100 --max-spawners 100 --chunk-ticks 25 --checkpoint-interval-ticks 100 --minimum-resolved-trades 1 --poll-interval-ms 100 --status-interval-ms 250
```

## Gate Status

- Current server cap behavior is documented: passed.
- Current CLI default behavior is documented: passed.
- Each mode has a stated chunk-size policy: passed.
- Defaults remain backward-compatible unless intentionally changed: passed. Existing API default remains `25`; CLI/default runner remains `1000`.
- Users can still override chunk size where the API allows it: passed. API requests accept optional `chunkTicks` subject to interactive cap.
- API mode keeps progress/cancel responsiveness in the `10-25` chunk range unless explicitly overridden: passed; default is `25`.
- Pure headless can use larger chunks when responsiveness is not required: passed; throughput default is `1000`.
- Benchmark scripts can still set exact chunk sizes: passed.
- Sanitization remains centralized: passed through `sanitizeHeadlessChunkTicks()`.
- No simulation code changes are required for chunk defaults: passed; runner loop semantics are unchanged.
- Same-seed strict digest continues to match across representative chunk sizes: passed by `npm run test:sine`.
- Cancellation happens at documented chunk boundaries: passed by existing cancellation tests and documented runner behavior.
- Progress cadence matches the chosen mode: passed by progress tests and API smoke.
- API latency does not regress in interactive mode: passed for the representative smoke; M1 high-population blocking remains deferred to M11.
- `npm run check` and `npm run test:sine` pass: passed.

## Milestone Decision

Keep the explicit chunk policy implementation.

M10 does not try to solve whole-server event-loop blocking. It makes the current mode-specific tradeoff explicit and verifiable: interactive API jobs stay responsive by default, pure CLI/default headless keeps the larger throughput chunk, and benchmarks remain explicitly configured.
