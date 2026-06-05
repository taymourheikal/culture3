# Sine Follow-On Runtime Hot-Path M1 Report

Milestone: `docs/plans/sine-follow-on-runtime-hotpath-plan.md` Milestone 1.

## Summary

Milestone 1 introduced an array-backed runtime plan context for the Sine tick loop while preserving the existing lifecycle boundary:

1. food resolution
2. payoff death pruning
3. learned-state decay
4. trace pruning
5. plan context construction
6. upkeep
7. upkeep death pruning
8. post-prune evaluation frame construction

The important parity rule is preserved: a spawner that dies during upkeep can use its compiled plan for upkeep cost, but cannot enter the brain-evaluation frame for that tick.

The accepted implementation improves the immediate pre-M1 benchmark in every measured row. Against the older M13 artifact, some rows are slower; that comparison is noisier because the current worktree includes later uncommitted runtime/headless changes. The immediate pre-M1 benchmark was therefore captured from a temporary copy of the current worktree with only the M1 context routing backed out.

## Changed Runtime Shape

New runtime-only module:

- `src/sine/spawner/spawnerRuntimeContext.ts`

Updated consumers:

- `src/sine/spawner/world.ts`
- `src/sine/spawner/worldBrainEvaluation.ts`
- `src/sine/spawner/telemetry.ts`

Test updates:

- `scripts/sine-tests/spawnerWorldLifecycle.test.ts`
- `scripts/sine-tests/brainEvaluation.test.ts`

## Plan Lookup Audit

Current plan consumers after this milestone:

| Consumer | Classification | Source |
| --- | --- | --- |
| upkeep | index-order | Uses pre-upkeep context plans by index. |
| evaluation frame | index-order | Uses post-upkeep evaluation context. |
| sync brain evaluation | index-order | Uses `frame.plans[index]`. |
| trace fallback | index-order | Uses `frame.plans[index]`. |
| telemetry | index-order when aligned; canonical fallback otherwise | Uses evaluation context if it still matches the live roster. |
| worker/brain pool internals | worker-local batching | Outside this milestone's tick-loop plan map. |

Lifecycle findings:

- Newborns are created after evaluation and are not evaluated in the same tick.
- A spawner's topology does not mutate during its own brain-evaluation phase.
- Reproduction creates a new child genome after the parent has already been evaluated.
- `ensureCompiledBrainPlan()` remains the canonical genome-level compiled-plan cache.
- The tick loop no longer builds a fresh `Map<number, CompiledBrainPlan>`.

## Lifecycle Guard

Added contract coverage:

- `Spawner Killed By Upkeep Is Absent From Brain Jobs`

This test runs an async brain-evaluation runner and asserts that a spawner killed during upkeep produces a zero-length job batch. If an upkeep-dead spawner reaches brain evaluation, the test throws.

## Benchmark Artifacts

M13 baseline:

- `docs/reports/sine-exact-parity-runtime-speedup-m13-hotpath-final.json`

Immediate pre-M1 artifact:

- `docs/reports/sine-follow-on-runtime-hotpath-m1-pre.json`

Post-M1 artifact:

- `docs/reports/sine-follow-on-runtime-hotpath-m1.json`

Post-M1 command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10 \
  > /tmp/sine-follow-on-runtime-hotpath-m1.json
```

The immediate pre-M1 artifact was produced from a temporary copy of the current worktree with only the M1 runtime-context routing backed out. It did not touch production DBs.

## Immediate Pre-M1 To Post-M1

| Scenario | Pop | Pre avg ms/tick | M1 avg ms/tick | Change | Pre plan ms | M1 plan ms | Pre context ms | M1 context ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `6.524` | `6.394` | `-2.0%` | `233.6` | `230.9` | `476.7` | `487.3` |
| baseline | 250 | `16.175` | `15.110` | `-6.6%` | `622.8` | `572.4` | `1139.2` | `1087.5` |
| baseline | 500 | `33.301` | `31.310` | `-6.0%` | `1360.4` | `1220.6` | `2314.8` | `2166.5` |
| mostly-waiting | 100 | `3.405` | `2.977` | `-12.6%` | `234.9` | `212.8` | `270.6` | `230.7` |
| mostly-waiting | 250 | `8.290` | `7.735` | `-6.7%` | `586.6` | `566.9` | `622.3` | `565.6` |
| mostly-waiting | 500 | `17.676` | `15.918` | `-9.9%` | `1271.0` | `1165.8` | `1285.0` | `1115.8` |
| high-action | 100 | `7.973` | `7.567` | `-5.1%` | `125.9` | `123.7` | `301.2` | `287.3` |
| high-action | 250 | `20.535` | `19.096` | `-7.0%` | `346.3` | `335.6` | `761.5` | `701.6` |
| high-action | 500 | `43.775` | `39.293` | `-10.2%` | `776.4` | `680.1` | `1535.9` | `1397.8` |
| high-reproduction | 100 | `9.938` | `9.347` | `-5.9%` | `482.8` | `465.7` | `666.7` | `621.4` |
| high-reproduction | 250 | `25.671` | `24.339` | `-5.2%` | `1321.0` | `1251.7` | `1688.9` | `1549.0` |
| high-reproduction | 500 | `52.461` | `51.529` | `-1.8%` | `2758.9` | `2696.4` | `3404.7` | `3252.0` |

Result: M1 improves all immediate pre-M1 rows. The largest improvements are in mostly-waiting and high-action cases.

## M13 To Post-M1

| Scenario | Pop | M13 avg ms/tick | M1 avg ms/tick | Change |
| --- | ---: | ---: | ---: | ---: |
| baseline | 100 | `6.479` | `6.394` | `-1.3%` |
| baseline | 250 | `15.101` | `15.110` | `+0.1%` |
| baseline | 500 | `30.922` | `31.310` | `+1.3%` |
| mostly-waiting | 100 | `3.045` | `2.977` | `-2.2%` |
| mostly-waiting | 250 | `7.785` | `7.735` | `-0.6%` |
| mostly-waiting | 500 | `15.948` | `15.918` | `-0.2%` |
| high-action | 100 | `7.635` | `7.567` | `-0.9%` |
| high-action | 250 | `18.401` | `19.096` | `+3.8%` |
| high-action | 500 | `37.477` | `39.293` | `+4.8%` |
| high-reproduction | 100 | `9.065` | `9.347` | `+3.1%` |
| high-reproduction | 250 | `23.775` | `24.339` | `+2.4%` |
| high-reproduction | 500 | `49.863` | `51.529` | `+3.3%` |

The M13 comparison is retained for continuity, but the immediate pre-M1 artifact is the cleaner implementation comparison because it uses the current worktree state.

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
- Strict digest parity tests: passed through `npm run test:sine`.
- Headless chunk strict digest parity: passed through `npm run test:sine`.
- Upkeep-dead spawner absent from brain jobs: passed.
- Benchmark: passed immediate pre-M1 comparison; M13 comparison documented.

`npm run build` was not required because this milestone did not touch UI, server integration, worker protocol, or persistence contracts.

## Milestone 1 Exit Gate Review

- One runtime context owns the tick-loop plan array: passed.
- Fresh per-tick `Map<number, CompiledBrainPlan>` removed from `stepSpawnerWorld()`: passed.
- `ensureCompiledBrainPlan()` remains the canonical compiled-plan cache: passed.
- Post-upkeep evaluation roster excludes upkeep-dead spawners: passed by new test.
- `buildSpawnerEvaluationFrame()` consumes the runtime context: passed.
- Telemetry uses the context when the live roster still aligns, and falls back to canonical plan lookup otherwise: passed.
- Newborns are not evaluated in their birth tick: unchanged and covered by existing lifecycle/reproduction tests.
- Simulation outputs are exactly unchanged: passed by strict digest tests.
- Public UI, persistence, headless, and worker contracts are unchanged: passed by contract tests.
- Benchmark evidence is documented: passed.

Milestone 1 passes.
