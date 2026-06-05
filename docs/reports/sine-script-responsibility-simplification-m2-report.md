# Sine Script Responsibility Simplification - Milestone 2 Report

## Scope

Milestone 2 extracted fake UI diagnostics payload construction from the Sine UI characterization smoke script.

Touched files:

- `scripts/sineUiCharacterizationSmoke.ts`
- `scripts/sine-tests/sineUiFixtures.ts`

## Changes

- Added `scripts/sine-tests/sineUiFixtures.ts` as the focused home for UI smoke payload fixtures.
- Moved fixture builders out of `scripts/sineUiCharacterizationSmoke.ts`:
  - `sessionSummary()`
  - `sessionAnalysis()`
  - `cohortAnalysis()`
  - `tradeQualityFilter()`
  - `summaryStats()`
  - `histogramRows()`
- Exported stable fixture session IDs from the fixture module so session and cohort payloads stay consistent.
- Kept API route setup and mocked endpoint paths visible in the smoke script.
- Kept fixture code typed against `src/sine/history/sineHistoryTypes.ts`.
- Kept the fixture module free of Playwright imports.

## Verification

Passed:

```bash
npm run test:sine:ui-characterization
npm run check
git diff --check -- scripts/sineUiCharacterizationSmoke.ts scripts/sine-tests/sineUiFixtures.ts
```

Supporting inspection:

```bash
wc -l scripts/sineUiCharacterizationSmoke.ts scripts/sine-tests/sineUiFixtures.ts
```

Result:

- `scripts/sineUiCharacterizationSmoke.ts`: 121 lines
- `scripts/sine-tests/sineUiFixtures.ts`: 238 lines

## Exit Gate Audit

- `scripts/sineUiCharacterizationSmoke.ts` now reads as browser route setup, navigation, and assertions.
- The smoke script still clearly shows mocked paths for session list, session analysis, comparison analysis, and cohort analysis.
- Fake session, diagnostics, cohort, trade-quality, summary-stat, and histogram payload builders live in `scripts/sine-tests/sineUiFixtures.ts`.
- Fixture builders are typed against existing Sine history API types.
- The fixture module has no Playwright dependency.
- Existing diagnostics panel coverage remains in the smoke script:
  - Run Health
  - Resilience
  - Death Causes
  - Trading Performance
  - Trade Quality Distributions
  - Filtered Cohort Performance
  - Regime performance grid
  - Risk / Tail Profile
  - Population Structure
  - Run Comparison
- Mini-chart hover, gridline, and help-tooltip coverage remains in `verifyDiagnosticsMiniChartHover()`.
- Help-page anchor navigation coverage remains for `#runtime` and `#rnn-wiring`.
- No UI behavior, CSS class, API route, or payload shape change was introduced intentionally.

