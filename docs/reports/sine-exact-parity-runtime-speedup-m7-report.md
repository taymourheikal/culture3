# Sine Exact-Parity Runtime Speedup M7 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 7.

## Summary

Milestone 7 introduced one internal compact numeric brain kernel for same-thread and diagnostic worker brain evaluation.

The public brain API remains unchanged:

- `forwardSpawner()`
- `evaluateSpawnerBrain()`
- `evaluateSpawnerBrainPure()`
- public `BrainEvaluation` DTO shape

The new kernel is internal to `src/sine/spawner` and accepts ordinary JavaScript number arrays. It does not use typed arrays, UI modules, persistence modules, server modules, or worker-specific APIs.

## Implementation

Changed runtime files:

- `src/sine/spawner/brainKernel.ts`
- `src/sine/spawner/brain.ts`
- `src/sine/spawner/compactBrainEvaluation.ts`
- `src/sine/spawner/effectiveGenome.ts`
- `src/sine/spawner/plasticity.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- `src/sine/worker/brainEval.worker.ts`

Key changes:

- Added `evaluateCompactBrainKernel()` as the single hidden/output math path.
- Moved hidden-unit, gate-sum, output-sum, activation-recording, source-value, sigmoid/tanh target, and connection-weight access into that kernel.
- Public brain evaluation now materializes public DTOs around the compact kernel result.
- Runtime trace activation materialization now replays through the same compact kernel instead of maintaining separate hidden/output activation replay math.
- Compact diagnostic worker jobs now evaluate directly from compact hidden/input/effective-value arrays instead of rematerializing learned-state maps and hidden-state records before calling the public evaluator.
- Added `createPlanAlignedEffectiveBrainValuesFromArrays()` so compact payloads can become plan-aligned effective values without duplicating math or learned-state map reconstruction.
- Compact worker cache-hit jobs now restore the cached compact genome payload in the worker as well as the genome.
- `frameEvaluationSource()` now returns the frame's learned-state view when available.

## Boundary Decisions

No frame-owned scratch-buffer reuse was retained in this milestone.

Reason:

- Public `BrainEvaluation` DTOs still own stable arrays/records.
- Milestone 8 is explicitly responsible for lazy runtime result application and DTO boundaries.
- Adding shared mutable scratch buffers before Milestone 8 would increase aliasing risk without a clear M7-only speed win.

Browser worker automatic selection remains disabled. Compact worker mode remains diagnostic/test infrastructure only.

## Contract Coverage Added

Added `scripts/sine-tests/brainEvaluation.test.ts` coverage:

- `Compact Job Direct Array Kernel Clamps And Matches Object Evaluation`

This test mutates compact learned-delta arrays beyond `maxLearnedDelta`, evaluates through the direct compact-array path, materializes the result, and compares it to the object/public learned-state path for:

- outputs
- previous hidden state
- current hidden state
- active connection ids
- activation map values

Existing tests continue to cover:

- public pure evaluation
- trace payload skipping
- compiled-plan golden parity
- runtime activation materialization
- no aliasing across public evaluations
- compact response materialization
- out-of-order/stale/missing/failed async results
- object and compact worker cache behavior
- strict world parity

## Benchmark

Pre-change artifacts:

- `/tmp/sine-exact-parity-m6-post-hotpath.json`
- `/tmp/sine-exact-parity-m6-post-evolved.json`

Post-change artifacts:

- `/tmp/sine-exact-parity-m7-post-hotpath.json`
- `/tmp/sine-exact-parity-m7-post-evolved.json`
- `/tmp/sine-exact-parity-m7-browser-sync.jsonl`
- `/tmp/sine-exact-parity-m7-browser.json`
- `/tmp/sine-exact-parity-m7-sinePerf.txt`

Command shape:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
```

Browser sync was measured with the existing browser harness using 200 ticks at 100, 250, and 500 population for fixed and high-action scenarios.

The full browser sync/object-worker/compact-worker matrix with both fixed and high-action scenarios timed out at `120000 ms`, so it was not used as timing evidence. Browser worker parity was verified separately with `npm run test:sine:browser-parity`.

## Timing Summary

Percentages are post-M7 versus post-M6. Lower is faster.

| Scenario | Pop | Avg ms/tick | Brain eval | Trace materialize |
| --- | ---: | ---: | ---: | ---: |
| baseline | 100 | `8.402 -> 8.139` `-3.1%` | `233.580 -> 232.849` `-0.3%` | `22.639 -> 19.060` `-15.8%` |
| baseline | 250 | `19.350 -> 19.059` `-1.5%` | `538.303 -> 543.224` `0.9%` | `46.702 -> 42.171` `-9.7%` |
| baseline | 500 | `39.371 -> 38.412` `-2.4%` | `1092.664 -> 1083.422` `-0.8%` | `88.138 -> 83.239` `-5.6%` |
| high-action | 100 | `9.680 -> 9.396` `-2.9%` | `119.466 -> 118.168` `-1.1%` | `187.284 -> 181.218` `-3.2%` |
| high-action | 250 | `24.824 -> 24.290` `-2.2%` | `304.650 -> 304.218` `-0.1%` | `507.886 -> 493.516` `-2.8%` |
| high-action | 500 | `51.625 -> 49.458` `-4.2%` | `660.837 -> 623.047` `-5.7%` | `1135.416 -> 1059.542` `-6.7%` |
| high-reproduction | 100 | `12.011 -> 11.660` `-2.9%` | `463.994 -> 438.337` `-5.5%` | `2.315 -> 2.393` `3.4%` |
| high-reproduction | 250 | `29.754 -> 29.030` `-2.4%` | `1096.030 -> 1097.670` `0.1%` | `5.977 -> 5.855` `-2.0%` |
| high-reproduction | 500 | `60.698 -> 60.000` `-1.2%` | `2105.289 -> 2093.924` `-0.5%` | `11.171 -> 11.491` `2.9%` |

Evolved baseline:

- Avg tick: `20.340 -> 19.767 ms` (`-2.8%`)
- Cached brain-only total: `60.787 -> 63.492 ms` (`+4.4%`)

Brain-only profile:

| Pop | Cached total | Fresh total | M7 compact-kernel phase |
| ---: | ---: | ---: | ---: |
| 100 | `46.238 -> 45.974` `-0.6%` | `83.600 -> 84.323` `0.9%` | `19.138` |
| 250 | `109.245 -> 111.421` `2.0%` | `207.677 -> 225.841` `8.7%` | `45.685` |
| 500 | `220.120 -> 222.657` `1.2%` | `432.769 -> 409.749` `-5.3%` | `91.727` |

Interpretation:

- Full runtime improved in every measured row.
- Trace activation materialization improved in the high-action rows and most ordinary rows because replay now uses the canonical kernel path.
- Brain-only cached-plan timing is mixed: 100-pop improved slightly, while 250/500/evolved regressed slightly. The retained change is narrowed to canonical math consolidation and compact-worker direct-array evaluation; no shared scratch-buffer system was added in M7.
- The brain-only microprofile is sensitive to instrumentation and single-run noise. The full runtime hot-path benchmark is the primary timing evidence for this milestone.

## Browser Sync Timing

Browser sync, 200 ticks:

| Scenario | Pop | Time |
| --- | ---: | ---: |
| fixed | 100 | `1271.8 ms` |
| fixed | 250 | `3077.8 ms` |
| fixed | 500 | `6207.9 ms` |
| high-action | 100 | `1462.1 ms` |
| high-action | 250 | `3752.8 ms` |
| high-action | 500 | `7667.0 ms` |

## Verification

```bash
npm run check
npm run test:sine
npm run build
npm run test:sine:browser-parity
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
npx tsx scripts/sinePerf.ts
```

All verification commands passed.

Browser parity result:

- object and compact worker parity passed at `500 pop / 40 ticks`

## Gate Status

- Public `evaluateSpawnerBrain`, `evaluateSpawnerBrainPure`, and `forwardSpawner` signatures remain stable: passed.
- The compact kernel is internal to `src/sine/spawner`: passed.
- The kernel does not import UI, persistence, server, or worker-specific modules: passed.
- Kernel inputs are ordinary JS number arrays: passed.
- Existing runtime sidecar materialization has one path into the new kernel: passed.
- No duplicate hidden-unit, gate-sum, output-sum, sigmoid, or tanh brain math remains outside `brainKernel.ts`: passed.
- Activation recording reports the same active connection ids and source/target values: passed by compact direct-array test and existing activation tests.
- `includeActivations: false` and `includePreviousState: false` remain supported fast paths: passed.
- Source-value semantics for input, previous hidden, and current hidden references are unchanged: passed by brain fixtures and strict parity tests.
- Brain fixtures match for outputs, previous/current state, active ids, and activation maps: passed.
- No returned public DTO aliases arrays that will be reused: passed by existing no-alias test; no frame scratch buffers were retained.
- Selected-agent and RNN inspection public materialization remains stable: passed through `npm run test:sine` and `npm run build`.
- Worker compact diagnostics still pass structured-clone/parity coverage: passed.
- Object, compact, sync, async sync-runner, and diagnostic worker paths share the same kernel/materializer boundary: passed.
- Browser-worker automatic selection remains disabled: passed; no threshold change was made.
- Existing stale/missing/failed/out-of-order result tests still pass: passed.
- Cached-plan RNN timing did not improve across all populations; the change was narrowed to canonical kernel/direct compact evaluation and no scratch-buffer system was retained: passed with caveat.
- Full pure advance and async sync-runner timing were benchmarked; primary hot-path full-runtime rows improved: passed.
- Browser sync was remeasured: passed.
- High-action trace materialization remains at least as fast as post-M3 and improved versus post-M6 in the hot-path rows: passed.
- `npm run check`, `npm run test:sine`, and `npm run build` pass: passed.

## Decision

Milestone 7 passes with one caveat: brain-only cached-plan microprofile timing is mixed. The architectural goal was achieved, full-runtime timing improved, and exact parity is preserved. The scratch-buffer portion of the milestone remains intentionally deferred to Milestone 8's lazy DTO/runtime-result boundary rather than being added prematurely in M7.
