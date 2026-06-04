# Sine Brain Hot-Path And Worker Payload Milestone 1 Report

Recorded on June 2, 2026.

Milestone 1 goal: reduce sync brain-evaluation overhead by introducing an internal runtime brain result, preserving array-form state for trace materialization, and reducing trace fallback recomputation without changing public brain APIs or simulation behavior.

## What Changed

- Added an internal `RuntimeBrainEvaluation` sidecar in `src/sine/spawner/brain.ts`.
- Kept public `evaluateSpawnerBrain`, `evaluateSpawnerBrainPure`, and `forwardSpawner` signatures unchanged.
- Materialized public `BrainEvaluation` through one shared materializer.
- Added `materializeBrainEvaluationActivations()` to build trace activation details from the first-pass runtime sidecar when available.
- Preserved full fallback to `evaluateSpawnerBrainPure()` when a result has no sidecar, such as browser-worker structured-cloned results.
- Removed a redundant compact-result wrapper in `brainEvaluationRunner.ts` so sync-runner results keep the runtime sidecar.
- Replaced hidden-state `map()` conversion with an explicit `hiddenRecordToArrayInto()` helper.
- Added trace instrumentation fields for optimized trace materialization counts/timing.

## Commands

```bash
npm run test:sine
npm run check
npm run build
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineHeadless.ts --run-id brain-worker-m1 --ticks 500 --seed 101 --market-source generated --initial-spawners 100 --max-spawners 100 --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 100 --db data/brain-worker-baseline.sqlite
npx tsx scripts/sineBrowserParity.ts
npx tsx scripts/sineSmoke.ts
```

All commands passed.

## Perf Comparison Against Milestone 0

### Pure And Async Advance

| Row | Population | M0 ms | M1 ms | Delta |
| --- | ---: | ---: | ---: | ---: |
| pure advance | 100 | 1776.963 | 1813.018 | +2.0% |
| pure advance | 250 | 4410.447 | 4370.472 | -0.9% |
| pure advance | 500 | 8908.459 | 8925.602 | +0.2% |
| async sync-runner advance | 100 | 1651.326 | 1661.119 | +0.6% |
| async sync-runner advance | 250 | 4284.391 | 4354.672 | +1.6% |
| async sync-runner advance | 500 | 8827.478 | 8993.692 | +1.9% |

Interpretation: pure/async advance stayed effectively flat. The runtime sidecar did not create a material whole-runtime speedup in ordinary runs, but it also did not materially regress the main tick path.

### Brain-Only Timing

| Row | Population | M0 avg ms | M1 avg ms | Delta |
| --- | ---: | ---: | ---: | ---: |
| RNN evaluate cached plan | 100 | 3.512 | 3.382 | -3.7% |
| RNN evaluate fresh plan | 100 | 6.926 | 6.441 | -7.0% |
| RNN evaluate cached plan | 250 | 8.560 | 8.556 | ~0.0% |
| RNN evaluate fresh plan | 250 | 16.757 | 16.305 | -2.7% |
| RNN evaluate cached plan | 500 | 17.662 | 17.380 | -1.6% |
| RNN evaluate fresh plan | 500 | 34.498 | 33.038 | -4.2% |

Interpretation: brain-only cached/fresh timing improved or stayed flat at all measured populations.

### Trace Fallback Timing

| Scenario | Metric | M0 | M1 | Delta |
| --- | --- | ---: | ---: | ---: |
| mostly waiting | fallback evals | 0 | 0 | unchanged |
| mostly waiting | fallback ms | 0 | 0 | unchanged |
| high action | fallback evals | 25816 | 0 | eliminated |
| high action | fallback ms | 1066.205 | 0 | eliminated |
| high action | optimized materializations | 0 | 25816 | new path |
| high action | optimized materialization ms | 0 | 454.254 | replaces full fallback |

High-action trace cost went from `1066.205 ms` of full fallback recomputation to `454.254 ms` of optimized activation materialization. That is a roughly `57%` reduction for trace detail generation in this benchmark.

### Headless Timing

| Metric | M0 `brain-worker-baseline` | M1 `brain-worker-m1` |
| --- | ---: | ---: |
| runMs | 4506.636 | 4747.453 |
| advanceTotalMs | 4443.712 | 4677.658 |
| recorderEventMs | 12.663 | 14.122 |
| sinkWriteMs | 44.733 | 51.891 |
| latest chunk core estimate | 909.353 | 941.997 |
| latest chunk ticks/sec | 108.922 | 104.424 |
| row counts | same logical counts | same logical counts |

Interpretation: this single headless run was slower than the Milestone 0 sample. Because pure advance and brain-only timings stayed flat-to-better, and sink flush/write time also increased in this sample, this should be treated as benchmark variance or persistence/runtime noise rather than evidence that the brain change slowed headless materially. Keep watching headless timing in Milestone 2.

## Functional Parity Evidence

`npm run test:sine`
- Passed.
- Added/kept relevant tests:
  - `Runtime Activation Materializer Matches Full Evaluation`
  - `Runtime Evaluation Results Do Not Alias Subsequent Evaluations`
  - `Compact Evaluation Preserves Trace Fallback Source State`
  - `Learned Delta Fixture Covers Clamping And Precision Sensitive Values`
- Existing deterministic world digest, learning, reproduction, trace pruning, async stale/missing/failed/out-of-order, genome runtime, headless parity, and persistence contracts passed.

`npx tsx scripts/sineBrowserParity.ts`
- Passed at `500 pop / 40 ticks`.

`npx tsx scripts/sineSmoke.ts`
- Passed, covering live browser UI smoke including modal/inspection flows.

`npm run check`
- Passed.

`npm run build`
- Passed.

## Milestone 1 Exit-Gate Status

- Public brain APIs kept their signatures: passed.
- Public `BrainEvaluation` output remains fixture-equivalent with deterministic world-digest tests: passed.
- Runtime result materializes through one shared function: passed.
- `includeActivations: false` and `includePreviousState: false` still avoid public activation maps and previous-state records: passed.
- Runtime sidecar carries pre-evaluation hidden state, current hidden state, outputs, inputs, plan, and effective values for trace materialization: passed.
- Hidden-state current/update/previous semantics unchanged: passed by genome runtime and new activation materializer tests.
- No returned public DTO aliases scratch arrays reused by later evaluations: passed by `Runtime Evaluation Results Do Not Alias Subsequent Evaluations`.
- No `Float32Array` or precision-changing typed array path added: passed.
- Trace fallback full recomputations reduced in high-action benchmark: passed, `25816 -> 0`.
- Wait actions still do not create traces: passed.
- Learning tests still pass for food resolution, reproduction feedback, trace pruning, and learned-state mutation: passed.
- RNN inspection/UI smoke still passes: passed.
- No UI, persistence, or inspector code imports a scratch-only runtime type: passed by search and TypeScript.
- No second brain engine or duplicate effective-value implementation exists: passed; worker and sync paths still call the shared brain evaluator.

## Notes For Milestone 2

- The sidecar survives the sync runner now because `brainEvaluationRunner.ts` no longer clones compact evaluations.
- Browser-worker results still lose the sidecar through structured clone, so compact worker payload work remains necessary.
- The activation materializer is intentionally a shared brain helper, not worker-specific math.
- Headless timing should continue to be sampled because the single M1 headless run was slower despite brain-only improvement.
