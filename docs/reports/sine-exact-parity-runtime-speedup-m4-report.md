# Sine Exact-Parity Runtime Speedup M4 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 4.

## Summary

Milestone 4 reduced exact market-input construction cost by reusing the same collected signal history for local scale, trend, and cycle feature families when they share a window/sample-step key.

The implementation is intentionally narrow:

- `src/sine/spawner/marketFeatureContext.ts` now computes local signal stats from the context-owned `signalHistory()` cache.
- `computeLocalSignalStats()` remains available for other callers.
- Market feature formulas, feature order, input count, perception cache keys, and pending-density behavior are unchanged.
- No approximate rolling, regression, RSI, volume, trend, or cycle math was introduced.

## Golden Coverage Added

Added market-input tests in `scripts/sine-tests/marketInputs.test.ts`:

- `Custom Candle Market Inputs Golden Vector With Volume`
- `Market Inputs Handle Short History Missing Volume And Tiny Scale`

Coverage now includes:

- generated market inputs
- candle market inputs
- custom mutable perception windows and lags
- local scale
- rolling deltas
- rolling window stats
- trend regression
- cycle/roughness
- relative volume
- volume delta
- volume acceleration
- RSI
- volume-price agreement
- flat/tiny-scale history
- short history
- missing volume

## Exact Reuse Candidate Review

| Feature family | Decision | Formula / order note | Reason |
| --- | --- | --- | --- |
| local scale | accepted | Uses `collectSignalHistory()` oldest-to-newest, then `summarizeLocalNumericScale()` over values in that order. | Local scale, trend, and cycle commonly use the same window/sample-step key. Reusing the already collected history preserves the same values and summary formula. |
| trend regression | accepted indirectly | Uses the exact cached `signalHistory()` sample order, then current `linearRegression()` and residual calculation. | Trend already used `signalHistory()`; the accepted change lets local scale share that same history when keys match. |
| cycle/roughness | accepted indirectly | Uses the exact cached `signalHistory()` sample order, then current smoothing, turning-point, and second-difference logic. | Cycle already used `signalHistory()`; the accepted change lets local scale share that same history when keys match. |
| rolling deltas | deferred | Current formula samples each configured `fromTicks`/`toTicks` pair directly and normalizes by local scale. | There is no broader reusable summary without adding a different sampled set or lookup layer. |
| rolling window stats | deferred | Current formula uses `rollingLags()` with seven samples, then mean and population standard deviation in current order. | It does not share the same sample set as trend/cycle/local scale, so reuse would add complexity without clear benefit. |
| volume features | deferred | Current formula collects log-volume history in order, summarizes local volume scale, then computes lagged delta/acceleration/agreement. | Prefix/ring-buffer style reuse would change the implementation shape and needs a separate exactness review. |
| RSI | deferred | Current formula iterates from `window` down to `1`, comparing adjacent prices. | Any faster rolling RSI would change iteration structure and is not accepted without a dedicated exact-parity proof. |
| volume-price agreement | deferred | Current formula uses the current signal/log-volume and one lagged sample, normalized by current signal and volume scales. | It already depends on the volume scale summary; no additional safe reuse was identified in this milestone. |

## Benchmark

Pre-change artifacts:

- `/tmp/sine-exact-parity-m4-pre-hotpath.json`
- `/tmp/sine-exact-parity-m4-pre-evolved.json`

Post-change artifacts:

- `/tmp/sine-exact-parity-m4-post-hotpath.json`
- `/tmp/sine-exact-parity-m4-post-evolved.json`

Command shape:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 200 --populations 100,250,500 --scenarios baseline,high-action,high-reproduction
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 100 --warmup-ticks 1000 --populations 250 --scenarios baseline --brain-iterations 5
```

## Timing Summary

| Scenario | Pop | Avg ms/tick | Market resolve | Feature build | Local stats |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | `10.528 -> 10.005` `-5.0%` | `393.662 -> 358.738` `-8.9%` | `251.596 -> 228.491` `-9.2%` | `34.426 -> 21.229` `-38.3%` |
| baseline | 250 | `25.285 -> 24.180` `-4.4%` | `771.238 -> 739.422` `-4.1%` | `437.078 -> 426.046` `-2.5%` | `44.257 -> 25.886` `-41.5%` |
| baseline | 500 | `50.866 -> 49.392` `-2.9%` | `1451.859 -> 1383.599` `-4.7%` | `799.863 -> 738.828` `-7.6%` | `56.905 -> 35.854` `-37.0%` |
| high-action | 100 | `11.301 -> 10.502` `-7.1%` | `204.437 -> 181.683` `-11.1%` | `129.280 -> 111.933` `-13.4%` | `23.747 -> 9.573` `-59.7%` |
| high-action | 250 | `27.388 -> 25.789` `-5.8%` | `439.831 -> 396.781` `-9.8%` | `257.541 -> 226.686` `-12.0%` | `30.353 -> 15.753` `-48.1%` |
| high-action | 500 | `53.600 -> 50.824` `-5.2%` | `854.635 -> 756.670` `-11.5%` | `499.218 -> 419.298` `-16.0%` | `50.468 -> 26.416` `-47.7%` |
| high-reproduction | 100 | `15.589 -> 14.508` `-6.9%` | `542.598 -> 489.917` `-9.7%` | `295.907 -> 268.917` `-9.1%` | `29.585 -> 14.674` `-50.4%` |
| high-reproduction | 250 | `41.355 -> 38.432` `-7.1%` | `1369.205 -> 1247.504` `-8.9%` | `721.776 -> 647.193` `-10.3%` | `48.702 -> 24.440` `-49.8%` |
| high-reproduction | 500 | `80.243 -> 79.472` `-1.0%` | `2549.478 -> 2517.940` `-1.2%` | `1293.919 -> 1291.670` `-0.2%` | `62.641 -> 39.656` `-36.7%` |
| evolved baseline | 250 | `26.224 -> 25.410` `-3.1%` | `379.918 -> 367.662` `-3.2%` | `211.642 -> 209.912` `-0.8%` | `20.936 -> 11.883` `-43.2%` |

Interpretation:

- The accepted reuse consistently reduced local stats work.
- Market-input resolve improved in every measured row.
- Total runtime improved in every measured row, though the 500-pop high-reproduction row was only a small improvement.
- The evolved-population row improved modestly, which matches the prior finding that evolved perception keys are diverse and cache reuse is limited.
- The `localStats` timing row is not a standalone apples-to-apples phase comparison, because local-scale history collection now happens through the existing `signalHistory()` cache. `featureBuild`, `marketResolve`, and total tick time are the meaningful gate measurements.

## Verification

```bash
npm run test:sine
npm run check
```

Both passed.

`npm run build` was not run for this milestone because the implementation touched shared runtime/test code only and did not touch UI/browser/server integration behavior.

## Gate Status

- Market input construction is faster where exact reuse is possible: passed.
- Exact deterministic parity is preserved: passed through `npm run test:sine`, including strict digest tests and market-input golden vectors.
- Feature code is simpler or no more complex than before: passed; local stats now uses the existing context-owned signal-history cache.
- Approximate feature math remains out of scope: passed.
- Accepted, rejected, and deferred candidates are recorded above: passed.
