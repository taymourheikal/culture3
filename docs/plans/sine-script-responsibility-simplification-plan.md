# Sine Script Responsibility Simplification Plan

This plan targets the current Sine support-layer hotspots where scripts or support files carry too many responsibilities. The goal is to collapse repeated logic into existing modules where those modules already have a clear role, and to split responsibilities only where no clean shared home exists.

Functional parity is mandatory. This is not a behavior-change pass, not a benchmark-result reinterpretation pass, and not a file-size-only cleanup.

## Non-Goals

- Do not change simulation behavior, reward/payoff logic, reproduction rules, death rules, mutation, learning, market inputs, brain evaluation, uniqueness, strategy-map, persistence semantics, or API response shapes.
- Do not refactor Ant World.
- Do not rename Sine/module paths.
- Do not create broad utility bags or generic test/benchmark frameworks.
- Do not force browser benchmark code to import Node-only script helpers.
- Do not hide SQL behind vague generic abstractions.
- Do not weaken integration tests to make splits easier.
- Do not change DB schema definitions, table names, columns, indexes, or foreign keys in this plan.

## Architecture Gates

These gates apply to every milestone.

- Collapse into existing modules first when semantics match:
  - benchmark scenarios: `scripts/sine-benchmark/scenarios.ts`
  - CLI/numeric helpers: `scripts/sine-benchmark/cli.ts`
  - timing summaries: `scripts/sine-benchmark/timing.ts`
  - trace instrumentation: `scripts/sine-benchmark/trace.ts`
  - persistence fixtures: `scripts/sine-tests/sinePersistenceFixtures.ts`
- Add a new helper module only when at least two real call sites immediately use it.
- Keep browser, Node script, server, and runtime dependencies clean.
- Keep `src/sine` free of server imports.
- Keep server modules free of React/UI imports.
- Keep script helpers out of production runtime imports unless they are explicitly browser-safe and runtime-appropriate.
- Preserve existing command-line flags and JSON report shapes unless a change is explicitly documented as non-breaking.
- Preserve current DB import compatibility where practical, especially `sineDb`, `activeSineDbPath`, `defaultSineDbPath`, and `sineStatements`.
- `npm run check` must pass after each accepted milestone.
- `npm run test:sine` must pass after persistence, DB, repository, or server changes.
- `npm run test:sine:ui-characterization` must pass after UI smoke fixture changes.
- `npm run build` must pass after frontend-facing changes.

## Milestone 1: Consolidate Benchmark Scripts

Goal: reduce duplicated benchmark scenario, CLI, timing, and trace code in `scripts/sinePerf.ts`, `scripts/sineBrowserPerf.ts`, and `scripts/sineApiLatencyBenchmark.ts` without changing what the benchmarks measure.

Current shared modules already exist:

- `scripts/sine-benchmark/scenarios.ts`
- `scripts/sine-benchmark/cli.ts`
- `scripts/sine-benchmark/timing.ts`
- `scripts/sine-benchmark/trace.ts`

### 1. Reuse Shared Scenario Definitions Where Semantics Match

Update benchmark scripts to use `sineBenchmarkScenarios()` where their scenario definitions match the shared scenario semantics.

Primary targets:

- `scripts/sinePerf.ts`
- `scripts/sineBrowserPerf.ts`

Exit gates:

- `scripts/sinePerf.ts` no longer has a local `traceScenarios()` when the shared `mostly-waiting` and `high-action` scenarios satisfy the same benchmark intent.
- `scripts/sineBrowserPerf.ts` no longer has duplicated baseline/high-action scenario constants where the shared scenario data can be serialized safely.
- Browser benchmark scenarios passed into `page.evaluate()` are plain serializable data. Function-valued fields such as `maxSpawners` are resolved before crossing into the browser context.
- Scenario names in benchmark output remain clear and comparable with existing reports.
- Any scenario left local has a short comment explaining what is browser-specific or semantically different.

### 2. Reuse CLI, Rounding, Percentile, And Timing Helpers

Collapse duplicated CLI and numeric helpers into existing benchmark helper modules.

Primary targets:

- `scripts/sinePerf.ts`
- `scripts/sineBrowserPerf.ts`
- `scripts/sineApiLatencyBenchmark.ts`
- `scripts/sineHeadlessConcurrencyBenchmark.ts`
- `scripts/sineLabPersistenceSmokeBenchmark.ts`

Use existing helpers where semantics match:

- `parseFlagArgs()`
- `readInteger()`
- `readIntegerOption()`
- `readIntegerListOption()`
- `round()`
- `percentile()`
- timing bucket summary helpers

Exit gates:

- Duplicate local `parseArgs`, `readInteger`, `round`, and `percentile` implementations are removed where `scripts/sine-benchmark/*` semantics match.
- Any remaining local parser has a concrete reason, such as non-standard optional argument handling or endpoint-specific request shaping.
- Existing CLI flags still work for every touched script.
- Existing top-level JSON report fields remain stable for touched benchmark scripts.
- No benchmark script imports a helper that creates an inappropriate browser/Node dependency.

### 3. Reuse Trace Instrumentation Helpers

Use `scripts/sine-benchmark/trace.ts` for trace instrumentation where it can be imported directly.

Exit gates:

- `scripts/sinePerf.ts` uses `createTraceInstrumentation()` and `summarizeTraceInstrumentation()` from `scripts/sine-benchmark/trace.ts`.
- `scripts/sineBrowserPerf.ts` uses either a browser-safe serialized trace helper or keeps a local browser-context copy with a documented reason.
- Trace output fields remain unchanged except for harmless object field ordering.
- No production runtime file imports `scripts/sine-benchmark/trace.ts`.

### 4. Add Or Reuse A Benchmark Runner Helper Only If It Has Two Call Sites

Consider a focused helper such as `scripts/sine-benchmark/runner.ts` only if both `sinePerf.ts` and another benchmark can immediately share the same `bench` / `asyncBench` semantics.

Exit gates:

- A new runner helper is added only if at least two touched benchmark scripts use it.
- The helper returns the same fields currently emitted by `sinePerf.ts` where used: `name`, `iterations`, `avgMs`, `p50Ms`, `p95Ms`, and `result`.
- If only one script needs those exact semantics, no new helper is added.

### 5. Verify Representative Benchmark Smoke Commands

Run short smoke commands for touched benchmark scripts.

Required commands:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 5 --populations 10 --scenarios baseline --brain-iterations 1
npx tsx scripts/sinePhaseBenchmark.ts --ticks 5 --initial-spawners 10 --max-spawners 10
```

Add touched-script smoke commands where practical, for example:

```bash
npx tsx scripts/sinePerf.ts
npx tsx scripts/sineBrowserPerf.ts --populations 5 --advance-ticks 5 --scenarios fixed
```

Exit gates:

- Required smoke commands exit successfully.
- Any touched benchmark that is not smoke-run has a documented reason, such as needing a live server or being too slow for the current pass.
- `sineRuntimeHotPathBenchmark.ts` output still contains `ok`, `settings`, `results`, and `brainProfiles`.
- Benchmark output remains valid JSON where it was valid JSON before.

## Milestone 1 Exit Gates

- Benchmark scenario, CLI, timing, and trace duplication is reduced.
- Existing benchmark helper modules are reused instead of creating redundant helpers.
- Browser benchmark sharing respects `page.evaluate()` serialization boundaries.
- `npm run check` passes.

## Milestone 2: Extract UI Smoke Fixtures

Goal: keep `scripts/sineUiCharacterizationSmoke.ts` focused on browser routing and UI assertions, not large inline fake diagnostics payload construction.

### 1. Move Diagnostics Fixture Builders

Create a focused fixture module, for example:

- `scripts/sine-tests/sineUiFixtures.ts`

Move these builders out of `scripts/sineUiCharacterizationSmoke.ts`:

- `sessionSummary`
- `sessionAnalysis`
- `cohortAnalysis`
- `tradeQualityFilter`
- `summaryStats`
- `histogramRows`

Exit gates:

- `scripts/sineUiCharacterizationSmoke.ts` reads primarily as route setup, navigation, and assertions.
- Fixture builders are typed against existing Sine history API types.
- Fake analysis/cohort/session payload shapes remain unchanged.
- The fixture module has no Playwright dependency.
- The smoke script still clearly shows which API paths are mocked.

### 2. Preserve Current UI Smoke Coverage

Keep the current smoke assertions intact while moving only fixture construction.

Exit gates:

- SQLite Run Browser diagnostics panels still render in the smoke test.
- Mini-chart hover readout coverage remains.
- Gridline coverage remains.
- Help tooltip coverage remains.
- Comparison mode coverage remains.
- Help-page anchor navigation coverage remains.

## Milestone 2 Exit Gates

- `scripts/sineUiCharacterizationSmoke.ts` is shorter because fixture construction moved to a reusable home.
- No UI behavior, CSS class, API route, or payload shape changes are introduced.
- `npm run test:sine:ui-characterization` passes.
- `npm run check` passes.

## Milestone 3: Split Persistence Integration Tests By Responsibility

Goal: reduce `scripts/sine-tests/sinePersistence.test.ts` without weakening integration coverage or DB cleanup discipline.

### 1. Expand Existing Persistence Fixtures

Use the existing fixture home:

- `scripts/sine-tests/sinePersistenceFixtures.ts`

Move repeated builders and setup helpers where appropriate:

- persistence batch builders
- resolved food/trade builders
- state and genome snapshot builders
- session creation helpers
- diagnostics fixture helpers
- cleanup helpers where they can be used safely

Exit gates:

- Repeated inline persistence batch setup is reduced in test files.
- Fixture names describe domain intent, not low-level implementation mechanics.
- Fixtures do not hide assertions.
- Fixtures do not create implicit shared DB state between tests.
- Existing unique session ID usage remains intact.

### 2. Split The Large Persistence Test File

Split `scripts/sine-tests/sinePersistence.test.ts` into focused files.

Suggested files:

- `scripts/sine-tests/sinePersistenceBasic.test.ts`
- `scripts/sine-tests/sinePersistenceDiagnostics.test.ts`
- `scripts/sine-tests/sinePersistenceCohort.test.ts`
- `scripts/sine-tests/sinePersistenceInspection.test.ts`
- `scripts/sine-tests/sinePersistenceHeadlessSchema.test.ts`

Update:

- `scripts/testSine.ts`

Exit gates:

- Each split test file has a clear single responsibility.
- Every previous persistence test still runs through `npm run test:sine`.
- Test names remain specific enough to identify failures quickly.
- No assertions are removed or relaxed.
- DB cleanup and unique session ID handling remain explicit enough to avoid flaky cross-test contamination.

### 3. Verify Persistence Coverage

Exit gates:

- Persistence basics still cover save/reconstruct/session status behavior.
- Diagnostics tests still cover saved-run risk diagnostics, filtered ranges, trade quality age filters, and death cause series.
- Cohort tests still cover filtered cohort analysis and BTC candle-derived regimes.
- Inspection tests still cover death snapshots and historical RNN inspection semantics.
- Headless schema tests still cover unified headless schema support.

## Milestone 3 Exit Gates

- The persistence integration suite is organized by concern.
- `scripts/sine-tests/sinePersistence.test.ts` is removed or reduced to a minimal compatibility grouping only if needed.
- Shared setup lives in `sinePersistenceFixtures.ts`.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 4: Split Sine DB Schema From Statements

Goal: separate DB opening, schema initialization, and prepared statement creation while preserving existing import compatibility and SQL behavior.

Current hotspot:

- `server/sineDb.mjs`

### 1. Extract Schema Initialization

Create:

- `server/sineSchema.mjs`

Move schema setup into:

- `initializeSineSchema(db)`

This includes:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `ensureColumn`
- schema/migration bootstrap work

Exit gates:

- `server/sineDb.mjs` still opens the same DB path and exports `sineDb`, `defaultSineDbPath`, and `activeSineDbPath`.
- Schema initialization still runs at module load for existing server behavior.
- No table, column, index, default, unique constraint, or foreign key definition changes.
- The SQL text is relocated, not redesigned.
- Existing server `.mjs` syntax check passes.

### 2. Extract Prepared Statement Creation

Create:

- `server/sineStatements.mjs`

Move statement construction into:

- `createSineStatements(db)`

Exit gates:

- `server/sineDb.mjs` continues to export `sineStatements` as a compatibility facade.
- Existing modules can continue importing `sineStatements` from `server/sineDb.mjs` unless a narrow import update is clearly cleaner.
- Prepared statement names remain unchanged.
- SQL query text is unchanged except for relocation.
- No circular import is introduced between `sineDb.mjs`, `sineSchema.mjs`, and `sineStatements.mjs`.

### 3. Keep Repository And Writer Behavior Stable

Exit gates:

- `server/sineRepository.mjs`, `server/sinePersistenceWriter.mjs`, `server/sineHistoricalContext.mjs`, `server/sineSpawnerInspectionRepository.mjs`, and headless unified read/write repositories continue to work.
- No API route behavior changes.
- No DB writes move to a new persistence owner.
- Existing unified headless DB tests pass.

## Milestone 4 Exit Gates

- `server/sineDb.mjs` becomes a DB-open/bootstrap compatibility facade.
- Schema initialization and prepared statement creation have focused homes.
- Existing import compatibility is preserved.
- No schema, SQL, API, or persistence behavior changes are introduced.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 5: Final Verification And Redundancy Audit

Goal: prove that the cleanup reduced redundancy without creating new duplicate layers.

### 1. Audit Remaining Duplicate Helpers

Run targeted searches.

Suggested commands:

```bash
rg -n "function parseArgs|function readInteger|function percentile|function round\\(|function createTraceInstrumentation|scenarioConfig|traceScenarios" scripts
rg -n "sessionAnalysis\\(|cohortAnalysis\\(|tradeQualityFilter\\(|histogramRows\\(|summaryStats\\(" scripts
rg -n "CREATE TABLE IF NOT EXISTS|ensureColumn\\(|CREATE INDEX IF NOT EXISTS|export const sineStatements" server
```

Exit gates:

- Remaining duplicate helpers are either eliminated or documented as semantically different.
- Benchmark scenarios are centralized where semantics match.
- UI smoke fixture builders are not duplicated in the smoke script.
- Persistence setup duplication is materially reduced.
- DB schema and statement ownership are separated without hiding SQL.

### 2. Run Full Verification

Required commands:

```bash
npm run check
npm run test:sine
npm run test:sine:ui-characterization
npm run build
git diff --check
```

Exit gates:

- All required commands pass.
- Benchmark smoke commands from Milestone 1 have passed or have documented skip reasons.
- No simulation parity tests change.
- No saved-run diagnostics values change.
- No DB schema or API behavior changes are introduced.

## Final Exit Gates

- The five hotspots are simplified through reuse or responsibility splits:
  - benchmark scripts
  - browser benchmark script
  - API latency benchmark script
  - UI characterization smoke fixtures
  - persistence/DB support layer
- Existing helper modules are reused where appropriate.
- New modules exist only where no clean existing home existed.
- Functional parity is preserved.
- No permanent redundant framework layer is introduced.
