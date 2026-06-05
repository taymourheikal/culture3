# Sine Follow-On Runtime Hot-Path M3 Report

Milestone: `docs/plans/sine-follow-on-runtime-hotpath-plan.md` Milestone 3.

## Summary

Milestone 3 was evaluated and rejected as a retained runtime optimization.

The goal was to reduce learned-state view construction, learned-state decay overhead, and effective brain value array construction with explicit invalidation discipline. The implementation attempt used private, signature-guarded caches for:

- plan-aligned learned-state views
- plan-aligned effective brain value arrays

That cache path preserved correctness in focused tests, including direct in-place mutation of learned-state maps and genome base values, but benchmark results showed the exact signature guards were much more expensive than rebuilding the values. The attempted cache path was removed.

Accepted result:

- No learned/effective cache code remains.
- Public learned-state maps remain the source of truth.
- Effective brain output behavior remains unchanged.
- The milestone is classified as rejected/narrowed, not a speedup.

## Audit Findings

Learned-state mutation paths:

- `src/sine/spawner/learning.ts`
  - `applyLearningSignal()` mutates `connectionDeltas`, `outputBiasDeltas`, `gateBiasDeltas`, `recentLearningSignal`, and `learningUpdateCount`, then replaces `spawner.learnedState` through `clampLearnedState()`.
  - `applyReproductionLearning()` can increment `reproductionLearningCount`.
- `src/sine/spawner/plasticity.ts`
  - `decayLearnedState()` can return the same learned-state object when no decay applies, or a replacement object when deltas decay.
  - `clampLearnedState()` and `sanitizeLearnedState()` can replace learned-state maps.
- `src/sine/spawner/world.ts`
  - the tick loop assigns the result of `decayLearnedState()` back to each spawner.
- Tests and tooling mutate learned-state maps directly.

Genome/base-value and topology mutation paths:

- `src/sine/spawner/genome.ts` and related genome mutation helpers mutate/inherit units, connections, weights, output biases, gate biases, topology, perception, payoff, trading, mutation, and plasticity profiles when creating child genomes.
- `src/sine/spawner/worldActions.ts`
  - reproduction materializes learned deltas into an inherited effective genome through `materializeEffectiveGenomeForInheritance()`, then mutates the inherited genome for the child.
- `src/sine/spawner/brainPlan.ts`
  - `ensureCompiledBrainPlan()` already guards topology mutation with `brainPlanSignature()`.
  - `brainGenomeCacheSignature()` includes topology, connection weights, output biases, gate biases, and `maxLearnedDelta`.
- Tests and tooling mutate genome weights, biases, and enabled flags directly.

Cache safety conclusion:

- Runtime-owned version counters alone are not safe today because direct mutation is an established test/tooling behavior.
- Direct-mutation-safe caches require exact content signatures.
- Exact signatures preserve parity but were too expensive for the hot path.

## Rejected Cache Attempt

Temporary implementation:

- added `src/sine/spawner/runtimeBrainCache.ts`
- routed `buildSpawnerEvaluationFrame()` through a cached learned-state view
- routed `evaluateBrainRuntime()` through cached effective arrays
- added focused stale-cache tests for direct learned-state and genome mutation

Those changes were removed after benchmarking.

Rejected artifact:

- `docs/reports/sine-follow-on-runtime-hotpath-m3-rejected-cache.json`

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

- Pre-M3: `docs/reports/sine-follow-on-runtime-hotpath-m3-pre.json`
- Rejected cache: `docs/reports/sine-follow-on-runtime-hotpath-m3-rejected-cache.json`
- Accepted final: `docs/reports/sine-follow-on-runtime-hotpath-m3-final.json`

| Scenario | Pop | Pre ms/tick | Rejected cache | Accepted final | Cache change | Final change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `6.844` | `12.616` | `6.539` | `+84.3%` | `-4.4%` |
| baseline | 250 | `15.329` | `29.392` | `15.658` | `+91.7%` | `+2.1%` |
| baseline | 500 | `31.515` | `57.601` | `32.078` | `+82.8%` | `+1.8%` |
| mostly-waiting | 100 | `3.037` | `5.377` | `3.305` | `+77.0%` | `+8.8%` |
| mostly-waiting | 250 | `7.890` | `15.302` | `7.901` | `+94.0%` | `+0.1%` |
| mostly-waiting | 500 | `16.131` | `28.789` | `16.475` | `+78.5%` | `+2.1%` |
| high-action | 100 | `7.708` | `11.511` | `7.475` | `+49.3%` | `-3.0%` |
| high-action | 250 | `19.057` | `29.567` | `18.702` | `+55.1%` | `-1.9%` |
| high-action | 500 | `37.972` | `59.176` | `38.009` | `+55.8%` | `+0.1%` |
| high-reproduction | 100 | `9.060` | `20.626` | `9.469` | `+127.7%` | `+4.5%` |
| high-reproduction | 250 | `23.967` | `46.197` | `24.063` | `+92.7%` | `+0.4%` |
| high-reproduction | 500 | `49.930` | `91.882` | `50.532` | `+84.0%` | `+1.2%` |

Result:

- Exact signature-guarded caching was rejected.
- Accepted final timing is near the pre-M3 envelope; small differences are benchmark noise because no M3 runtime code was retained.

## Verification

Commands run after removing the rejected cache path:

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
- Final benchmark completed and was written to `docs/reports/sine-follow-on-runtime-hotpath-m3-final.json`.

`npm run build` was not required because no accepted UI, worker protocol, server integration, or persistence changes were retained.

## Milestone 3 Exit Gate Review

- Accepted learned-state and effective-value caches have explicit invalidation: not applicable. The cache path was rejected and removed.
- Public learned-state maps remain the source of truth: passed. No retained cache changes public learned state.
- Effective brain outputs are exactly unchanged: passed by `npm run test:sine`, including brain evaluation, reproduction inheritance, and strict digest tests.
- Strict digest parity passes across all benchmark scenarios: passed through `npm run test:sine`.
- Benchmark evidence shows whether cache reuse outweighs invalidation/signature overhead: passed. It does not; exact signatures made total runtime much worse.
- Restored/headless/historical agents cannot observe stale runtime cache state: passed by removal. No stale runtime cache exists.
- If caches are rejected, the report documents the exact reason and no partial duplicate cache path remains: passed. `rg "runtimeBrainCache|getCachedPlanAligned|learnedViewCache|effectiveValueCache" src/sine scripts/sine-tests` returns no matches.

Milestone 3 passes as a rejected/narrowed milestone with no retained runtime implementation.
