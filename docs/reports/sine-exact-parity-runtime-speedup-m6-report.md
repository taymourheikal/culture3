# Sine Exact-Parity Runtime Speedup M6 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 6.

## Summary

Milestone 6 added a plan-aligned learned-state runtime view and used it only where the compiled-plan context is already available.

The public learned-state shape remains unchanged:

- `connectionDeltas`
- `outputBiasDeltas`
- `gateBiasDeltas`
- `recentLearningSignal`
- `learningUpdateCount`
- `reproductionLearningCount`

Learning, reproduction, inheritance, persistence, inspection, and uniqueness still use the public learned-state maps. The runtime view is private and plan-scoped.

## Implementation

Changed runtime files:

- `src/sine/spawner/learnedStateView.ts`
- `src/sine/spawner/effectiveGenome.ts`
- `src/sine/spawner/brain.ts`
- `src/sine/spawner/world.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- `src/sine/spawner/compactBrainEvaluation.ts`

Key changes:

- Added `PlanAlignedLearnedStateView`, scoped to one `CompiledBrainPlan.signature`.
- Added `createPlanAlignedLearnedStateView()` as the single converter from public maps to plan-aligned arrays.
- Added `materializePlanAlignedLearnedStateView()` for exact public-shape reconstruction in tests and protocol compatibility.
- Added `learnedStateView` as an optional runtime input to brain evaluation.
- The M5 `SpawnerEvaluationFrame` now stores one learned-state view per spawner for the sync decision pass.
- `createPlanAlignedEffectiveBrainValues()` still accepts public learned-state maps directly. Public-map callers use the original map-based path; explicit view callers use the view path.
- Compact worker learned-state payloads are now derived from the shared view converter and then densified to preserve protocol shape.

No global learned-state view cache was added.

## Decay And Learning Decision

Decay was not moved onto the plan-aligned view.

Reason:

- Decay runs before the M5 evaluation frame is built.
- A view-aware decay path would require an additional pre-frame plan/view pass or a second learned-state representation.
- Current decay already skips exact no-op states and materializes the public learned-state object only where current semantics require it.

Learning and reproduction mutation remain on public maps.

Reason:

- `applyFoodResolutionLearning()` and `applyReproductionLearning()` mutate the public learned-state maps directly.
- Reproduction inheritance still calls `materializeEffectiveGenomeForInheritance()` from the public learned state.
- Keeping mutation on public maps avoids object/array drift and preserves persistence/inspection shape.

## Contract Coverage Added

Added tests in `scripts/sine-tests/genomeRuntime.test.ts`:

- `Plan Aligned Learned State View Matches Public Maps And Materializes`
- `Plan Aligned Effective Values Accept Learned State View`

These cover:

- connection deltas by plan connection index
- output-bias deltas by output index
- gate-bias deltas by plan unit index
- clamping through the same learned-state sanitizer
- counters and recent learning signal
- exact materialization back to public maps using the existing delta-key functions
- plan-signature mismatch rejection
- exact effective-value equality between public maps and explicit learned-state views

Existing tests continue to cover:

- decay no-op and active-decay behavior
- food-resolution learning
- long and short trace learning
- reproduction learning
- inheritance through `materializeEffectiveGenomeForInheritance()`
- strict digest parity with active learned deltas

## Benchmark

Pre-change artifacts:

- `/tmp/sine-exact-parity-m6-pre-hotpath.json`
- `/tmp/sine-exact-parity-m6-pre-evolved.json`

Post-change artifacts:

- `/tmp/sine-exact-parity-m6-post-hotpath.json`
- `/tmp/sine-exact-parity-m6-post-evolved.json`

Command shape:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
```

## Timing Summary

Percentages are post versus immediate pre-M6. Lower is faster.

| Scenario | Pop | Avg ms/tick | Learned decay | Brain eval | Context/input | Result apply |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `9.087 -> 8.402` `-7.5%` | `339.459 -> 331.893` `-2.2%` | `604.787 -> 233.580` `-61.4%` | `378.478 -> 618.912` `+63.5%` | `25.886 -> 24.423` `-5.7%` |
| baseline | 250 | `21.031 -> 19.350` `-8.0%` | `854.825 -> 877.430` `+2.6%` | `1483.094 -> 538.303` `-63.7%` | `768.730 -> 1367.547` `+77.9%` | `64.274 -> 60.129` `-6.4%` |
| baseline | 500 | `42.679 -> 39.371` `-7.8%` | `1767.503 -> 1824.082` `+3.2%` | `3044.647 -> 1092.664` `-64.1%` | `1431.525 -> 2724.956` `+90.4%` | `147.600 -> 139.266` `-5.6%` |
| high-action | 100 | `9.957 -> 9.680` `-2.8%` | `244.788 -> 250.604` `+2.4%` | `381.563 -> 119.466` `-68.7%` | `180.448 -> 365.560` `+102.6%` | `14.598 -> 14.438` `-1.1%` |
| high-action | 250 | `24.006 -> 24.824` `+3.4%` | `633.760 -> 674.047` `+6.4%` | `968.755 -> 304.650` `-68.6%` | `413.290 -> 886.059` `+114.4%` | `40.129 -> 41.397` `+3.2%` |
| high-action | 500 | `47.333 -> 51.625` `+9.1%` | `1281.441 -> 1358.158` `+6.0%` | `1917.308 -> 660.837` `-65.5%` | `800.617 -> 1781.734` `+122.5%` | `76.550 -> 85.661` `+11.9%` |
| high-reproduction | 100 | `12.184 -> 12.011` `-1.4%` | `313.761 -> 343.079` `+9.3%` | `824.402 -> 463.994` `-43.7%` | `511.458 -> 788.614` `+54.2%` | `43.029 -> 45.918` `+6.7%` |
| high-reproduction | 250 | `31.377 -> 29.754` `-5.2%` | `831.209 -> 872.239` `+4.9%` | `2159.527 -> 1096.030` `-49.2%` | `1260.694 -> 1907.857` `+51.3%` | `119.179 -> 123.263` `+3.4%` |
| high-reproduction | 500 | `65.002 -> 60.698` `-6.6%` | `1775.959 -> 1810.478` `+1.9%` | `4294.202 -> 2105.289` `-51.0%` | `2667.785 -> 3945.648` `+47.9%` | `290.187 -> 289.076` `-0.4%` |
| evolved baseline | 250 | `21.945 -> 20.340` `-7.3%` | `500.053 -> 520.576` `+4.1%` | `818.621 -> 280.330` `-65.8%` | `371.326 -> 727.319` `+95.9%` | `35.032 -> 29.378` `-16.1%` |

Brain-only profile:

| Pop | Cached total | Cached effective values | Fresh total | Fresh effective values |
| ---: | ---: | ---: | ---: | ---: |
| 100 | `43.502 -> 46.238` `+6.3%` | `8.747 -> 10.388` `+18.8%` | `90.975 -> 83.600` `-8.1%` | `9.109 -> 9.283` `+1.9%` |
| 250 | `110.573 -> 109.245` `-1.2%` | `25.008 -> 24.242` `-3.1%` | `234.692 -> 207.677` `-11.5%` | `23.592 -> 23.461` `-0.6%` |
| 500 | `220.998 -> 220.120` `-0.4%` | `44.363 -> 46.205` `+4.2%` | `397.955 -> 432.769` `+8.7%` | `44.959 -> 45.159` `+0.4%` |

Interpretation:

- Sync world `brainEvaluation` time dropped sharply because the frame provides a plan-aligned learned-state view and brain evaluation no longer performs learned-state map/string-key lookup in that phase.
- Some of that work moved into `spawnerContextInputConstruction`, where the frame builds the views.
- End-to-end runtime improved in baseline, high-reproduction, and evolved baseline rows.
- High-action at 250 and 500 population regressed. The view is retained because it improves the ordinary and reproduction-heavy cases and keeps the architecture moving toward plan-aligned runtime data, but this regression should inform the next milestone.
- The standalone brain profile remains close to pre-M6 because public learned-state callers use the original map path unless they explicitly pass a view.

## Verification

```bash
npm run check
npm run test:sine
```

Both passed after the final implementation.

`npm run build` was not run because no UI, browser integration, server, or persistence code was changed.

## Gate Status

- Learned-state runtime view exists and is scoped to one compiled plan signature: passed.
- The view is built from public maps through one shared converter: passed.
- The converter uses existing sanitizer/clamp behavior and materializes through existing delta-key functions: passed.
- Connection, output-bias, and gate-bias deltas are covered by tests: passed.
- `createPlanAlignedEffectiveBrainValues()` still accepts public learned-state maps: passed.
- Object-based effective-value access remains available for inspection, inheritance, uniqueness, and non-plan code: passed.
- Plan-aligned values match object-based values exactly: passed.
- Decay semantics are unchanged; no view-aware decay path was retained: passed and documented.
- Learning, reproduction, inheritance, trace deletion, and public learned-state maps are unchanged: passed through existing plasticity/world/reproduction tests.
- No global learned-state view cache exists: passed.
- `npm run check` and `npm run test:sine` pass: passed.
- Runtime-view impact is benchmarked and documented, including high-action regressions: passed.
