# Sine Exact-Parity Runtime Speedup M13 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 13.

## Summary

Milestone 13 is the final measurement and decision gate for the exact-parity runtime speedup plan.

The plan produced meaningful raw simulation speedups while preserving exact deterministic parity:

- Normal baseline: about `1.51x-1.57x`
- Mostly-waiting: about `1.55x-1.59x`
- High-action: about `1.35x-1.47x`
- High-reproduction: about `1.46x-1.52x`

The largest responsiveness win came separately from raw speed: headless API-started runs now execute in isolated worker threads, which reduced 500-pop active-run event-loop p95 from `1375.732 ms` in the M1 backend report to `22.512 ms` in M11.

Native/WASM is not the next recommended implementation target. The remaining dominant costs are still broad TypeScript/runtime construction and lifecycle phases, not one narrow compact numeric kernel.

## Benchmark Artifacts

Raw final benchmark artifact:

- `docs/reports/sine-exact-parity-runtime-speedup-m13-hotpath-final.json`

Original M0 artifact reference:

- `docs/reports/sine-exact-parity-runtime-speedup-m0-baseline.md`

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10 \
  > /tmp/sine-exact-parity-m13-hotpath-final.json
```

This benchmark is runtime-only and does not write to production DBs.

## Machine Context

Same local machine context as M0:

- Platform: `darwin`
- Architecture: `arm64`
- Node: `v24.14.0`
- CPU model: `Apple M1 Pro`
- CPU count reported by Node: `10`
- Memory reported by Node: `17179869184`

## M0 To M13 Speedup

| Scenario | Pop | M0 ticks/s | M13 ticks/s | Speedup | M0 avg tick ms | M13 avg tick ms | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `102.497` | `154.340` | `1.51x` | `9.756` | `6.479` | `-33.6%` |
| baseline | 250 | `42.467` | `66.219` | `1.56x` | `23.548` | `15.101` | `-35.9%` |
| baseline | 500 | `20.554` | `32.339` | `1.57x` | `48.652` | `30.922` | `-36.4%` |
| mostly-waiting | 100 | `211.787` | `328.441` | `1.55x` | `4.722` | `3.045` | `-35.5%` |
| mostly-waiting | 250 | `81.206` | `128.459` | `1.58x` | `12.314` | `7.785` | `-36.8%` |
| mostly-waiting | 500 | `39.410` | `62.704` | `1.59x` | `25.375` | `15.948` | `-37.2%` |
| high-action | 100 | `96.744` | `130.974` | `1.35x` | `10.337` | `7.635` | `-26.1%` |
| high-action | 250 | `37.462` | `54.344` | `1.45x` | `26.694` | `18.401` | `-31.1%` |
| high-action | 500 | `18.126` | `26.683` | `1.47x` | `55.169` | `37.477` | `-32.1%` |
| high-reproduction | 100 | `73.338` | `110.313` | `1.50x` | `13.635` | `9.065` | `-33.5%` |
| high-reproduction | 250 | `27.731` | `42.060` | `1.52x` | `36.061` | `23.776` | `-34.1%` |
| high-reproduction | 500 | `13.717` | `20.055` | `1.46x` | `72.902` | `49.863` | `-31.6%` |

No measured M0 scenario regressed. High-action improved less than normal baseline because food resolution and trace materialization remain substantial.

## Immediate Prior Runtime Comparison

M10-M12 were primarily headless/API orchestration milestones, not raw same-thread simulation speed milestones. The closest durable raw-runtime comparison is therefore the post-M9 report where matching rows exist.

Post-M9 to M13 baseline:

| Pop | Post-M9 avg tick ms | M13 avg tick ms | Change |
| ---: | ---: | ---: | ---: |
| 100 | `7.594` | `6.479` | `-14.7%` |
| 250 | `17.805` | `15.101` | `-15.2%` |
| 500 | `36.713` | `30.922` | `-15.8%` |

Post-M9 to M13 high-action:

| Pop | Post-M9 avg tick ms | M13 avg tick ms | Change |
| ---: | ---: | ---: | ---: |
| 100 | `9.564` | `7.635` | `-20.2%` |
| 250 | `23.116` | `18.401` | `-20.4%` |
| 500 | `46.753` | `37.477` | `-19.8%` |

This comparison should be treated as same-script local timing, not a separate new implementation claim for M10-M12. The M13 benchmark is the final consolidated measurement after all plan work.

## Final Top Bottlenecks

### Baseline 500

| Phase | Total ms over 200 ticks |
| --- | ---: |
| `spawnerContextInputConstruction` | `2158.300` |
| `learnedStateDecay` | `1472.360` |
| `planLookup` | `1200.187` |
| `marketInputResolve` | `1138.695` |
| `brainEvaluation` | `842.453` |

### Mostly-Waiting 500

| Phase | Total ms over 200 ticks |
| --- | ---: |
| `planLookup` | `1169.521` |
| `spawnerContextInputConstruction` | `1124.361` |
| `marketInputResolve` | `1079.851` |
| `brainEvaluation` | `726.503` |
| `resultApplication` | `40.785` |

### High-Action 500

| Phase | Total ms over 200 ticks |
| --- | ---: |
| `foodResolution` | `2153.172` |
| `spawnerContextInputConstruction` | `1383.782` |
| `learnedStateDecay` | `1095.227` |
| `decisionTraceCapture` | `931.191` |
| `planLookup` | `677.169` |

### High-Reproduction 500

| Phase | Total ms over 200 ticks |
| --- | ---: |
| `spawnerContextInputConstruction` | `3270.032` |
| `planLookup` | `2537.103` |
| `marketInputResolve` | `2161.199` |
| `brainEvaluation` | `1715.812` |
| `learnedStateDecay` | `1510.598` |

## Brain-Only Final Profile

| Pop | Cached total ms | Cached ms/eval | Fresh total ms | Fresh ms/eval | Cached top phases |
| ---: | ---: | ---: | ---: | ---: | --- |
| 100 | `39.477` | `0.039` | `70.065` | `0.070` | `runtimeEvaluation 37.655`; `compactBrainKernel 15.749`; `cachedPlanLookup 10.907`; `effectiveValueArrayConstruction 9.011` |
| 250 | `90.295` | `0.036` | `170.073` | `0.068` | `runtimeEvaluation 87.003`; `compactBrainKernel 36.120`; `cachedPlanLookup 28.233`; `effectiveValueArrayConstruction 20.569` |
| 500 | `186.034` | `0.037` | `341.526` | `0.068` | `runtimeEvaluation 178.371`; `compactBrainKernel 74.482`; `cachedPlanLookup 58.472`; `effectiveValueArrayConstruction 41.188` |

The compact kernel itself is not currently large enough, relative to the whole tick, to justify a native rewrite by itself.

## Responsiveness Gains Versus Raw Speed

Raw speed gains:

- Same-thread/runtime simulation improved about `1.35x-1.59x` depending on scenario.
- Headless individual-run speed is still dominated by the same simulation work.

Responsiveness gains:

- M11 moved API-started headless runs into a dedicated worker thread.
- M1 backend event-loop p95 during active 500-pop runs: `1375.732 ms`.
- M11 isolated-worker event-loop p95 during active 500-pop runs: `22.512 ms`.
- M12 concurrent scheduler improved aggregate experiment throughput for two simultaneous 250-pop/500-tick runs from `43.26` to `81.79` aggregate ticks/sec while each individual run stayed around `41` ticks/sec.

This means the app can stay responsive and run more experiments concurrently, but individual simulation ticks are still compute-bound.

## Required Target Reassessment

| Target | Classification | Evidence | Expected mechanism | Functional-parity risk |
| --- | --- | --- | --- | --- |
| market input/context construction | still actionable | Top phase in baseline, mostly-waiting, and high-reproduction. `marketFeatureBuild`, `cycleShape`, and `trendShape` dominate market feature timing. | Reduce repeated per-agent history/window work through a per-tick numeric market feature frame, shared sample-window caches, and tighter array reuse keyed by perception traits. | Medium-high: exact sample selection, normalization, and mutable perception traits must remain identical. |
| learned-state decay and access | still actionable | `learnedStateDecay` remains top-five in baseline, high-action, and high-reproduction. | Avoid broad object/map cloning for unchanged states; maintain active-delta metadata; possibly use exact in-place per-tick decay for active deltas only. | Medium: lazy exponential decay would change arithmetic order, so exact parity requires preserving per-tick multiplication semantics. |
| food/trade resolution | still actionable for high-action | `foodResolution` is the largest high-action 500 phase. M9 reduced trimming, but resolution itself remains large. | Further narrow due-food handling, creator/trace lookup, payoff application, recent-payoff windows, and event creation in the high-action path. | High: same-tick food order, creator-death policy, learning, event order, and payoff mutation are all parity-sensitive. |
| food/trade retention and trimming | already optimized enough for now | `foodTrimming` is low after M9: `73.005 ms` over 200 high-action 500 ticks, far below resolution. | No immediate follow-up unless retention grows again in longer/evolved runs. | Low if left alone; unnecessary refactor risk if changed now. |
| brain plan lookup and effective value access | still actionable | `planLookup` remains top-five; brain-only profile still shows `cachedPlanLookup` and `effectiveValueArrayConstruction`. | Add versioned per-spawner plan/effective-array caches invalidated by topology, base weight/bias mutation, and learned-state updates. | Medium-high: invalidation errors would produce stale brain values while preserving superficial types. |
| trace capture/materialization | still actionable for high-action | `decisionTraceCapture` is `931.191 ms` in high-action 500; fallback recomputation is `0`. | Keep current no-fallback design, but reduce activation map/object materialization for non-wait traces, possibly store compact trace arrays keyed by plan index. | High: learning uses trace activations, active connection ids, action, strength, and output bias updates exactly. |
| public DTO/materialization boundaries | already optimized enough for now | `resultApplication`, `outputDecoding`, and public DTO boundaries are now small compared with remaining top phases. | Leave boundary shape stable; only revisit if a later target surfaces DTO cost again. | Medium if changed; low expected payoff now. |
| headless recorder and persistence write overhead | not worth pursuing for raw speed now | M12 latest sampled DB/write times were `7.60-21.45 ms` while core estimates were `2214-2576 ms` per sampled chunk. | Keep write batching and worker isolation; do not block richer data discussions on DB speed alone. | Low for leaving as-is; schema/write unification decisions should be product/data-driven. |
| UI/worker packet payload overhead | defer until Lab-specific profiling | M11 fixed server/headless responsiveness. Lab still runs its simulation worker and can feel unresponsive because the worker remains CPU-bound. | Profile Lab packet cadence and worker compute separately after the raw runtime targets above. | Medium: packet cadence and stale-session guards are user-visible. |

## Native/WASM Decision

Native/WASM is deferred.

Reasons:

- The remaining bottleneck is not a single compact numeric kernel.
- The compact brain kernel is only `74.482 ms` inside the 500-pop brain-only cached profile, while whole-tick 500-pop totals are dominated by context construction, learned-state decay, plan/effective-value work, food resolution, and trace capture.
- A native boundary would need to move inputs, hidden state, effective weights/biases, learned deltas, outputs, trace activations, and possibly mutation/learning state across the boundary. That payload is not yet small enough to assume a win.
- Exact parity risk is real: JS `number` arithmetic, iteration order, sparse map behavior, clamping, and per-tick learned-state multiplication would need to match native/WASM behavior exactly.

Native/WASM should only be reconsidered after ordinary JS/runtime work reduces the remaining broad phases and leaves a measured compact kernel as the clear dominant cost.

## Recommended Next Implementation Target

The next concrete target should be an ordinary TypeScript/runtime simplification plan focused on two related areas:

1. Per-tick market feature frame and input construction simplification.
2. Versioned learned-state/effective-value caches for brain evaluation.

Why these first:

- They are top phases across more scenarios than food resolution.
- They improve baseline, mostly-waiting, and high-reproduction, not only high-action.
- They can be implemented inside existing boundaries without a native bridge.
- They are easier to verify with strict digest parity than a native/WASM rewrite.

Expected mechanism:

- Build less per-agent market history repeatedly.
- Reuse stable per-spawner plan/effective arrays until invalidated.
- Reduce object and array churn in the hottest normal tick path.

Functional-parity risk:

- Cache invalidation must account for mutation, reproduction, learned updates, plasticity decay, and perception trait changes.
- Exact deterministic tests must compare same-seed final strict digests for baseline, high-action, high-reproduction, and chunked headless paths.

Rough speedup expectation for the next JS pass:

- A realistic target is another `10-25%` on normal baseline if market input and effective-value work both win.
- High-action may need a separate food/trace-focused pass for another material improvement.

## Verification

Commands run:

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,mostly-waiting,high-action,high-reproduction --brain-iterations 10
```

Additional evidence:

- `npm run test:sine` includes strict deterministic parity tests for optimized paths.
- The final hot-path benchmark includes all M13 required populations and scenarios.
- No production DB schema migration was introduced by M13. The plan’s DB-related changes were connection behavior and write-lock hardening from earlier milestones, not new schema.

## Exit Gate Status

- Results exist for 100, 250, and 500 population: passed.
- Results exist for baseline, mostly-waiting, high-action, and high-reproduction: passed.
- Report compares M0 to final and immediate prior timing where records exist: passed.
- Report separates raw simulation speedup from API responsiveness gains: passed.
- Scenarios that did not improve are called out: passed; no M0 scenario regressed, but high-action improved less than normal baseline.
- `npm run check` passes: passed.
- `npm run test:sine` passes: passed.
- `npm run build` passes: passed.
- Strict deterministic parity passes for optimized paths: passed through `npm run test:sine`.
- Remaining top bottlenecks are documented: passed.
- Remaining target classes are classified as already optimized, still actionable, or not worth pursuing: passed.
- Any recommended next speedup target includes mechanism and parity risk: passed.
- Native/WASM recommendation is tied to measured kernel evidence: passed; deferred because no narrow dominant kernel remains.
- No broad rewrite is recommended without evidence: passed.
- The next implementation target is concrete enough to plan: passed.

## Decision

Milestone 13 passes.

The exact-parity runtime speedup plan delivered about `1.35x-1.59x` raw runtime speedup and a much larger API/headless responsiveness improvement. The next frontier should stay in ordinary TypeScript/runtime simplification, specifically market feature/input construction plus learned-state/effective-value caching. Native/WASM should remain deferred until a later benchmark proves a compact numeric kernel dominates and has a small enough boundary payload to justify exact-parity risk.
