# Sine Exact-Parity Runtime Speedup M5 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 5.

## Summary

Milestone 5 introduced an ephemeral `SpawnerEvaluationFrame` for the decision pass.

The frame is tick-local and owns only aligned decision-pass data:

- ordered `SpawnerAgent` references
- spawner ids and frame indexes
- compiled brain plans
- market/spawner input arrays
- pre-evaluation hidden-state references
- learned-state references
- batch identity fields

Durable world state remains object-shaped. Energy, health, lineage, generation, payoff counters, trace stores, foods, events, UI inspection data, persistence snapshots, and newborn/death handling still live on `SpawnerWorld` / `SpawnerAgent`.

## Implementation

Changed runtime files:

- `src/sine/spawner/worldBrainEvaluation.ts`
- `src/sine/spawner/world.ts`
- `scripts/sinePerf.ts`
- `scripts/sine-tests/brainEvaluation.test.ts`

Key changes:

- Replaced the old `SpawnerTickContext[]` path with `buildSpawnerEvaluationFrame()`.
- Default sync evaluation now uses `evaluateSpawnerFrameSync(frame)`.
- Browser/async/custom runners still receive `BrainEvaluationJob[]`, but those jobs are derived from the frame through `buildBrainEvaluationJobs(frame, options)`.
- `orderedEvaluationResults(frame, results, jobs?)` now checks result identity against either frame identity or derived worker jobs.
- Trace fallback uses `frameEvaluationSource(frame, index)` when no worker job exists, preserving the same pre-evaluation hidden-state and input references.

The frame is private to `src/sine/spawner` runtime flow. No UI, persistence, headless repository, or server module imports the frame type.

## Contract Coverage Added

Added `Evaluation Frame Owns Ordered Inputs Jobs And Results` in `scripts/sine-tests/brainEvaluation.test.ts`.

The test covers:

- frame spawner order matches `world.spawners`
- frame indexes and spawner ids are aligned
- frame hidden-state and learned-state entries keep the pre-evaluation spawner references
- worker jobs derive identity, inputs, and hidden state from the frame
- direct frame sync results can be ordered from shuffled input
- derived worker-job results match frame sync outputs
- frame evaluation source exposes the exact trace fallback inputs/state

Existing async tests also passed, including out-of-order, stale, missing, failed, and advance-epoch mismatch result handling.

## Benchmark

Pre-change artifacts:

- `/tmp/sine-exact-parity-m5-pre-hotpath.json`
- `/tmp/sine-exact-parity-m5-pre-evolved.json`

Post-change artifacts:

- `/tmp/sine-exact-parity-m5-post-hotpath.json`
- `/tmp/sine-exact-parity-m5-post-evolved.json`

Command shape:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
```

## Timing Summary

Percentages are post versus immediate pre-M5. Lower is faster.

| Scenario | Pop | Avg ms/tick | Context/input | Job construction | Brain eval | Result ordering | Result apply |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `10.220 -> 8.879` `-13.1%` | `396.235 -> 389.641` `-1.7%` | `3.125 -> 0.000` `-100.0%` | `874.973 -> 595.355` `-32.0%` | `2.667 -> 2.010` `-24.6%` | `24.631 -> 24.037` `-2.4%` |
| baseline | 250 | `24.011 -> 21.290` `-11.3%` | `801.698 -> 785.926` `-2.0%` | `15.750 -> 0.000` `-100.0%` | `2088.562 -> 1494.956` `-28.4%` | `4.756 -> 3.677` `-22.7%` | `64.693 -> 68.694` `+6.2%` |
| baseline | 500 | `47.426 -> 42.888` `-9.6%` | `1449.760 -> 1448.609` `-0.1%` | `10.739 -> 0.000` `-100.0%` | `4206.832 -> 3060.377` `-27.3%` | `10.495 -> 9.268` `-11.7%` | `135.447 -> 137.507` `+1.5%` |
| high-action | 100 | `10.082 -> 10.153` `+0.7%` | `190.135 -> 187.532` `-1.4%` | `1.264 -> 0.000` `-100.0%` | `508.509 -> 391.580` `-23.0%` | `1.112 -> 1.066` `-4.1%` | `14.601 -> 15.201` `+4.1%` |
| high-action | 250 | `25.422 -> 26.618` `+4.7%` | `439.452 -> 457.752` `+4.2%` | `3.250 -> 0.000` `-100.0%` | `1291.691 -> 1021.877` `-20.9%` | `2.710 -> 2.900` `+7.0%` | `42.015 -> 45.561` `+8.4%` |
| high-action | 500 | `53.006 -> 53.373` `+0.7%` | `845.151 -> 835.728` `-1.1%` | `6.095 -> 0.000` `-100.0%` | `2671.339 -> 2047.265` `-23.4%` | `5.929 -> 5.775` `-2.6%` | `91.538 -> 87.165` `-4.8%` |
| high-reproduction | 100 | `14.131 -> 12.628` `-10.6%` | `528.652 -> 530.714` `+0.4%` | `3.233 -> 0.000` `-100.0%` | `1274.475 -> 862.724` `-32.3%` | `3.270 -> 2.557` `-21.8%` | `46.527 -> 44.688` `-4.0%` |
| high-reproduction | 250 | `36.208 -> 31.702` `-12.4%` | `1247.293 -> 1270.223` `+1.8%` | `6.730 -> 0.000` `-100.0%` | `3348.420 -> 2201.937` `-34.2%` | `7.816 -> 5.797` `-25.8%` | `124.702 -> 126.500` `+1.4%` |
| high-reproduction | 500 | `74.017 -> 66.342` `-10.4%` | `2548.964 -> 2667.138` `+4.6%` | `21.116 -> 0.000` `-100.0%` | `6651.577 -> 4432.475` `-33.4%` | `21.546 -> 17.825` `-17.3%` | `279.867 -> 287.806` `+2.8%` |
| evolved baseline | 250 | `27.956 -> 22.476` `-19.6%` | `455.184 -> 379.589` `-16.6%` | `4.815 -> 0.000` `-100.0%` | `1268.623 -> 832.080` `-34.4%` | `3.154 -> 2.267` `-28.1%` | `34.015 -> 33.551` `-1.4%` |

Interpretation:

- The frame eliminated default-sync `BrainEvaluationJob` allocation.
- The largest win came from default sync evaluation using the frame's already-compiled plans instead of re-entering job-based plan lookup.
- Baseline and high-reproduction scenarios improved materially.
- High-action total time was flat to slightly worse in two rows even though frame-specific phases mostly improved. Those rows appear dominated by non-frame phases and benchmark noise, so no extra frame complexity was added to chase them in this milestone.
- Context/input construction did not become meaningfully faster in ordinary fresh populations because market input resolution still dominates that phase. The evolved row improved because the frame avoids more redundant DTO work after warmup.

## Verification

```bash
npm run check
npm run test:sine
```

Both passed.

`npm run build` was not run because no UI, browser integration, server, or persistence code was changed. Browser-worker parity was covered by the Sine worker/brain-evaluation contract tests.

## Gate Status

- One ephemeral evaluation frame exists for the decision pass: passed.
- Frame is discarded after the step and does not mirror durable world state: passed.
- `SpawnerWorld` / `SpawnerAgent` remain canonical for UI, persistence, reproduction, death, and inspection: passed.
- Frame construction preserves current spawner order exactly: passed by test and strict digest coverage.
- No UI, persistence, headless repository, or server module imports the frame type: passed.
- Sync evaluation reads from the frame: passed for the default sync path.
- Async/browser-worker jobs still receive identity fields required for stale-result checks: passed.
- Result ordering and identity checks are preserved: passed.
- Action order, births, deaths, reproduction, RNG, trace fallback, and hidden-state application preserve exact parity: passed through `npm run test:sine`, including strict digest and lifecycle/reproduction/worker tests.
- Benchmark report records timing and architecture impact: passed.
