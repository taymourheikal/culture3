# Sine Housekeeping Runtime Cleanup M2 Report

Milestone 2 removed the repeated per-learning active-connection `Map` rebuild and routed learning connection lookup through the existing compiled brain plan.

## Changes

- Extended `CompiledBrainPlan` with `activeConnections`, aligned with `activeConnectionIds`.
- Added `activeConnectionForInnovation(plan, innovationId)` as the single plan-level lookup helper.
- Updated `applyLearningSignal()` to call `ensureCompiledBrainPlan(spawner.genome)` and resolve trace connection ids through the compiled plan.
- Removed the per-call `new Map(activeConnections(spawner.genome).map(...))` allocation from learning.
- Added focused tests for:
  - public trace learning,
  - compact trace learning,
  - missing trace activations,
  - trace ids absent from the current genome,
  - disabled connections and disabled units,
  - long/short/strength output-bias learning,
  - hidden gate-bias learning,
  - reproduction learning with `skipActionOutputBias`,
  - active connection alignment in the compiled brain plan.

## Functional Parity

Learning formulas were not changed. The refactor only changes how an active connection is found for a trace innovation id.

The same behavior is preserved for:

- missing trace ids,
- missing activations,
- stale trace ids not present in the current genome,
- disabled connections,
- disabled source/target units,
- public trace activation maps,
- compact trace activation arrays,
- action output-bias helpers,
- reproduction learning.

## Verification

Commands run:

```bash
npm run test:sine
npm run check
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,high-action,high-reproduction \
  --brain-iterations 10
```

Artifacts:

- `docs/reports/sine-housekeeping-runtime-cleanup-m2-benchmark.json`

Results:

- `npm run test:sine` passed before the production lookup refactor after characterization tests were added.
- `npm run test:sine` passed after the refactor.
- `npm run check` passed after the refactor.
- `rg "new Map\\(activeConnections" src/sine/spawner` returns no matches.

## Benchmark Summary

The benchmark does not expose learning as a standalone phase bucket. Learning-adjacent cost is mostly visible through total runtime and food/reproduction-heavy scenarios.

| Scenario | Pop | Current elapsed ms / 200 ticks | Current ms/tick |
| --- | ---: | ---: | ---: |
| baseline | 100 | `1311.324` | `6.557` |
| baseline | 250 | `3087.662` | `15.438` |
| baseline | 500 | `6373.181` | `31.866` |
| high-action | 100 | `1464.060` | `7.320` |
| high-action | 250 | `3505.629` | `17.528` |
| high-action | 500 | `7189.017` | `35.945` |
| high-reproduction | 100 | `1804.347` | `9.022` |
| high-reproduction | 250 | `4686.639` | `23.433` |
| high-reproduction | 500 | `9919.477` | `49.597` |

Nearest retained historical comparison: `docs/reports/sine-follow-on-runtime-hotpath-m2-final.json`.

| Scenario | Pop | Historical elapsed ms | Current elapsed ms | Change |
| --- | ---: | ---: | ---: | ---: |
| baseline | 100 | `1301.483` | `1311.324` | `+0.8%` |
| baseline | 250 | `3036.248` | `3087.662` | `+1.7%` |
| baseline | 500 | `6377.693` | `6373.181` | `-0.1%` |
| high-action | 100 | `1545.266` | `1464.060` | `-5.3%` |
| high-action | 250 | `3887.705` | `3505.629` | `-9.8%` |
| high-action | 500 | `7870.730` | `7189.017` | `-8.7%` |
| high-reproduction | 100 | `1914.217` | `1804.347` | `-5.7%` |
| high-reproduction | 250 | `5069.101` | `4686.639` | `-7.5%` |
| high-reproduction | 500 | `10393.947` | `9919.477` | `-4.6%` |

Interpretation:

- Baseline movement is essentially flat and within normal benchmark noise.
- High-action and high-reproduction rows are faster versus the nearest retained historical artifact, but this should be treated as a broad runtime comparison, not a clean isolated measurement of learning lookup alone.
- The change is worth retaining because it removes a repeated allocation, uses the canonical topology cache, and preserved exact parity.

## Exit Gate Status

- Repeated per-learning active-connection `Map` construction is removed: passed.
- Compiled brain plan remains the only topology cache used for this lookup: passed.
- Learning formulas and learned-state updates are exactly unchanged: passed by focused tests and strict digest tests.
- Strict digest parity passes: passed through `npm run test:sine`.
- `npm run check` passes: passed.
- `npm run test:sine` passes: passed.
- Hot-path benchmark results are documented: passed.
