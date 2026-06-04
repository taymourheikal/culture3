# Sine Brain Hot-Path And Worker Payload Milestone 4 Report

Recorded on June 2, 2026.

Milestone 4 goal: clean up temporary compact-worker compatibility paths, document the final measured brain-evaluation mode, and keep regression guards without treating performance benchmarks as brittle pass/fail tests.

## Cleanup Decision

Milestone 3 showed that browser sync evaluation is faster than both object-payload and compact-payload nested brain Workers through:

- fixed population at 100, 250, 500, and 1000 agents
- warmed-cache 100-population / 500-tick run
- normal churn
- high churn
- high-action trace scenario

Therefore `MIN_PARALLEL_BRAIN_EVAL_JOBS` remains `Infinity`.

Compact worker mode is retained only as diagnostic/test infrastructure. It still has value because it preserves optimized trace materialization after browser-worker `postMessage`, which object-worker results do not. It is not the production default and is not selected by the live runtime.

## What Changed

- Removed the unused `buildCompactBrainEvaluationJobs()` companion helper from `src/sine/spawner/worldBrainEvaluation.ts`.
- Removed compact helpers and the compact sync runner from the broad `src/sine/spawnerSimulation.ts` public barrel.
- Added a diagnostic-only comment to `BrainEvalPoolConfig.protocol` in `src/sine/worker/brainEvalPool.ts`.
- Updated `src/sine/README.md` to state that sync evaluation is the measured default and nested brain Workers are diagnostic/benchmark infrastructure.
- Updated the Help page runtime section in `src/sine/SineHelpPage.tsx` to state that sync is faster in measured browser benchmarks and compact worker mode is diagnostic-only.

## Regression Guards Kept

The compact protocol remains covered by focused tests because it is retained as diagnostic infrastructure:

- compact payload serialization parity
- compact response materialization parity
- compact trace materialization after worker-style transfer
- stale, missing, failed, and out-of-order result rejection
- bounded cache eviction and resend behavior
- browser parity for object and compact worker paths

The benchmark scripts remain scripts/reports, not wall-clock pass/fail tests.

## Exit-Gate Status

- No temporary compact tick-context wrapper remains: passed.
- Stable public APIs remain for existing callers: passed.
- Broad simulation barrel no longer exports compact diagnostic helpers: passed.
- Dual object/compact worker protocols remain only as diagnostic/test infrastructure: passed.
- Both protocols still share one evaluator and one compact materializer boundary: passed by test coverage and module inspection.
- Docs and Help text state that sync remains the measured default: passed.
- No docs claim parallelism improves speed: passed.
- Regression guards remain in `scripts/sine-tests/brainEvaluation.test.ts` and browser parity: passed.
- Final timing evidence remains in `docs/reports/sine-brain-worker-hotpath-m3-report.md`: passed.
- Milestone 4 does not enable a production worker threshold: passed.

## Verification

```bash
npm run check
npm run test:sine
npm run build
npm run test:sine:browser-parity
npx tsx scripts/sineSmoke.ts
npx tsx scripts/sineBrowserPerf.ts --populations 100 --advance-ticks 20 --worker-counts 4 --scenarios fixed,high-action --timeout-ms 60000
```

All verification commands passed.

The short browser perf check was a regression smoke, not a new threshold decision. It still showed sync faster than both worker protocols at 100 population:

- fixed: sync `135.6 ms`, object worker `318.1 ms`, compact worker `422.7 ms`
- high-action: sync `215.5 ms`, object worker `355.1 ms`, compact worker `484.3 ms`
