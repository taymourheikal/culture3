# Sine Follow-On Runtime Hot-Path M5 Report

Milestone: `docs/plans/sine-follow-on-runtime-hotpath-plan.md` Milestone 5.

## Summary

Milestone 5 was accepted as a trace-local speedup and compact-representation cleanup, not as a broad whole-runtime speedup.

Accepted changes:

- Decision traces can now store compact activation arrays internally:
  - `connectionActivationSources`
  - `connectionActivationTargets`
- Runtime traces keep `connectionActivations` empty until a public boundary needs the legacy object map.
- Learning reads all trace activation data through `traceConnectionActivation()`.
- Public trace output is restored through `materializeDecisionTrace()`.
- Trace store cloning, digest code, and public snapshot paths materialize compact traces before exposing them.
- Compact and public trace learning are covered by focused tests.

The compact path preserves exact parity because it is lifetime-scoped to the already-owned runtime evaluation result. It does not add per-tick content signatures and does not duplicate the learning implementation.

## Audit Findings

Trace producers and consumers:

- `src/sine/spawner/world.ts` creates decision and reproduction traces.
- `src/sine/spawner/learning.ts` captures traces and applies learning.
- `src/sine/spawner/reward.ts` resolves food and applies food-resolution learning.
- `src/sine/spawner/plasticity.ts` owns trace store sanitization, cloning, activation access, and public materialization.
- `src/sine/spawner/snapshots.ts` consumes cloned/materialized trace stores at public/persistence boundaries.
- `src/sine/testing/strictWorldDigest.ts` and `src/sine/testing/worldDigest.ts` compare materialized public trace shapes.

Learning-required trace fields:

- trace id
- tick
- action
- strength
- active connection ids
- source and target activation values per active connection

Public inspection/persistence-required trace fields:

- the legacy `connectionActivations` object map keyed by innovation id
- stable trace id, tick, action, strength, and active connection ids

Current no-fallback behavior:

- Runtime trace materialization still replays the compact kernel from owned runtime arrays.
- Full fallback trace evaluation remains unused in benchmarked sync runtime paths.
- `fallbackTraceEvaluations` stayed `0` in every final benchmark row.

## Implementation

Core implementation:

- `src/sine/spawner/plasticity.ts`
  - added compact trace fields
  - added `traceConnectionActivation()`
  - added `materializeDecisionTrace()`
  - made `cloneTraceStore()` and trace sanitization return legacy public trace maps
- `src/sine/spawner/learning.ts`
  - routes learning through the shared accessor
  - stores compact arrays when trace activations are compact
- `src/sine/spawner/brain.ts`
  - added compact runtime trace activation materialization
- `src/sine/spawner/brainKernel.ts`
  - added a compact activation recorder keyed by compiled connection index
- `src/sine/spawner/world.ts`
  - uses compact runtime trace materialization in the tick loop
- `src/sine/testing/strictWorldDigest.ts`
  - materializes traces before strict comparison
- `src/sine/testing/worldDigest.ts`
  - materializes traces before digest comparison

Tests added:

- `Compact Trace Learning Matches Public Trace`
- `Compact Trace Materializes And Clones As Public Trace`
- `Compact Trace Missing Activation Matches Public Trace`
- `Resolved Food Applies Learning And Clears Trace` now checks that runtime traces stay compact and materialize to the expected public map.

## Benchmark

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10
```

Artifacts:

- Pre-M5: `docs/reports/sine-follow-on-runtime-hotpath-m5-pre.json`
- M5 final: `docs/reports/sine-follow-on-runtime-hotpath-m5-final-current.json`
- Earlier final samples:
  - `docs/reports/sine-follow-on-runtime-hotpath-m5-final.json`
  - `docs/reports/sine-follow-on-runtime-hotpath-m5-final-repeat.json`

Immediate pre-M5 comparison:

| Scenario | Pop | Total change | decisionTraceCapture | traceActivationMaterialization | trace combined | optimized mats | fallback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `+15.9%` | `-62.6%` | `-70.6%` | `-66.4%` | `855` | `0` |
| baseline | 250 | `+18.0%` | `-70.6%` | `-76.6%` | `-73.5%` | `1892` | `0` |
| baseline | 500 | `+17.5%` | `-70.3%` | `-75.4%` | `-72.7%` | `3664` | `0` |
| mostly-waiting | 100 | `+13.9%` | `+0.0%` | `+0.0%` | `+0.0%` | `0` | `0` |
| mostly-waiting | 250 | `+4.1%` | `+0.0%` | `+0.0%` | `+0.0%` | `0` | `0` |
| mostly-waiting | 500 | `+16.8%` | `+0.0%` | `+0.0%` | `+0.0%` | `0` | `0` |
| high-action | 100 | `-5.0%` | `-75.4%` | `-78.2%` | `-76.7%` | `10796` | `0` |
| high-action | 250 | `-5.3%` | `-77.7%` | `-79.9%` | `-78.8%` | `25816` | `0` |
| high-action | 500 | `+0.0%` | `-74.9%` | `-76.9%` | `-75.9%` | `50428` | `0` |
| high-reproduction | 100 | `-1.6%` | `+0.0%` | `-71.4%` | `-71.4%` | `100` | `0` |
| high-reproduction | 250 | `+16.2%` | `+0.0%` | `-67.6%` | `-67.6%` | `250` | `0` |
| high-reproduction | 500 | `+12.1%` | `+0.0%` | `-71.6%` | `-71.6%` | `500` | `0` |

High-action comparison against M13:

| Pop | M13 total | M5 total | Total change | M13 trace mat | M5 trace mat | Trace mat change | fallback |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | `1527.0 ms` | `1553.5 ms` | `+1.7%` | `172.6 ms` | `39.6 ms` | `-77.1%` | `0` |
| 250 | `3680.3 ms` | `3861.2 ms` | `+4.9%` | `415.6 ms` | `97.0 ms` | `-76.7%` | `0` |
| 500 | `7495.5 ms` | `7848.2 ms` | `+4.7%` | `894.7 ms` | `214.1 ms` | `-76.1%` | `0` |

Result:

- Trace capture/materialization cost improved materially, especially in high-action runs.
- High-action total runtime improved against the immediate pre-M5 artifact at 100 and 250 population and was flat at 500 population.
- Total runtime did not improve against the older M13 artifact.
- Baseline and mostly-waiting rows show total-runtime regressions even though mostly-waiting performs no trace materialization at all. That means this milestone should not be credited as a broad runtime speedup.
- The retained value is narrower: less object/map materialization on trace-producing ticks while preserving public compatibility.

## Verification

Commands run:

```bash
npm run check
npm run test:sine
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10
```

Results:

- `npm run check`: passed.
- `npm run test:sine`: passed.
- Strict digest parity scenarios in `npm run test:sine`: passed.
- Headless chunk strict digest parity in `npm run test:sine`: passed.
- Final benchmark completed and was written to `docs/reports/sine-follow-on-runtime-hotpath-m5-final-current.json`.

`npm run build` was not required because no accepted UI, worker protocol, server integration, or persistence schema changes were made.

## Milestone 5 Exit Gate Review

- All trace fields required by learning are listed: passed.
- All trace fields required by inspection/persistence are listed: passed.
- Current no-fallback recomputation behavior is documented: passed.
- Legacy public trace shape requirement is identified: passed.
- Strict digest and snapshot materialization requirements are identified: passed.
- Current public trace records are read through the shared accessor: passed.
- Learning no longer reaches directly into `trace.connectionActivations[String(innovationId)]`: passed.
- Missing-activation behavior is preserved exactly: passed by `Compact Trace Missing Activation Matches Public Trace`.
- Compact traces preserve trace id, tick, decoded action/strength, active connection ids, and activation values exactly: passed by learning and digest tests.
- Array order is deterministic and tied to the compiled plan/runtime result: passed by using compiled connection indexes and strict parity tests.
- Compact trace validity is based on ownership/lifetime, not per-tick content signatures: passed.
- Legacy public trace shape can be materialized at inspection/persistence boundaries: passed.
- Compact-to-public materialization matches the old trace shape: passed.
- Strict digest comparison materializes compact traces before comparing: passed.
- Learning formulas are unchanged: passed by public-vs-compact learning equality and existing learning tests.
- No duplicated learning loop exists: passed.
- Output-bias, gate-bias, and connection-weight updates are unchanged: passed by learning tests.
- The tick loop avoids full activation record construction for learning-only traces: passed.
- Inspection and persistence receive the same public data when requested: passed by clone/materialization tests and persistence tests.
- `fallbackTraceEvaluations` remains zero: passed in every benchmark row.
- Trace ids and deletion/retention behavior are unchanged: passed by trace clearing/pruning tests.
- High-action trace count is unchanged: passed; final high-action trace counts match the pre-M5 action counts.
- No per-agent/per-tick full content signature was added: passed.
- `decisionTraceCapture`, optimized trace materialization count, fallback trace count, and high-action total runtime are compared against M13: passed.
- Strict digest parity includes trace ids, active connection ids, activation values, learned state, and event order: passed.

## Milestone 5 Exit Gates

- Trace capture remains no-fallback: passed.
- Learning consumes identical activation values: passed.
- Public inspection/persistence trace output remains compatible: passed.
- High-action trace materialization cost improves or compact path is narrowed/rejected: passed as a trace-local speedup, not a broad runtime speedup.
- No duplicate learning implementation remains: passed.
