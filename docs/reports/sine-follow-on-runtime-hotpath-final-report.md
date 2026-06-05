# Sine Follow-On Runtime Hot-Path Final Verification

Plan: `docs/plans/sine-follow-on-runtime-hotpath-plan.md`.

## Summary

The final verification gates pass for parity, architecture classification, and documentation.

The plan should not be summarized as a broad final runtime speedup versus M13. The retained work produced targeted simplification and trace-path/local hot-path improvements, but the final benchmark artifact is slower than M13 in total wall time across most rows. This report classifies each milestone so architecture-only or narrowed milestones are not counted as whole-runtime speedups.

Final benchmark artifact:

- `docs/reports/sine-follow-on-runtime-hotpath-m5-final-current.json`

No runtime code changed after that benchmark. The only later changes were report/audit text. The final command checks were then run against the current worktree.

## Commands

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10
```

Results:

- `npm run check`: passed.
- `npm run test:sine`: passed.
- `npm run build`: passed.
- Final hot-path benchmark completed and was written to `docs/reports/sine-follow-on-runtime-hotpath-m5-final-current.json`.

The current `npm run test:sine` run includes:

- strict digest baseline/high-action/high-reproduction coverage
- mutated perception strict digest coverage
- chunked headless strict digest coverage
- market-input golden vectors
- brain/effective learned-state parity tests
- food order, same-tick resolution, dead-creator, learning, lifecycle, headless, persistence, worker-protocol, and inspection contracts

## Milestone Classification

| Milestone | Classification | Evidence |
| --- | --- | --- |
| M1 | Accepted speedup/simplification versus immediate pre-M1 artifact | `docs/reports/sine-follow-on-runtime-hotpath-m1-report.md` |
| M2 | Narrowed architecture/parity consolidation, not a retained speedup | `docs/reports/sine-follow-on-runtime-hotpath-m2-report.md` |
| M3 | Rejected/narrowed learned/effective cache attempt; no retained runtime code | `docs/reports/sine-follow-on-runtime-hotpath-m3-report.md` |
| M4 | Narrow due-queue hardening/simplification, not a material speedup | `docs/reports/sine-follow-on-runtime-hotpath-m4-report.md` |
| M5 | Trace-local speedup and compact-representation cleanup, not a broad runtime speedup | `docs/reports/sine-follow-on-runtime-hotpath-m5-report.md` |

## Final vs M13

| Scenario | Pop | M13 | Final | Change |
| --- | ---: | ---: | ---: | ---: |
| baseline | 100 | `1295.8 ms` | `1478.1 ms` | `+14.1%` |
| baseline | 250 | `3020.3 ms` | `3506.1 ms` | `+16.1%` |
| baseline | 500 | `6184.4 ms` | `7240.3 ms` | `+17.1%` |
| mostly-waiting | 100 | `608.9 ms` | `699.2 ms` | `+14.8%` |
| mostly-waiting | 250 | `1556.9 ms` | `1807.1 ms` | `+16.1%` |
| mostly-waiting | 500 | `3189.6 ms` | `3700.4 ms` | `+16.0%` |
| high-action | 100 | `1527.0 ms` | `1553.5 ms` | `+1.7%` |
| high-action | 250 | `3680.3 ms` | `3861.2 ms` | `+4.9%` |
| high-action | 500 | `7495.5 ms` | `7848.2 ms` | `+4.7%` |
| high-reproduction | 100 | `1813.0 ms` | `2095.8 ms` | `+15.6%` |
| high-reproduction | 250 | `4755.1 ms` | `5625.6 ms` | `+18.3%` |
| high-reproduction | 500 | `9972.6 ms` | `11393.0 ms` | `+14.2%` |

Interpretation:

- Total wall time is worse than M13 in the final artifact.
- This means the follow-on plan does not satisfy the original performance ambition as a net whole-runtime speedup.
- It still satisfies the final verification requirement to document measured outcomes and avoid over-crediting architecture-only milestones.

## Final vs Immediate Pre-Milestone Artifacts

The final benchmark was compared against every immediate pre-milestone artifact:

- `docs/reports/sine-follow-on-runtime-hotpath-m1-pre.json`
- `docs/reports/sine-follow-on-runtime-hotpath-m2-pre.json`
- `docs/reports/sine-follow-on-runtime-hotpath-m3-pre.json`
- `docs/reports/sine-follow-on-runtime-hotpath-m4-pre.json`
- `docs/reports/sine-follow-on-runtime-hotpath-m5-pre.json`

Observed pattern:

- The final benchmark is better than M1-pre for high-action rows, but worse for baseline, mostly-waiting, and high-reproduction rows.
- It is roughly flat-to-slightly better than M2-pre for high-action rows, but worse for the other scenario groups.
- It is worse than M3-pre and M4-pre in most total-runtime rows.
- It improves M5-pre only for high-action 100/250 and high-reproduction 100, while M5 trace phases improve sharply.

The full computed comparison is available in the benchmark artifacts; the classification above reflects the final measured state rather than isolated subphase improvements.

## Final Key Phase Notes

Against M13:

- `traceActivationMaterialization` improved by roughly `64-77%` where traces exist.
- `decisionTraceCapture` improved by roughly `62-74%` where decision traces exist.
- Non-trace phases such as market input resolution, context construction, learned-state decay, plan lookup, brain evaluation, and food resolution are slower in the final artifact.

That split supports retaining M5 as a trace-local improvement, while not claiming the final plan as a broad runtime speedup.

## Prototype And Contract Audit

Rejected prototype scan:

```bash
rg -n "learned.*cache|effective.*cache|cache.*learned|cache.*effective|learnedStateVersion|effectiveValueCache|effectiveValuesCache|baseValueVersion|content signature|signature guard|runtimeBrainCache|getCachedPlanAligned|learnedViewCache" src/sine scripts server
```

Result:

- No retained M3 learned/effective cache implementation was found.
- Remaining cache references are accepted existing caches, such as compiled brain plan caches, market feature frame caches, worker genome caches, and the M4 due queue.

Public contract evidence:

- Market inputs: golden input-vector tests passed, including generated and custom candle modes.
- Brain outputs and learned state: brain wrapper, compiled plan, effective values, learned-state view, and learning tests passed.
- Food/trade resolution and event order: food due queue, same-tick resolution, dead-creator, payoff, and strict digest tests passed.
- Public trace compatibility: compact trace materialization, trace clone, persistence packet, strict digest, and repository persistence tests passed.
- UI/worker protocol: worker protocol, packet shape, roster, inspection, and command-router tests passed.
- Persistence/headless: headless runtime digest, chunked strict digest, repository, outbox, and persistence packet tests passed.

## Final Exit Gate Review

- The codebase has one canonical Sine runtime path: passed. The retained changes add private per-tick/context views and helpers around the existing runtime, not a second engine.
- Accepted runtime caches and compact views are private, versioned or lifetime-scoped, and cannot drift from canonical state: passed. The runtime context is per tick, the market frame is per tick, the due queue is world-private and rebuilt from `world.foods`, and compact traces materialize at public boundaries.
- Rejected cache prototypes, including the M3 learned/effective cache path, are absent from the final codebase: passed.
- Market input formulas and feature vectors are exactly unchanged: passed by market-input golden tests and strict digest tests.
- Brain outputs and learned-state updates are exactly unchanged: passed by brain/effective-value/learned-state tests and strict digest tests.
- Food/trade resolution and event order are exactly unchanged: passed by food order, same-tick resolution, lifecycle, and strict digest tests.
- Public trace output remains compatible: passed by materialization, clone, digest, persistence packet, and repository tests.
- Measured speedup or simplification is documented for each accepted milestone: passed through M1-M5 reports and the classification table above.

## Final Assessment

Final verification passes, but the performance result is mixed.

Retained improvements are valid because parity and architecture gates pass, and because each retained milestone is classified accurately. The final benchmark does not show a broad net runtime speedup versus M13, so future planning should focus on the non-trace phases that regressed or remained dominant rather than continuing to optimize trace materialization.
