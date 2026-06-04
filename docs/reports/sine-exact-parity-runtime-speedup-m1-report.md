# Sine Exact-Parity Runtime Speedup Milestone 1 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 1.

## Goal

Reduce ordinary tick-loop learned-state decay cost while preserving exact deterministic runtime behavior.

Milestone 1 changes learned-state decay only. It does not change reward, payoff, learning signals, mutation, reproduction, death, market inputs, trace capture, persistence schemas, UI behavior, or headless behavior.

## What Changed

- Added `learnedStateDecayCanChange()` in `src/sine/spawner/plasticity.ts`.
- Kept learned-state decay in one canonical function, `decayLearnedState()`.
- Added an explicit `assumeNormalizedRuntimeState` option to `decayLearnedState()` for the world tick loop.
- Updated `src/sine/spawner/world.ts` to use the runtime-normalized decay path for live spawners.
- Added plasticity tests for:
  - empty learned-state maps
  - zero decay rate
  - active learned deltas
  - zero-valued delta entries
  - normalized cap-bound states
  - canonical decay versus runtime-normalized decay equality

The runtime-normalized path is valid for live spawner state because spawner learned state and plasticity profiles are already normalized when created, loaded, mutated, and updated. The public/default `decayLearnedState()` path still sanitizes partial or unsafe inputs.

## Benchmark Command

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  > /tmp/sine-exact-parity-m1-hotpath.json
```

This benchmark writes JSON to `/tmp` and does not touch production DBs.

## Timing Comparison

Compared against `/tmp/sine-exact-parity-m0-hotpath-baseline.json`, recorded in `docs/reports/sine-exact-parity-runtime-speedup-m0-baseline.md`.

| Scenario | Pop | M0 learned ms | M1 learned ms | Change | M0 avg tick ms | M1 avg tick ms | Change | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| baseline | 100 | 455.481 | 274.495 | -39.7% | 9.756 | 8.582 | -12.0% | actions 855; births 0 |
| baseline | 250 | 1193.275 | 727.213 | -39.1% | 23.548 | 21.173 | -10.1% | actions 1892; births 0 |
| baseline | 500 | 2517.329 | 1545.587 | -38.6% | 48.652 | 43.396 | -10.8% | actions 3664; births 0 |
| mostly-waiting | 100 | 5.127 | 2.112 | -58.8% | 4.722 | 4.674 | -1.0% | actions 0; births 0 |
| mostly-waiting | 250 | 13.266 | 6.967 | -47.5% | 12.314 | 12.044 | -2.2% | actions 0; births 0 |
| mostly-waiting | 500 | 25.326 | 18.490 | -27.0% | 25.375 | 24.880 | -2.0% | actions 0; births 0 |
| high-action | 100 | 336.306 | 207.918 | -38.2% | 10.337 | 10.003 | -3.2% | actions 10796; births 0 |
| high-action | 250 | 912.122 | 532.597 | -41.6% | 26.694 | 24.833 | -7.0% | actions 25816; births 0 |
| high-action | 500 | 1885.527 | 1114.579 | -40.9% | 55.169 | 51.179 | -7.2% | actions 50428; births 0 |
| high-reproduction | 100 | 435.802 | 278.004 | -36.2% | 13.635 | 12.598 | -7.6% | actions 0; births 100 |
| high-reproduction | 250 | 1160.713 | 717.209 | -38.2% | 36.061 | 33.272 | -7.7% | actions 0; births 250 |
| high-reproduction | 500 | 2499.133 | 1512.786 | -39.5% | 72.902 | 67.604 | -7.3% | actions 0; births 500 |

## Gate Audit

### Step 1: Audit Learned-State Decay Semantics

- Current formula remains: `nextDelta = clamp(delta * (1 - experienceDecayRate), -maxLearnedDelta, maxLearnedDelta)`, with zero results removed from delta maps.
- The public/default decay path still sanitizes the profile, clamps deltas, drops zero values, and preserves `recentLearningSignal`, `learningUpdateCount`, and `reproductionLearningCount`.
- Reproduction inheritance remains unchanged; children still inherit materialized effective genome values and start with empty learned state.
- No changes were made to learning signal generation, update counts, reproduction learning, or trace handling.

### Step 2: Add Active-Learned-State Detection

- `learnedStateDecayCanChange()` detects empty delta maps without scanning every entry.
- Zero or invalid decay rates are detected as no-op for runtime-normalized state.
- The helper is used by `decayLearnedState()` and tested directly.
- The helper does not mutate learned state.
- Tests cover empty, active, zero-decay, zero-valued, and cap-bound normalized states.

### Step 3: Implement Exact No-Op Decay

- Empty/default learned states remain structurally compatible with existing callers.
- Non-empty runtime learned states decay through the same `scaleDeltaMap()` formula.
- Deletion of zero-valued scaled deltas is unchanged.
- RNG, spawner iteration, trace order, event order, birth/death order, and food order are unchanged.
- Strict digest parity through `strictWorldDigest()` passes via `npm run test:sine`.

### Step 4: Benchmark Learned-State Decay

- `learnedStateDecay` total time is lower in all benchmarked scenarios and populations.
- Mostly-waiting does not regress; average tick time improved by `1.0%`, `2.2%`, and `2.0%` at 100, 250, and 500 population.
- High-reproduction does not regress; average tick time improved by `7.6%`, `7.7%`, and `7.3%`.
- The report separates learned-decay timing from total average tick timing and notes action/birth counts.
- `npm run check` and `npm run test:sine` passed.

## Verification

Commands run:

```bash
npm run check
npm run test:sine
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,mostly-waiting,high-action,high-reproduction > /tmp/sine-exact-parity-m1-hotpath.json
```

All passed.

`npm run build` was not run because Milestone 1 touched shared runtime and tests only; it did not touch UI/browser/server integration code.

## Milestone 1 Exit-Gate Status

- Learned-state decay is faster: passed.
- Exact deterministic parity is preserved: passed through strict digest and full Sine contract tests.
- Learned-state logic remains in one canonical module: passed.
- No permanent duplicate slow/fast learned-state engine exists: passed; the fast path is an explicit option inside `decayLearnedState()`.
- A short milestone report records before/after timing: passed.
