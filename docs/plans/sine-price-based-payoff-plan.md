# Sine Price-Based Payoff Plan

Goal: change Sine payoff from indicator/ROC movement to real price-return profitability, while preserving the existing food/trade lifecycle, agent inputs, learning pipeline, diagnostics pipeline, and persistence shape wherever possible.

The intended behavioral change is large and intentional: agents should be rewarded for trades that make money in price terms after transaction cost, not for buying low ROC and selling high ROC. The implementation should stay architecturally small by reusing existing food, payoff profile, local-scale, telemetry, persistence, and diagnostics paths.

## Background

Current payoff is based on signal movement:

```ts
payoff = ((direction * (exitSignal - entrySignal) - transactionCost) / entryPayoffScale) * strength
```

For BTC/candle data, `signal` is configured lookback ROC, while `price` is candle close. This means a trade can be counted as a win when ROC improves even if the actual entry-to-exit price trade is flat or negative.

The new canonical BTC/candle payoff should be based on price return:

```ts
grossDirectionalReturnPct =
  direction * ((exitPrice - entryPrice) / entryPrice) * 100

netDirectionalReturnPct =
  grossDirectionalReturnPct - transactionCostPct

payoff =
  (netDirectionalReturnPct / entryPricePayoffScalePct) * strength
```

Where:

- `direction = 1` for long and `-1` for short.
- `transactionCostPct` is round-trip transaction cost in percent units.
- Initial/default transaction cost should be `0.12`, meaning `0.12%` round-trip cost.
- `strength` scales both gains and losses.
- `entryPricePayoffScalePct` is local price-dispersion scale captured at trade entry.

`entryPricePayoffScalePct` should use the price-dispersion method, not the return-volatility method. For a sampled price window, compute the mean close price, convert each sampled close into percent distance from that mean, and summarize those percent deviations. This makes the denominator answer: "how far does price usually sit from its local center in this window?"

## Non-Goals

- Do not change agent inputs in this pass.
- Do not remove ROC/signal from charts, food snapshots, persistence, or analysis.
- Do not introduce a separate trade lifecycle engine.
- Do not create parallel runtime metrics such as `signalPayoff` and `pricePayoff` inside the simulation loop.
- Do not redesign sizing, portfolio allocation, leverage, margin, liquidation, funding, or execution simulation in this pass.
- Do not admit old ROC-payoff runs into the new interpretation without labeling/reporting the semantic mismatch.
- Do not rewrite diagnostics, seed-bank filters, or headless stats; they should consume canonical `payoff` as they already do.

## Architecture Gates

These gates apply to every milestone.

- Keep one canonical runtime payoff: `food.payoff`.
- Keep `entrySignal` and `exitSignal` as analysis fields only; they must not drive BTC/candle payoff.
- Reuse existing `SpawnerFood`, food events, headless recorder, persistence DTOs, and diagnostics consumers.
- Reuse existing mutable payoff profile traits:
  - `payoffProfile.scaleWindowTicks`
  - `payoffProfile.scaleSampleStepTicks`
- Add price-dispersion scale logic beside existing local-scale helpers instead of creating a duplicate scale subsystem.
- Keep generated-mode behavior explicit and tested.
- Do not add React/server imports into runtime modules.
- Do not add runtime imports from one-off audit scripts.
- Treat changed deterministic digests as expected only where payoff behavior intentionally changes.

## Milestone 1: Define Price-Dispersion Scale And Payoff Semantics

Goal: make the new payoff contract precise before changing downstream behavior.

### 1. Add A Price-Dispersion Scale Helper

Add a helper in the existing local-scale module, for example:

```ts
computeLocalPriceDispersionScale(...)
```

It should reuse existing primitives from `src/sine/spawner/localSignalScale.ts`, especially:

- `createTimelineSampleResolver`
- `collectNumericHistory`
- `summarizeLocalNumericScale`
- `LOCAL_SCALE_FLOOR`

The helper should compute local scale from sampled percent price deviations from the local mean close, not from ROC/signal values and not from adjacent close-to-close returns.

Candidate definition:

```ts
meanPrice =
  average(sample.price over sampled price window)

sampleDeviationPct =
  ((sample.price - meanPrice) / meanPrice) * 100
```

Then summarize those sampled deviation values with the existing local numeric scale summarizer. The first implementation should use the same summarizer family as current local scale work:

```ts
entryPricePayoffScalePct =
  max(LOCAL_SCALE_FLOOR, stddev(sampleDeviationPct), halfRange(sampleDeviationPct))
```

Keep RMS price dispersion as a researched alternative, not the first runtime contract, unless tests/report explicitly justify switching the implementation to RMS.

Exit gates:

- Price scale is measured in percent deviation from local mean price.
- Adjacent close-to-close return volatility is not used for `entryPricePayoffScalePct`.
- Raw price levels are only used to compute mean-relative percent deviations.
- Flat price history returns a finite floor.
- Missing or invalid prices are handled deterministically.
- Existing signal-scale helpers remain available for market inputs and signal visualization.
- No duplicate history-sampling loop exists if `collectNumericHistory` can be reused.
- Tests distinguish price dispersion from return volatility on a window where the two methods produce different values.

### 2. Define Generated-Mode Policy Explicitly

Generated samples currently do not carry real prices. Choose and implement one small, explicit policy before changing payoff.

Preferred policy:

- Add deterministic synthetic `price` to generated samples.
- The synthetic price should be derived consistently from generated signal/trend state and should remain finite.
- Generated mode should then use the same price-based payoff formula as BTC/candle mode.

Fallback policy if synthetic price is deferred:

- BTC/candle mode uses price payoff.
- Generated mode uses an explicit, named, tested fallback path.
- The fallback must be documented as generated-only and must not silently apply to BTC/candle runs.

Exit gates:

- Generated mode behavior is explicit in code and tests.
- BTC/candle mode never falls back to signal payoff when valid prices exist.
- Generated same-seed determinism is preserved.
- Tests cover generated payoff behavior.
- Help text does not imply generated and candle modes have hidden incompatible reward semantics.

### 3. Define Transaction Cost Semantics

Keep the existing config field if possible:

```ts
transactionCost
```

Change its meaning to:

```text
Round-trip transaction cost (%)
```

Set the default to:

```ts
transactionCost: 0.12
```

The initial basis is a conservative OKX futures taker round trip: OKX documents Lv1 futures taker fee around `0.05%` and maker fee around `0.02%`, with opening and closing fees both applying. A `0.12%` round-trip assumption covers two taker fees plus a small execution buffer.

Exit gates:

- Default config uses `0.12`.
- UI/control labels and help copy describe percent round-trip cost.
- Sanitization still accepts saved numeric values.
- Saved settings are not silently rewritten unless a migration is explicitly added and tested.
- Tests make clear that `0.12` means `0.12%`, not `12%` and not `0.0012%`.

## Milestone 1 Exit Gates

- Price-dispersion scale helper exists and is tested.
- Generated-mode payoff policy is explicit and tested.
- Transaction cost semantics are clear in defaults, labels, and docs.
- No runtime behavior changes have been made outside the intended payoff/scale path.
- `npm run check` passes.

## Milestone 2: Switch Runtime Payoff To Price-Based Reward

Goal: make `food.payoff` represent price-dispersion-normalized net price-return performance.

### 1. Update Food Emission To Snapshot Price Scale

In `emitFood()`, keep existing food lifecycle and fields, but change `entryPayoffScale` to capture local price-dispersion scale rather than local signal/ROC scale when price data is available.

Keep storing:

- `entrySignal`
- `entryPrice`
- `payoffScaleWindowTicks`
- `payoffScaleSampleStepTicks`
- `sourceTimestamp`

Exit gates:

- `entryPayoffScale` is computed from local price-dispersion scale for BTC/candle runs.
- `entryPayoffScale` remains snapshotted at spawn and is not recomputed at resolution.
- Existing mutable payoff profile inheritance/mutation is unchanged.
- Food snapshots still include both signal and price fields.
- No new food/trade object type is introduced.

### 2. Update `calculateFoodPayoff()`

Change `calculateFoodPayoff()` in `src/sine/spawner/reward.ts` to use price return when valid prices exist.

Canonical formula:

```ts
const direction = food.direction === "long" ? 1 : -1;

const grossDirectionalReturnPct =
  direction * ((exitPrice - food.entryPrice) / Math.max(PRICE_FLOOR, food.entryPrice)) * 100;

const netDirectionalReturnPct =
  grossDirectionalReturnPct - transactionCostPct;

return (
  netDirectionalReturnPct /
  Math.max(LOCAL_SCALE_FLOOR, food.entryPayoffScale ?? 1)
) * food.strength;
```

Exit gates:

- BTC/candle payoff uses `entryPrice` and `exitPrice`.
- `entrySignal` and `exitSignal` do not affect BTC/candle payoff.
- Strength scales both positive and negative payoff.
- Transaction cost is subtracted before scale normalization.
- Invalid price cases are deterministic and covered by the generated-mode policy.
- `resolveFoodOutcome()` still records `exitSignal`, `exitPrice`, `exitSourceTimestamp`, `payoff`, and `status`.

### 3. Preserve Downstream Runtime Flow

Do not rewrite these consumers. They should continue consuming canonical `payoff`:

- `applyResolvedFoodToWorld()`
- `applyResolvedFoodToSpawner()`
- `applyFoodResolutionLearning()`
- recent payoff telemetry
- headless recorder
- persistence DTOs

Exit gates:

- Win/loss status means net price-return win/loss.
- Energy and health update from price-based payoff.
- Learning signal receives price-based payoff.
- World cumulative payoff and rolling payoff use price-based payoff.
- No downstream consumer keeps using signal-delta payoff under another name.

## Milestone 2 Exit Gates

- Runtime payoff is price-based for BTC/candle runs.
- Strength and round-trip cost affect payoff as defined.
- Existing food/trade lifecycle remains intact.
- Runtime modules do not gain new server/UI dependencies.
- `npm run check` passes.
- Focused payoff tests pass.

## Milestone 3: Rewrite Payoff Contract Tests And Intentional Goldens

Goal: replace old ROC-payoff tests with price-payoff tests and make intentional behavior changes explicit.

### 1. Replace Signal-Payoff Tests

Rewrite tests that currently characterize signal-scale payoff, including tests named like:

- `Candle Food Payoff Uses Signal Scale Instead Of Price Return`
- `Food Payoff Helper Uses Signal Scale For Generated And Candle Modes`
- `Scale Relative Payoff And Absolute Cost`

Exit gates:

- Old signal-payoff assertions are removed or renamed to price-payoff assertions.
- A long trade with rising ROC but falling price resolves as a loss.
- A short trade with falling price resolves as a win.
- A small gross price win below transaction cost resolves as a loss.
- Same price return in different local price-dispersion regimes produces different normalized payoff.
- Windows with identical adjacent return volatility but different price dispersion can produce different normalized payoff.
- Strength `0.5` produces half the payoff of strength `1.0` for the same trade.

### 2. Update Digest And Headless Expectations

Existing deterministic digests and headless fixtures may change because payoff now affects:

- learning
- energy
- health
- death timing
- reproduction opportunity
- cumulative payoff
- event payloads

Exit gates:

- Changed goldens are reviewed as intentional payoff-target changes.
- Same-seed deterministic repeatability still holds under the new payoff.
- Tests still fail on nondeterminism or ordering drift.
- Headless recorder tests still prove stored event payoff matches runtime payoff.
- No unrelated mutation, topology, market-input, or persistence shape change is bundled into the golden update.

### 3. Add Persistence And Diagnostics Coverage

Add or adjust focused tests to prove persisted resolved trades still carry both price and signal fields, while diagnostics use canonical price-based `payoff`.

Exit gates:

- Resolved food persistence includes `entryPrice`, `exitPrice`, `entrySignal`, `exitSignal`, and price-based `payoff`.
- Saved-run hit rate derives from price-based `payoff`.
- Saved-run risk diagnostics derive from price-based `payoff`.
- Headless per-agent stats derive from price-based `payoff`.
- Seed-bank candidate filters derive from price-based `payoff` without a parallel formula.

## Milestone 3 Exit Gates

- Payoff tests fail under the old ROC-payoff formula and pass under the new price-payoff formula.
- Deterministic same-seed behavior is preserved under the new payoff.
- Diagnostics and persistence continue using canonical `payoff`.
- `npm run test:sine` passes.

## Milestone 4: UI, Help, And Interpretation Cleanup

Goal: make the changed semantics visible and avoid misleading labels.

### 1. Update Control Labels And Tooltips

Update labels/help for `transactionCost`.

Preferred wording:

```text
Round-trip transaction cost (%)
```

Exit gates:

- Sidebar/control text no longer describes transaction cost as raw ROC/signal cost.
- Tooltip explains that cost is subtracted from gross price return before local scale normalization.
- Default value display makes `0.12` clearly mean `0.12%`.
- Saved settings still load without crashing.

### 2. Update Help Page Formula

Replace signal-payoff formula with the new price-payoff formula.

Help should explain:

- ROC/RSI/volume are inputs/indicators.
- Price return is the reward target.
- Local price-dispersion scale makes payoff regime-aware.
- Strength scales both upside and downside.
- Transaction cost is round-trip percent cost.

Exit gates:

- Help page no longer says payoff is based on `exitSignal - entrySignal`.
- Help page explicitly states signal fields are retained for analysis.
- Help page mentions old saved runs may have been produced under older payoff semantics if relevant.
- The formula matches the implementation and tests.

## Milestone 4 Exit Gates

- UI/help language matches runtime semantics.
- No new UI settings are added unless necessary.
- `npm run check` passes.
- `npm run build` passes.

## Milestone 5: Output Report And Verification

Goal: produce a written report documenting the implementation, expected behavioral break, verification, and initial impact.

### 1. Run Full Verification

Required commands:

```bash
npm run check
npm run test:sine
npm run build
```

Also run one short headless smoke run using BTC/candle data if market data is available.

Exit gates:

- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.
- Short headless run completes or any blocker is documented.
- New resolved trades show price-based payoff.

### 2. Produce Implementation Report

Create a report under:

```text
docs/reports/
```

Suggested filename:

```text
docs/reports/sine-price-based-payoff-report.md
```

The report should include:

- summary of files changed
- exact implemented payoff formula
- generated-mode policy chosen
- transaction cost default and interpretation
- tests added/rewritten
- goldens changed and why
- commands run and pass/fail status
- short before/after interpretation using at least one small headless run or fixture
- known limitations and follow-up recommendations

Exit gates:

- Report exists in `docs/reports/`.
- Report includes the exact formula actually implemented.
- Report states that `entryPricePayoffScalePct` uses price dispersion around local mean price, not return volatility.
- Report explicitly states this is not exact functional parity with old runs; it is an intentional reward-target correction.
- Report distinguishes code blast radius from behavioral blast radius.
- Report documents whether old saved/headless runs should be treated as ROC-payoff runs.

### 3. Optional Post-Fix Audit Script Check

If the standalone `price-trade-audit/` script is still present, either:

- update it with a mode that can verify normalized, strength-scaled payoff, or
- document that it audits plain price-return profitability only and is not the canonical new payoff checker.

Exit gates:

- No stale audit script is presented as proving exact new runtime payoff if it ignores strength/scale.
- If updated, the script remains isolated from runtime/app code.
- Deleting `price-trade-audit/` still has no runtime effect.

## Milestone 5 Exit Gates

- Full verification is complete.
- `docs/reports/sine-price-based-payoff-report.md` exists.
- The report captures implementation decisions, changed semantics, and known limitations.
- No runtime architecture duplication was introduced.

## Final Exit Gates

- BTC/candle agents are rewarded for real price-return profitability after cost.
- Local payoff normalization is based on price-dispersion scale, not ROC/signal scale or adjacent return volatility.
- Strength affects payoff and therefore learning/evolution.
- Transaction cost is `0.12%` round trip by default.
- ROC/signal remains available as an input and analysis field.
- Existing food/trade lifecycle, persistence shape, diagnostics consumers, and seed-bank filters are reused.
- Generated-mode behavior is explicit and tested.
- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.
- A final report is written in `docs/reports/`.
