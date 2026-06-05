# Sine Housekeeping Runtime Cleanup M1 Report

Milestone 1 reduced benchmark-script duplication without changing production runtime, server API, UI, persistence schema, or simulation behavior.

## Duplication Audit

Repeated Node benchmark helpers:

- CLI parsing and integer validation appeared in `sineRuntimeHotPathBenchmark.ts`, `sinePhaseBenchmark.ts`, `sineLabPersistenceWriteBenchmark.ts`, `sineApiLatencyBenchmark.ts`, `sineLabPersistenceSmokeBenchmark.ts`, `sineHeadlessConcurrencyBenchmark.ts`, and related benchmark scripts.
- Numeric formatting helpers such as `round`, `roundKb`, list readers, and percentile logic were repeated across runtime, persistence, API, and phase benchmarks.
- Timing bucket collection and summary logic was duplicated between runtime and phase timing benchmarks.
- Trace instrumentation setup was local to runtime hot-path measurement despite matching the canonical `BrainTraceInstrumentation` shape.
- Scenario definitions overlapped between runtime and browser benchmarks, but not completely: browser benchmarks include worker-protocol scenarios that are intentionally browser-specific.

Browser benchmark constraints:

- `scripts/sineBrowserPerf.ts` executes core benchmark setup inside `page.evaluate()`.
- Helpers used inside `page.evaluate()` must be serializable or defined in the browser context.
- Importing Node script helpers into that evaluated function would either fail or make the benchmark harder to reason about.
- Because of that, browser-internal scenario, trace, and rounding helpers remain inline for this milestone.

Script-specific logic kept local:

- SQLite table sizing/counting in `sineLabPersistenceWriteBenchmark.ts`.
- API latency grouping and request behavior in API benchmarks.
- Browser worker/pool summaries in `sineBrowserPerf.ts`.
- Headless concurrency orchestration in `sineHeadlessConcurrencyBenchmark.ts`.

## Changes

- Added `scripts/sine-benchmark/cli.ts` for small CLI/numeric primitives.
- Added `scripts/sine-benchmark/timing.ts` for timing and metric bucket collection/summaries.
- Added `scripts/sine-benchmark/trace.ts` for canonical benchmark trace instrumentation.
- Added `scripts/sine-benchmark/scenarios.ts` for shared runtime benchmark scenario definitions where values were identical.
- Updated `scripts/sineRuntimeHotPathBenchmark.ts` to use shared CLI, timing, trace, metric, and scenario helpers.
- Updated `scripts/sinePhaseBenchmark.ts` to use shared CLI and timing helpers.
- Updated `scripts/sineLabPersistenceWriteBenchmark.ts` to use shared CLI and numeric helpers.

## Browser Benchmark Decision

No browser helper was added in this milestone. The current browser benchmark helper duplication is intentional because the duplicated code lives inside a browser execution closure. Keeping that closure self-contained preserves the boundary between Node benchmark orchestration and browser runtime measurement.

## Production Impact

No production runtime files were changed for this milestone. The changes are limited to benchmark scripts, script-local benchmark helpers, and this report.

## Verification

Commands run:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 5 --populations 10 --scenarios baseline --brain-iterations 1
npx tsx scripts/sinePhaseBenchmark.ts --ticks 5 --initial-spawners 10 --max-spawners 10
npx tsx scripts/sineLabPersistenceWriteBenchmark.ts --population 5 --intervals 1 --interval-ticks 1 --seed 101
npm run check
```

Observed output invariants:

- Runtime benchmark still returns top-level `ok`, `settings`, `results`, and `brainProfiles`.
- Timing summaries still include `calls`, `count`, `totalMs`, and max timing fields.
- Shared scenario values remain unchanged.
- No browser benchmark worker or pool behavior changes.
- `npm run check` passed.
