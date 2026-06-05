# Sine Exact-Parity Runtime Speedup M9 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 9.

## Summary

Milestone 9 revisited high-action food/trade runtime cost after the brain/result DTO speedups from Milestones 5-8.

The pre-M9 benchmark showed `foodResolution` was again the largest high-action phase at 100, 250, and 500 population. A narrow pending-only due queue was therefore justified and implemented.

The retained implementation keeps `world.foods` as the compatibility surface for UI, persistence, telemetry, chart packets, and headless recording. It does not add resolved-food retention buckets, per-creator pending indexes, or a second food lifecycle engine.

## Implementation

Changed runtime files:

- `src/sine/spawner/foodDueQueue.ts`
- `src/sine/spawner/reward.ts`
- `src/sine/spawner/world.ts`

Changed tests:

- `scripts/sine-tests/spawnerWorldFood.test.ts`

Key changes:

- Added a private WeakMap-backed pending due queue keyed by `SpawnerWorld`.
- `emitFood()` still appends each food marker to `world.foods`, then registers the pending marker with the due queue.
- `resolveFoods()` now asks the due queue for pending foods due at or before the current tick instead of scanning all retained resolved history.
- Due foods are resolved in original `world.foods` order, preserving same-tick and catch-up ordering semantics.
- Manual direct-test paths remain supported: the queue rebuilds from `world.foods` when the array reference changes and scans appended foods when needed.
- Resolved-food trimming now compacts `world.foods` in place through `trimResolvedFoodHistory()`, preserving pending foods and the compatibility array.

## Step 1: Current High-Action Food Costs

Pre-M9 benchmark artifact:

- `/tmp/sine-exact-parity-m9-step1-highaction.json`

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios high-action --brain-iterations 10
```

High-action pre-M9 totals over 200 ticks:

| Pop | Avg ms/tick | foodResolution ms | foodTrimming ms | Food sum ms | Avg pending | Avg retained | Avg due |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | `9.888` | `544.432` | `64.757` | `609.189` | `860.615` | `6542.665` | `52.145` |
| 250 | `23.913` | `1334.183` | `240.657` | `1574.840` | `2061.900` | `15980.395` | `124.880` |
| 500 | `49.054` | `2717.377` | `550.774` | `3268.151` | `4088.180` | `31366.325` | `243.460` |

Comparison points:

- Milestone 0 high-action top phases showed food resolution was already a major cost: `437.5 ms`, `1086.4 ms`, and `2279.9 ms` at 100, 250, and 500 population.
- Milestone 2 rejected a heavier private index shape. The rejected probe moved trimming near zero but increased resolution bookkeeping; at 250 population it measured `1341.7 ms` food resolution and `1.0 ms` trimming with total runtime slower than post-M1, and at 500 population it measured `2622.6 ms` food resolution and `0.5 ms` trimming with slower total runtime.
- Post-M8/pre-M9 still had food resolution as the top high-action phase, so a narrower pending-only prototype was justified.

## Step 2-4: Prototype, Integrate, Benchmark

Post-M9 high-action benchmark artifact:

- `/tmp/sine-exact-parity-m9-post-highaction.json`

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios high-action --brain-iterations 10
```

High-action pre/post comparison over 200 ticks:

| Pop | Avg ms/tick | foodResolution ms | foodTrimming ms | Food sum ms | Counts |
| ---: | ---: | ---: | ---: | ---: | --- |
| 100 | `9.888 -> 9.564` `-3.3%` | `544.432 -> 543.515` `-0.2%` | `64.757 -> 25.290` `-60.9%` | `609.189 -> 568.805` `-6.6%` | pending/retained/due unchanged |
| 250 | `23.913 -> 23.116` `-3.3%` | `1334.183 -> 1314.426` `-1.5%` | `240.657 -> 99.952` `-58.5%` | `1574.840 -> 1414.378` `-10.2%` | pending/retained/due unchanged |
| 500 | `49.054 -> 46.753` `-4.7%` | `2717.377 -> 2623.377` `-3.5%` | `550.774 -> 219.890` `-60.1%` | `3268.151 -> 2843.267` `-13.0%` | pending/retained/due unchanged |

Post-M9 normal baseline benchmark artifact:

- `/tmp/sine-exact-parity-m9-post-baseline.json`

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline --brain-iterations 10
```

Normal baseline versus documented post-M8 average tick time:

| Pop | Post-M8 avg ms/tick | Post-M9 avg ms/tick | Change |
| ---: | ---: | ---: | ---: |
| 100 | `7.914` | `7.594` | `-4.0%` |
| 250 | `18.045` | `17.805` | `-1.3%` |
| 500 | `36.819` | `36.713` | `-0.3%` |

Normal baseline did not regress materially.

## Contract Coverage Added

Added tests in `scripts/sine-tests/spawnerWorldFood.test.ts`:

- `Food Due Queue Preserves World Order For Due Foods`
- `Food Due Queue Picks Up Manual Appends After Resolve`
- `Food History Trim Keeps Pending Foods And Array Surface`

Existing coverage continues to check:

- food resolves exactly once
- same-tick creator death and later same-tick food credit policy
- dead-creator resolution policy
- payoff, learning, energy, health, and liveness behavior
- strict digest fields for food order, event order, learned state, hidden state, and headless chunk parity
- UI/packet/persistence/headless compatibility through existing packet, route, persistence, and headless tests

## Verification

Commands run:

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios high-action --brain-iterations 10
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline --brain-iterations 10
```

## Gate Status

- High-action phase totals identify current `foodResolution`, `foodTrimming`, retained-food count, due-food count, and pending-food count: passed.
- Results compare against Milestone 0, Milestone 2 rejected-index timing, and immediate pre-M9 timing: passed.
- Prototype preserves exact same-tick resolution order: passed by strict digest and direct food-order tests.
- Prototype preserves one-resolution-only semantics: passed.
- Prototype preserves dead-creator policy and learning behavior: passed.
- Prototype preserves retained resolved food visibility through `world.foods`: passed.
- Prototype benchmark shows `foodResolution + foodTrimming` improves before production integration: passed.
- Pending unresolved foods are never trimmed: passed.
- Resolved foods remain visible for the same configured retention window: passed.
- Event order, food order, payoff, learning, energy, health, and liveness are identical: passed by `npm run test:sine`.
- UI, persistence, telemetry, and headless recorder continue to use one compatibility boundary: passed; `world.foods` remains the boundary.
- No duplicate food lifecycle engine remains after integration: passed; only a private pending due queue supplements `world.foods`.
- High-action `foodResolution + foodTrimming` improves materially: passed at `-6.6%`, `-10.2%`, and `-13.0%`.
- Normal baseline does not regress materially: passed.
- Strict digest parity passes after retention windows are crossed: passed through existing exact parity and Sine contract tests.
- `npm run check`, `npm run test:sine`, and `npm run build` pass: passed.

## Decision

Keep the M9 pending-only due queue.

This is not the rejected Milestone 2 index shape: no resolved retention buckets, no per-creator pending-count index, no duplicate public lifecycle surface, and no UI/persistence/headless dependency on private queue internals. The retained change reduces high-action food lifecycle cost while preserving exact deterministic semantics and `world.foods` compatibility.
