# Sine Script Responsibility Simplification - Milestone 3 Report

## Scope

Milestone 3 split the large Sine persistence integration test file by responsibility without changing persistence behavior or relaxing assertions.

Touched files:

- `scripts/sine-tests/sinePersistenceBasic.test.ts`
- `scripts/sine-tests/sinePersistenceDiagnostics.test.ts`
- `scripts/sine-tests/sinePersistenceCohort.test.ts`
- `scripts/sine-tests/sinePersistenceInspection.test.ts`
- `scripts/sine-tests/sinePersistenceHeadlessSchema.test.ts`
- `scripts/sine-tests/sinePersistenceFixtures.ts`
- `scripts/testSine.ts`
- `src/sine/persistence/README.md`

Removed:

- `scripts/sine-tests/sinePersistence.test.ts`

## Changes

- Split the old monolithic persistence integration suite into five concern-specific suites:
  - basic persistence/session behavior
  - saved-run diagnostics
  - cohort analysis and BTC candle regimes
  - historical inspection
  - unified headless schema support
- Updated `scripts/testSine.ts` to run each split persistence suite explicitly.
- Expanded `scripts/sine-tests/sinePersistenceFixtures.ts` with domain setup builders:
  - `resolvedTradeEventFor()`
  - `cloneSpawnerWith()`
  - `uniquenessForSpawner()`
- Kept assertions in test files; fixtures only build spawners, events, uniqueness scores, and persistence payloads.
- Updated the persistence README so it references the split `sinePersistence*.test.ts` suites instead of the deleted monolith.

## Verification

Passed:

```bash
npm run test:sine
npm run check
git diff --check -- scripts/sine-tests/sinePersistenceBasic.test.ts scripts/sine-tests/sinePersistenceDiagnostics.test.ts scripts/sine-tests/sinePersistenceCohort.test.ts scripts/sine-tests/sinePersistenceInspection.test.ts scripts/sine-tests/sinePersistenceHeadlessSchema.test.ts scripts/sine-tests/sinePersistenceFixtures.ts scripts/testSine.ts src/sine/persistence/README.md
```

## Exit Gate Audit

- `scripts/sine-tests/sinePersistence.test.ts` is removed.
- `scripts/testSine.ts` runs:
  - `sine persistence basic`
  - `sine persistence diagnostics`
  - `sine persistence cohort`
  - `sine persistence inspection`
  - `sine persistence headless schema`
- All 17 previous persistence test names remain present and passed under the split suites.
- Basic persistence still covers save/reconstruct, session status preservation, market config storage, indexed plasticity/learned state, and learning produced by a run.
- Diagnostics still cover saved-run risk diagnostics, filtered percent ranges, trade-quality age filters, death-cause series, and top-lineage payoff-share semantics.
- Cohort still covers filtered cohort analysis and BTC candle-derived regime availability/partial/missing states.
- Inspection still covers legacy genome normalization, unknown spawner lookup, richer uniqueness upserts, and death-snapshot reconstruction semantics.
- Headless schema still covers unified headless table support, deleted legacy metric table absence, reconstruction columns, foreign-key check, and delete cascades.
- Unique session IDs remain explicit in each test.
- Market candle tests retain explicit cleanup and transaction rollback.
- Shared setup lives in `sinePersistenceFixtures.ts`; assertions remain in the split tests.

