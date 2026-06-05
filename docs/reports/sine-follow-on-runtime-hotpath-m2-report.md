# Sine Follow-On Runtime Hot-Path M2 Report

Milestone: `docs/plans/sine-follow-on-runtime-hotpath-plan.md` Milestone 2.

## Summary

Milestone 2 was narrowed after benchmarking.

The accepted change is an architectural consolidation:

- `createMarketFeatureContext()` is now the compatibility alias for `createMarketFeatureFrame()`.
- The existing per-tick market feature cache remains the single frame/cache boundary.
- No second market-feature cache layer was added.
- Market feature formulas, feature order, sample windows, normalization rules, pending-density behavior, and perception mutation behavior are unchanged.

An attempted sanitized-key/vector-construction fast path was rejected because benchmark totals were mixed, especially in high-action runs. Those changes are not retained.

## Changed Files

Runtime:

- `src/sine/spawner/marketFeatureContext.ts`

Tests:

- `scripts/sine-tests/marketInputs.test.ts`
- `scripts/sine-tests/exactParity.test.ts`

Benchmark artifacts:

- `docs/reports/sine-follow-on-runtime-hotpath-m2-pre.json`
- `docs/reports/sine-follow-on-runtime-hotpath-m2-final.json`

## Market Input Audit

The market input vector still has `19` total inputs:

- `18` market-feature inputs from `MARKET_FEATURE_INPUT_COUNT`
- `1` pending-density input appended by `resolveInputs()`

Market-feature order is unchanged:

1. current signal normalized by local signal scale
2. delta lag pair 1 normalized by local signal scale
3. delta lag pair 2 normalized by local signal scale
4. delta lag pair 3 normalized by local signal scale
5. delta lag pair 4 normalized by local signal scale
6. delta lag pair 5 normalized by local signal scale
7. rolling mean normalized by local signal scale
8. rolling standard deviation divided by local signal scale and clamped
9. current signal position in local range
10. relative trend slope
11. relative residual volatility
12. relative roughness
13. relative cycle rate
14. relative volume
15. volume delta
16. volume acceleration
17. RSI signal
18. volume-price agreement
19. pending-food density

Mutable perception traits affecting feature or input cache keys remain:

- `deltaLagPairs`
- `rollingWindowTicks`
- `localScaleWindowTicks`
- `localScaleSampleStepTicks`
- `volumeScaleWindowTicks`
- `volumeScaleSampleStepTicks`
- `volumeDeltaLagTicks`
- `volumeAccelerationLagTicks`
- `rsiWindowTicks`
- `volumePriceAgreementLagTicks`
- `trendWindowTicks`
- `cycleWindowTicks`
- `roughnessSensitivity`
- `pendingDensityScale`

## M4 Deferred Item Review

The previous local-scale reuse direction remains safe only when it uses the existing per-tick context/frame and exact current formulas.

Rejected for this milestone:

- a second cache layer beside `createMarketFeatureFrame()`
- approximate rolling math
- persistent cross-tick feature caches
- changed/sample-reordered RSI, volume, trend, cycle, or local-scale formulas

Safe and retained:

- naming the existing per-tick context as `MarketFeatureFrame`
- keeping the old `createMarketFeatureContext()` export as an alias for compatibility
- strengthening diverse perception and strict digest coverage

## Benchmark

Command:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10
```

The final benchmark reflects the narrowed accepted implementation, not the rejected fast-path attempt.

| Scenario | Pop | Pre avg ms/tick | M2 avg ms/tick | Total change | M13 change | marketInputResolve | marketFeatureBuild | context construction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `6.647` | `6.507` | `-2.1%` | `+0.4%` | `-0.8%` | `-3.7%` | `-1.1%` |
| baseline | 250 | `15.417` | `15.181` | `-1.5%` | `+0.5%` | `-1.0%` | `+0.2%` | `-1.7%` |
| baseline | 500 | `31.494` | `31.888` | `+1.3%` | `+3.1%` | `+0.9%` | `+1.1%` | `+0.8%` |
| mostly-waiting | 100 | `3.017` | `3.062` | `+1.5%` | `+0.6%` | `+0.4%` | `+0.9%` | `+0.2%` |
| mostly-waiting | 250 | `7.737` | `8.117` | `+4.9%` | `+4.3%` | `+4.4%` | `+3.9%` | `+4.6%` |
| mostly-waiting | 500 | `16.031` | `16.802` | `+4.8%` | `+5.4%` | `+3.2%` | `+1.7%` | `+3.5%` |
| high-action | 100 | `7.714` | `7.726` | `+0.2%` | `+1.2%` | `+1.2%` | `-5.9%` | `+2.1%` |
| high-action | 250 | `19.432` | `19.439` | `+0.0%` | `+5.6%` | `+0.6%` | `+1.2%` | `+0.5%` |
| high-action | 500 | `39.306` | `39.354` | `+0.1%` | `+5.0%` | `+4.1%` | `+2.9%` | `+2.5%` |
| high-reproduction | 100 | `9.575` | `9.571` | `-0.0%` | `+5.6%` | `-2.2%` | `-3.0%` | `-2.6%` |
| high-reproduction | 250 | `24.512` | `25.346` | `+3.4%` | `+6.6%` | `+5.8%` | `+6.6%` | `+4.1%` |
| high-reproduction | 500 | `51.211` | `51.970` | `+1.5%` | `+4.2%` | `+5.1%` | `+6.2%` | `+3.6%` |

Result: the accepted narrowed milestone is not a speedup milestone. The benchmark shows noise around the previous implementation and confirms that the rejected fast path should not be retained. Future speed work should move to the larger targets in later milestones instead of adding another market-feature wrapper.

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
- Existing market-input golden vectors: passed unchanged.
- New `Market Feature Frame Caches Diverse Perception Traits`: passed.
- New `Strict Digest Covers Mutated Perception Traits`: passed.

`npm run build` was not required because no UI, server integration, persistence, or worker protocol code changed.

## Milestone 2 Exit Gate Review

- Market feature construction has one shared per-tick frame: passed. The existing context is now the named frame.
- Market input vectors are exactly unchanged: passed by golden vector tests and full Sine contract tests.
- No approximate rolling math is introduced: passed. No formula changes are retained.
- Feature formulas are not duplicated: passed. The existing feature helpers remain canonical.
- Existing feature/context helpers are consolidated rather than wrapped by a redundant cache abstraction: passed. `createMarketFeatureContext()` is an alias, not a wrapper.
- Benchmark evidence shows whether the frame should be retained in full or narrowed: passed. Fast-path changes were rejected; the narrowed frame consolidation is retained.

Milestone 2 passes as a narrowed architectural consolidation and parity-coverage milestone, not as a retained runtime speedup.
