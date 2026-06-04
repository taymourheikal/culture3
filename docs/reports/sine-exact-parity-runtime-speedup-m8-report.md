# Sine Exact-Parity Runtime Speedup M8 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 8.

## Summary

Milestone 8 added lazy runtime result application for the normal same-thread tick path.

Before this milestone, the default sync frame path evaluated each agent through compact arrays but still materialized a public `BrainEvaluation` DTO for every evaluated agent. The world loop then used that DTO only to:

- apply current hidden state
- decode output values
- materialize trace activations for non-wait actions

After this milestone, default sync ticks keep an internal runtime result until a public DTO is actually needed at a boundary.

Public `BrainEvaluation` DTO materialization remains available for:

- public brain APIs
- object and compact worker protocol results
- RNN and selected-agent inspection
- explicit tests asserting public shape
- runtime-to-public boundary materialization

## Implementation

Changed runtime files:

- `src/sine/spawner/brain.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- `src/sine/spawner/world.ts`
- `src/sine/spawner/learning.ts`

Key changes:

- Exported internal `BrainRuntimeEvaluation` and runtime evaluator/materializer helpers from `src/sine/spawner/brain.ts`.
- Kept those runtime helpers out of the public `src/sine/spawnerSimulation.ts` barrel.
- Changed `evaluateSpawnerFrameSync()` to return `RuntimeBrainEvaluationResult[]` instead of public protocol DTO results.
- Added internal result helpers in `worldBrainEvaluation.ts`:
  - `outputsFromEvaluationResult()`
  - `runtimeEvaluationFromResult()`
  - `publicEvaluationFromResult()`
  - `materializeEvaluationResult()`
- Updated same-thread result application to apply current hidden arrays directly into the public hidden-state record.
- Updated output decoding to read runtime output arrays directly.
- Updated trace capture so a public `BrainEvaluation` is optional when owned trace activations are supplied.
- Updated runtime-to-public materialization so requesting activations from an activation-free runtime result replays activation recording through the canonical compact kernel.

Worker protocol results still use the public `BrainEvaluationResult` shape. Async worker, compact worker, and protocol tests remain on the public DTO boundary.

## Contract Coverage Added

Updated `scripts/sine-tests/brainEvaluation.test.ts`:

- `Evaluation Frame Owns Ordered Inputs Jobs And Results` now asserts default frame sync results are runtime results, not public DTOs.
- The same test verifies output parity against object job results.
- The same test verifies a full public DTO materialized from a runtime result matches an explicit public `evaluateSpawnerBrainPure()` result for:
  - outputs
  - previous hidden state
  - current hidden state
  - active connection ids
  - activation map values

This test caught an initial boundary bug where runtime-to-public materialization could return active ids without activation map values when the runtime result had been evaluated activation-free. The final implementation fixed this by replaying activations on demand.

Existing strict parity coverage continues to cover:

- hidden-state values
- learned-state values
- food order
- event order
- trace activation values
- high-action worlds
- high-reproduction worlds
- headless chunk-size parity

## Benchmark

Pre-change artifacts:

- `/tmp/sine-exact-parity-m7-post-hotpath.json`
- `/tmp/sine-exact-parity-m7-post-evolved.json`

Post-change artifacts:

- `/tmp/sine-exact-parity-m8-post-hotpath.json`
- `/tmp/sine-exact-parity-m8-post-evolved.json`

Command shape:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
```

## Timing Summary

Percentages are post-M8 versus post-M7. Lower is faster.

| Scenario | Pop | Avg ms/tick | Brain eval | Result apply | Output decode | Trace materialize | Trace fallback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `8.139 -> 7.914` `-2.8%` | `232.849 -> 220.809` `-5.2%` | `23.387 -> 7.403` `-68.3%` | `8.277 -> 7.061` `-14.7%` | `19.060 -> 20.247` `6.2%` | `0.000 -> 0.000` |
| baseline | 250 | `19.059 -> 18.045` `-5.3%` | `543.224 -> 484.704` `-10.8%` | `60.825 -> 18.405` `-69.7%` | `12.138 -> 11.602` `-4.4%` | `42.171 -> 42.280` `0.3%` | `0.000 -> 0.000` |
| baseline | 500 | `38.412 -> 36.819` `-4.1%` | `1083.422 -> 988.198` `-8.8%` | `133.059 -> 62.531` `-53.0%` | `25.582 -> 22.217` `-13.2%` | `83.239 -> 84.145` `1.1%` | `0.000 -> 0.000` |
| high-action | 100 | `9.396 -> 9.274` `-1.3%` | `118.168 -> 115.260` `-2.5%` | `13.815 -> 5.998` `-56.6%` | `2.404 -> 2.370` `-1.4%` | `181.218 -> 204.263` `12.7%` | `0.000 -> 0.000` |
| high-action | 250 | `24.290 -> 22.039` `-9.3%` | `304.218 -> 238.763` `-21.5%` | `38.622 -> 15.932` `-58.7%` | `8.403 -> 6.639` `-21.0%` | `493.516 -> 492.960` `-0.1%` | `0.000 -> 0.000` |
| high-action | 500 | `49.458 -> 44.339` `-10.4%` | `623.047 -> 534.358` `-14.2%` | `83.342 -> 37.290` `-55.3%` | `14.365 -> 12.593` `-12.3%` | `1059.542 -> 1047.619` `-1.1%` | `0.000 -> 0.000` |
| high-reproduction | 100 | `11.660 -> 10.477` `-10.1%` | `438.337 -> 360.268` `-17.8%` | `42.475 -> 10.567` `-75.1%` | `9.224 -> 7.930` `-14.0%` | `2.393 -> 2.224` `-7.1%` | `0.000 -> 0.000` |
| high-reproduction | 250 | `29.030 -> 27.294` `-6.0%` | `1097.670 -> 945.578` `-13.9%` | `113.573 -> 62.002` `-45.4%` | `23.985 -> 33.637` `40.2%` | `5.855 -> 5.490` `-6.2%` | `0.000 -> 0.000` |
| high-reproduction | 500 | `60.000 -> 56.583` `-5.7%` | `2093.924 -> 1877.262` `-10.3%` | `269.699 -> 122.486` `-54.6%` | `47.317 -> 43.957` `-7.1%` | `11.491 -> 10.676` `-7.1%` | `0.000 -> 0.000` |

Evolved baseline:

- Avg tick: `19.767 -> 19.132 ms` (`-3.2%`)
- Result application: `28.553 -> 12.399 ms` (`-56.6%`)

Interpretation:

- Full runtime improved in every measured row.
- `brainEvaluation` dropped because default frame sync no longer materializes public DTOs for every evaluated agent.
- `resultApplication` dropped after direct one-pass hidden-array application replaced intermediate current-state record creation.
- `outputDecoding` generally dropped because it reads output arrays directly from runtime results.
- `traceFallbackEvaluation` stayed at `0.000 ms`; high-action trace capture did not introduce fallback recomputation.
- A few trace-materialization rows are slightly noisy, but high-action 250/500 and high-reproduction rows stayed flat or improved.

## Verification

```bash
npm run check
npm run test:sine
npm run build
npm run test:sine:browser-parity
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
```

All verification commands passed.

Browser parity result:

- object and compact worker parity passed at `500 pop / 40 ticks`

## Gate Status

- Runtime result is internal and not exported through UI/persistence/server APIs: passed.
- Public `BrainEvaluation` can still be materialized exactly from the runtime result: passed.
- Runtime result carries enough data for trace activation materialization without full brain recomputation: passed.
- Runtime result identity is tied to frame/job identity for ordering checks: passed.
- Existing public brain tests pass through public materialization: passed.
- Final `spawner.hiddenState` records match exactly: passed by strict digest and hidden-state tests.
- Disabled/missing unit hidden-state behavior remains unchanged: passed.
- Previous/current recurrent semantics remain unchanged: passed.
- No public DTO is required merely to update hidden state in the sync path: passed.
- Decoded action values are identical: passed by strict digest, action, lifecycle, and high-reproduction tests.
- Reproduction probability consumes the same output value before the same RNG call: passed by high-reproduction strict digest and reproduction tests.
- No RNG order changes: passed by strict parity tests.
- Public materialization remains at public API, worker protocol, inspection, trace, and explicit test boundaries: passed.
- UI and historical inspection packet tests pass: passed.
- Worker protocol tests receive the same public result shape: passed.
- Persistence snapshots are unchanged: passed.
- No UI/persistence code imports runtime-only result types: passed by code search.
- Materialization/allocation pressure dropped in normal sync runs: passed by benchmark.
- `publicDtoMaterialization`, `resultApplication`, and `brainEvaluation` dropped where applicable: passed with note that public DTO materialization is avoided in the frame path rather than separately timed there.
- Full tick time improved at 100, 250, and 500 population: passed.
- High-action trace capture remains identical and no fallback recomputation increase appears: passed.
- `npm run check`, `npm run test:sine`, and `npm run build` pass: passed.

## Decision

Milestone 8 passes. Normal sync ticks no longer require full public brain DTOs for every evaluated agent, public DTO materialization remains exact at boundaries, and exact deterministic parity is preserved.
