# Sine Simplification Milestone 5 Report

Milestone: `docs/plans/sine-simplification-performance-plan.md` Milestone 5.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineBrowserPerf.ts
```

All commands completed successfully.

## Changes

- `src/sine/spawner/brainPlan.ts` now compiles plan-indexed connection refs, source hidden-unit indexes, connection indexes, and topology fingerprints alongside the existing public plan fields.
- `src/sine/spawner/effectiveGenome.ts` now exposes `createPlanAlignedEffectiveBrainValues()`, which materializes connection weights, output biases, and gate biases into arrays keyed by the compiled plan.
- Object-based effective-value access remains available and now shares the same effective-value helper functions used by the plan-aligned path.
- `src/sine/spawner/brain.ts` now uses plan-aligned arrays on the normal/default evaluation path and falls back to object getters when an external effective genome view is supplied.
- The topology verifier is explicit opt-in for tests/debugging. Runtime evaluation trusts the selected compiled plan to avoid rechecking topology on every forward pass.

## Runtime Comparison

`npx tsx scripts/sinePerf.ts`, final Milestone 5 pass:

| Benchmark | Milestone 0 ms | Milestone 2 ms | Milestone 3 ms | Pre-M5 ms | Post-M5 ms | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Pure advance, 100 pop / 200 ticks | 2417.4 | 2493.6 | 2454.5 | 2028.6 | 1781.3 | Improved versus immediate baseline. |
| Pure advance, 250 pop / 200 ticks | 5936.0 | 5866.3 | 5786.1 | 4959.6 | 4379.6 | Improved versus immediate baseline. |
| Pure advance, 500 pop / 200 ticks | 12062.7 | 11807.3 | 11703.0 | 9944.2 | 8984.8 | Improved versus immediate baseline. |
| Async sync-runner, 100 pop / 200 ticks | 2236.5 | 2347.0 | - | 1974.0 | 1643.3 | Improved versus immediate baseline. |
| Async sync-runner, 250 pop / 200 ticks | 5873.5 | 6133.7 | - | 4868.4 | 4361.5 | Improved versus immediate baseline. |
| Async sync-runner, 500 pop / 200 ticks | 11988.2 | 12191.6 | - | 9893.3 | 8835.6 | Improved versus immediate baseline. |
| Node parallel-pool fallback, 100 pop / 200 ticks | 2226.5 | 2243.5 | - | 1905.1 | 1620.9 | `browserWorkerApiAvailable: false`. |
| Node parallel-pool fallback, 250 pop / 200 ticks | 5889.1 | 5864.1 | - | 4859.6 | 4307.3 | `browserWorkerApiAvailable: false`. |
| Node parallel-pool fallback, 500 pop / 200 ticks | 12147.2 | 11952.8 | - | 9927.1 | 9004.1 | `browserWorkerApiAvailable: false`. |

## Brain Hot-Path Timing

| Benchmark | Milestone 0 ms | Milestone 2 ms | Milestone 3 ms | Pre-M5 ms | Post-M5 ms | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| RNN cached plan, 100 pop | 5.688 | - | 5.5 | 4.654 | 3.850 | Improved. |
| RNN cached plan, 250 pop | 13.732 | - | 13.5 | 11.594 | 8.504 | Improved. |
| RNN cached plan, 500 pop | 27.927 | - | 27.8 | 23.454 | 18.322 | Improved. |
| RNN fresh plan, 100 pop | 7.541 | - | - | 5.976 | 7.188 | Slower because fresh compilation now builds indexed plan metadata. |
| RNN fresh plan, 250 pop | 19.433 | - | - | 15.226 | 18.997 | Slower because fresh compilation now builds indexed plan metadata. |
| RNN fresh plan, 500 pop | 38.052 | - | - | 30.245 | 37.953 | Near Milestone 0, slower than immediate baseline. |

The main runtime uses cached compiled plans, so the cached-plan and full-advance improvements are the relevant speed result. Fresh-plan timing is still measured because it exposes the cost of richer plan compilation.

## Browser Worker Timing

`npx tsx scripts/sineBrowserPerf.ts`, final Milestone 5 pass:

| Benchmark | Milestone 0 ms | Post-M5 ms | Notes |
| --- | ---: | ---: | --- |
| Browser sync advance, 100 pop / 200 ticks | 1828.1 | 1435.3 | Improved. |
| Browser sync advance, 250 pop / 200 ticks | 4516.3 | 3487.3 | Improved. |
| Browser sync advance, 500 pop / 200 ticks | 9368.5 | 7084.6 | Improved. |
| Browser parallel 4 workers, 100 pop / 200 ticks | 2318.3 | 1922.3 | Improved versus old parallel, still slower than sync. |
| Browser parallel 4 workers, 250 pop / 200 ticks | 5217.8 | 4330.3 | Improved versus old parallel, still slower than sync. |
| Browser parallel 4 workers, 500 pop / 200 ticks | 10654.3 | 8609.8 | Improved versus old parallel, still slower than sync. |

Browser parallelism is still not a speed win through 500 population. This milestone improves both browser sync and browser parallel because both paths use the same optimized brain evaluator, but it does not justify expanding worker complexity.

## Functional Parity Evidence

- Existing sync, pure, async sync-runner, stale/missing/failed async result, and worker-pool contract tests still pass.
- Existing `brainGenomeCacheSignature()` tests still pass for weight-only, output-bias, gate-bias, topology, and max-delta cache semantics.
- New tests cover:
  - plan-aligned effective arrays matching object-based effective values
  - learned-state deltas and max learned-delta clamps changing effective array values
  - base connection weight, output bias, and gate bias changes changing effective array values while reusing a cached topology plan
  - explicit topology verification rejecting a stale compiled plan
- Activation payload parity is covered by the compiled-plan golden test, including outputs, hidden state, active connection IDs, and connection activation maps.
- `includeActivations: false` and `includePreviousState: false` still pass compact payload tests and avoid trace-only response fields.

## Allocation And Cache Notes

- No new long-lived effective-array cache was added. Plan-aligned arrays are per-evaluation objects and do not accumulate stale arrays for dead agents.
- Existing main/worker plan and genome caches remain bounded.
- Cached worker genome keys still use `brainGenomeCacheSignature()`, which includes structural plan signature, connection weights, output biases, gate biases, and max learned-delta cap.
- Learned-state-specific arrays are not cached globally, so cache keys do not need to encode learned deltas.

## Plan Impact

Milestone 5 produced the first clear improvement in the core full-advance runtime since the simplification plan began. The useful optimization was not browser-worker parallelism; it was reducing per-forward-pass string-key/map lookup work on the cached-plan path. The remaining plan should still treat browser parallelism cautiously and should not add worker complexity unless Milestone 6 shows a real browser sync-vs-parallel win at a higher population or with a lower-transfer payload shape.
