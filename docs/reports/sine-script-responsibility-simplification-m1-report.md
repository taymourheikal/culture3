# Sine Script Responsibility Simplification - Milestone 1 Report

## Scope

Milestone 1 consolidated benchmark-script responsibilities without changing benchmark intent or production runtime behavior.

Touched scripts:

- `scripts/sinePerf.ts`
- `scripts/sineBrowserPerf.ts`
- `scripts/sineApiLatencyBenchmark.ts`
- `scripts/sineHeadlessConcurrencyBenchmark.ts`
- `scripts/sineLabPersistenceSmokeBenchmark.ts`

Shared helpers used:

- `scripts/sine-benchmark/scenarios.ts`
- `scripts/sine-benchmark/cli.ts`
- `scripts/sine-benchmark/timing.ts`
- `scripts/sine-benchmark/trace.ts`

## Changes

- Reused `sineBenchmarkScenarios()` in `sinePerf.ts` for the trace fallback scenarios.
- Moved browser benchmark shared scenario setup outside `page.evaluate()` so the browser receives only plain serializable scenario run objects.
- Kept browser-only scenarios local in `sineBrowserPerf.ts` where their semantics differ from shared Node benchmark scenarios.
- Reused shared CLI flag parsing and integer/list readers across browser, API latency, headless concurrency, and Lab persistence smoke benchmarks.
- Extended shared CLI parsing to support both `--flag value` and `--flag=value`.
- Reused shared timing sample summaries and percentile helpers in API latency and headless concurrency benchmarks.
- Reused shared trace instrumentation in `sinePerf.ts`.
- Left the browser trace helper local inside `page.evaluate()` because browser-context code cannot import Node-side `scripts/` helpers.
- Did not add a runner helper because only `sinePerf.ts` has that exact local benchmark result shape.

## Verification

Passed:

```bash
npm run check
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 5 --populations 10 --scenarios baseline --brain-iterations 1
npx tsx scripts/sinePhaseBenchmark.ts --ticks 5 --initial-spawners 10 --max-spawners 10
npx tsx scripts/sineBrowserPerf.ts --populations 5 --advance-ticks 5 --scenarios fixed --worker-counts 1 --timeout-ms 60000
npx tsx scripts/sinePerf.ts
git diff --check
```

Not smoke-run:

- `scripts/sineApiLatencyBenchmark.ts`: requires a live API server and starts real headless runs.
- `scripts/sineHeadlessConcurrencyBenchmark.ts`: requires a live API server and starts concurrent headless runs.
- `scripts/sineLabPersistenceSmokeBenchmark.ts`: starts browser/server persistence sessions and can write/delete DB rows.

Those scripts were source-checked through `npm run check`; the high-side-effect runtime benchmarks were intentionally not executed as part of this consolidation milestone.

## Exit Gate Audit

- Duplicate raw flag parsing is centralized in `scripts/sine-benchmark/cli.ts`; remaining local `parseArgs()` functions are script-specific option mappers.
- Duplicate local `readInteger`, `readIntegerList`, `roundKb`, and latency percentile helpers were removed from the touched scripts where shared semantics matched.
- Browser benchmark scenarios are serialized before entering `page.evaluate()`; function-valued fields such as `maxSpawners` are resolved in Node.
- `sinePerf.ts` no longer defines local trace scenarios or trace instrumentation helpers.
- No production runtime file imports `scripts/sine-benchmark/trace.ts`; imports are limited to benchmark scripts.
- Browser trace instrumentation remains local and documented because it runs inside the browser context.
- Benchmark packet/JSON top-level shapes remain stable; helper reuse changed construction paths, not output contract names.
- Required smoke checks and `npm run check` passed.

