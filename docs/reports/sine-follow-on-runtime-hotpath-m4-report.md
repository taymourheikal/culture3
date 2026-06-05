# Sine Follow-On Runtime Hot-Path M4 Report

Milestone: `docs/plans/sine-follow-on-runtime-hotpath-plan.md` Milestone 4.

## Summary

Milestone 4 was accepted as a narrow food due-queue hardening change, not as a material high-action speedup.

Accepted changes:

- `FoodDueQueueState` now tracks `earliestDueTick`.
- `duePendingFoods()` returns immediately when no pending food can resolve at the current tick.
- Due entry sorting is skipped when only one due bucket is being resolved.
- Existing `world.foods` compatibility remains the public boundary.
- No broad food lifecycle index, per-creator pending index, resolved-food retention bucket, or compatibility signature layer was added.

Not retained:

- No rolling payoff fixed-window helper was added. Current payoff windows are small (`recentResolvedPayoffWindow` default `50`, `agentRecentPayoffWindow` default `12`), and the benchmark did not isolate `shift()` windows as a material bottleneck.

## Audit Findings

Current food lifecycle:

- `emitFood()` appends pending foods to `world.foods`, registers them with the due queue, emits a spawn event, increments `nextFoodId`, charges spawn energy, and updates `lastAction`.
- `resolveFoods()` asks `duePendingFoods()` for pending foods due at or before `world.tick`.
- `resolveFoods()` preserves creator policy:
  - world stats and resolve events always update for resolved food
  - living creators receive learning, payoff stats, energy, and health updates
  - dead or no-longer-living creators do not receive later learning/stat mutation
- `trimResolvedFoodHistory()` keeps pending foods and recent resolved food, mutating the same public `world.foods` array.

Current due queue behavior:

- The queue is keyed by `SpawnerWorld` in a `WeakMap`.
- It scans new appends from `nextScanIndex`.
- It rebuilds when `world.foods` is replaced or when the tracked scan index is beyond the array length.
- Pending food entries retain an insertion `order` so same-tick and catch-up resolution can preserve public `world.foods` order.

Manual compatibility:

- Direct append to the same `world.foods` array is picked up by scanning from `nextScanIndex`.
- Direct array replacement rebuilds the queue from the new array.
- Trimming keeps the same array surface and leaves pending entries resolvable.

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

- Pre-M4: `docs/reports/sine-follow-on-runtime-hotpath-m4-pre.json`
- M4 final: `docs/reports/sine-follow-on-runtime-hotpath-m4-final.json`

Immediate pre-M4 comparison:

| Scenario | Pop | Total change | foodResolution | due avg | due max | pending avg | retained avg | foodTrimming |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `-0.8%` | `-3.7%` | `4.0` | `11` | `67.7` | `467.4` | `0.0%` |
| baseline | 250 | `+0.4%` | `-2.7%` | `8.9` | `21` | `149.0` | `1065.2` | `-5.0%` |
| baseline | 500 | `-0.3%` | `-1.6%` | `17.3` | `33` | `292.3` | `2061.1` | `-1.2%` |
| mostly-waiting | 100 | `-1.7%` | `0.0%` | `0.0` | `0` | `0.0` | `0.0` | `0.0%` |
| mostly-waiting | 250 | `+2.5%` | `-5.9%` | `0.0` | `0` | `0.0` | `0.0` | `0.0%` |
| mostly-waiting | 500 | `-1.0%` | `+29.0%` | `0.0` | `0` | `0.0` | `0.0` | `0.0%` |
| high-action | 100 | `+0.6%` | `-0.0%` | `52.1` | `107` | `860.6` | `6596.6` | `+4.3%` |
| high-action | 250 | `+0.2%` | `-1.1%` | `124.9` | `267` | `2061.9` | `16109.5` | `-5.6%` |
| high-action | 500 | `+0.9%` | `+0.1%` | `243.5` | `516` | `4088.2` | `31618.5` | `-15.7%` |
| high-reproduction | 100 | `-2.5%` | `-27.8%` | `0.0` | `0` | `0.0` | `0.0` | `0.0%` |
| high-reproduction | 250 | `-3.6%` | `+10.5%` | `0.0` | `0` | `0.0` | `0.0` | `-33.3%` |
| high-reproduction | 500 | `+1.1%` | `-1.8%` | `0.0` | `0` | `0.0` | `0.0` | `0.0%` |

M13 comparison:

| Scenario | Pop | Total vs M13 | foodResolution vs M13 |
| --- | ---: | ---: | ---: |
| baseline | 100 | `-1.5%` | `-0.4%` |
| baseline | 250 | `+1.0%` | `-1.2%` |
| baseline | 500 | `+1.9%` | `+0.7%` |
| mostly-waiting | 100 | `-0.4%` | `0.0%` |
| mostly-waiting | 250 | `+3.3%` | `+6.7%` |
| mostly-waiting | 500 | `-0.0%` | `+33.3%` |
| high-action | 100 | `+1.6%` | `+4.5%` |
| high-action | 250 | `+2.2%` | `+1.4%` |
| high-action | 500 | `+2.3%` | `+1.7%` |
| high-reproduction | 100 | `+1.3%` | `0.0%` |
| high-reproduction | 250 | `+0.2%` | `+13.5%` |
| high-reproduction | 500 | `+0.1%` | `0.0%` |

Result:

- The earliest-due fast path is correct and narrow.
- It gives small baseline/no-due benefits but does not materially improve high-action runtime.
- M4 should not be counted as a speedup milestone.
- The retained change is acceptable as queue simplification/hardening because total runtime stays within the benchmark noise envelope and no compatibility behavior changed.

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
- Final benchmark completed and was written to `docs/reports/sine-follow-on-runtime-hotpath-m4-final.json`.

`npm run build` was not required because no accepted UI, worker protocol, server integration, or persistence changes were made.

## Milestone 4 Exit Gate Review

- Current pending-food queue behavior is documented: passed.
- Manual direct-test append/rebuild behavior is accounted for: passed by `Food Due Queue Picks Up Manual Appends After Resolve` and `Food Due Queue Rebuilds Earliest Due After Array Replacement`.
- Same-tick due order is characterized: passed by `Food Due Queue Preserves World Order For Due Foods` and strict parity tests.
- Dead-creator resolution policy is accounted for: passed by `Dead Creator Food Resolves Without Mutating Dead Spawner` and `Creator Killed By First Same Tick Food Does Not Receive Later Same Tick Credit`.
- The queue tracks an exact earliest pending resolve tick: passed by implementation and `Food Due Queue Skips Until Earliest Due Tick`.
- Empty/non-due ticks return without scanning all buckets: passed by `earliestDueTick` fast path.
- Queue rebuild from direct `world.foods` mutation recomputes earliest due tick: passed by array replacement test.
- Food due at or before current tick resolves in original world order: passed by order and strict parity tests.
- Due ordering is centralized in the due queue: passed. `resolveFoods()` still consumes `duePendingFoods()` and does not sort.
- No per-creator pending-count index or resolved-food retention bucket is introduced: passed.
- Public recent-payoff arrays/materialized values remain identical: passed. No payoff-window helper was retained.
- High-action food-resolution cost improves or the change is narrowed/rejected: passed as narrowed queue hardening, not a high-action speedup.

## Milestone 4 Exit Gates

- The accepted M9 due-queue architecture remains simple and narrow: passed.
- No duplicate food lifecycle engine exists: passed.
- `world.foods` remains the compatibility boundary: passed.
- Manual `world.foods` mutation compatibility is preserved: passed.
- No broad compatibility-signature layer is introduced around `world.foods`: passed.
- High-action food-resolution cost improves or the change is narrowed/rejected: passed as narrowed/hardening work.
- Functional parity is exact: passed through Sine contract tests and strict digest parity.
