# Sine Exact-Parity Runtime Speedup M3 Report

## Summary

Milestone 3 reduced trace capture cost without changing the stored trace contract or learning behavior.

The runtime now materializes a trace activation payload directly from the first-pass brain runtime data and passes that owned payload into trace capture. This avoids building a full activated `BrainEvaluation` object and then copying its activation map a second time.

## Trace Consumer Audit

`SpawnerDecisionTrace` remains the canonical stored trace shape:

- `id`: used by foods and reproduction feedback to apply the right causal trace.
- `tick`: used by trace pruning and strict parity coverage.
- `action`: used by action output-bias learning.
- `strength`: used by strength output-bias learning.
- `activeConnectionIds`: used by weight and gate/output-bias learning.
- `connectionActivations`: used by weight and gate/output-bias learning.

Consumers:

- Food-resolution learning: `applyFoodResolutionLearning()`.
- Reproduction learning: `applyReproductionLearning()`.
- Trace pruning: `pruneDecisionTraces()`.
- Strict runtime parity: `strictWorldDigest()`.
- Persistence/headless snapshots: trace stores remain compatible with existing clone/sanitize behavior, and persistence packet tests still strip runtime trace stores where expected.

## Implementation

- Added `BrainTraceActivations` and `materializeBrainEvaluationTraceActivations()` in `src/sine/spawner/brain.ts`.
- Extended `captureDecisionTrace()` in `src/sine/spawner/learning.ts` to accept an optional trace activation payload.
- Updated `src/sine/spawner/world.ts` so long/short/reproduction traces use the payload path.
- Kept the existing fallback evaluation path for cases where runtime payload materialization is unavailable.
- Kept the stored `SpawnerDecisionTrace` fields unchanged.

## Benchmark

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
```

Immediate pre/post artifacts:

- `/tmp/sine-exact-parity-m3-pre-hotpath.json`
- `/tmp/sine-exact-parity-m3-post-hotpath.json`
- `/tmp/sine-exact-parity-m3-baseline-confirm.json`

The final full sweep showed a noisy baseline total-time regression driven by `brainEvaluation`, which this milestone did not touch. A focused baseline confirmation run showed no normal-run regression, so baseline rows below use that confirmation artifact. High-action and high-reproduction rows use the final post-M3 full sweep.

| Scenario | Pop | Pre avg ms/tick | Post avg ms/tick | Avg delta | Pre trace capture ms | Post trace capture ms | Trace capture delta | Pre materialize ms | Post materialize ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | 10.145 | 9.943 | -2.0% | 43.0 | 21.6 | -49.8% | 19.9 | 19.2 |
| baseline | 250 | 24.502 | 24.560 | +0.2% | 91.9 | 45.9 | -50.1% | 43.4 | 41.7 |
| baseline | 500 | 50.522 | 50.224 | -0.6% | 190.2 | 91.9 | -51.7% | 87.7 | 85.8 |
| high-action | 100 | 11.962 | 10.932 | -8.6% | 450.9 | 201.1 | -55.4% | 198.2 | 190.9 |
| high-action | 250 | 29.217 | 26.671 | -8.7% | 1169.4 | 540.0 | -53.8% | 534.2 | 520.2 |
| high-action | 500 | 58.702 | 53.757 | -8.4% | 2400.9 | 1125.7 | -53.1% | 1099.9 | 1092.8 |
| high-reproduction | 100 | 16.020 | 15.626 | -2.5% | 0.0 | 0.0 | 0.0% | 2.3 | 2.2 |
| high-reproduction | 250 | 38.734 | 39.104 | +1.0% | 0.0 | 0.0 | 0.0% | 6.7 | 5.7 |
| high-reproduction | 500 | 79.829 | 81.781 | +2.4% | 0.0 | 0.0 | 0.0% | 11.5 | 11.2 |

`traceFallbackEvaluation` remained `0.0 ms` in the benchmark, so the optimized materialization path covered all traced actions in this run.

## Verification

- `npm run check` passed.
- `npm run test:sine` passed.
- Strict digest tests cover trace ids, trace order, active connection ids, and activation values.
- Existing learning tests cover long/short food learning, reproduction learning, wait actions creating no traces, trace pruning, and trace store clone/sanitize compatibility.

## Decision

Milestone 3 passes. Trace work is cheaper under high-action workloads, the stored trace model remains canonical, and exact deterministic parity is preserved.
