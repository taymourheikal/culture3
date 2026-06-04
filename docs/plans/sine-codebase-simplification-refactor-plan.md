# Sine Codebase Simplification Refactor Plan

This plan simplifies the Sine module while preserving functional parity. The goal is not to make files shorter for its own sake. The goal is to separate mixed responsibilities, reduce duplicated helper logic, make diagnostics and UI code easier to understand, and keep hot runtime paths safe from accidental behavior or latency regressions.

The plan targets eight high-value areas:

- saved-run repository decomposition
- shared diagnostics bucket/range helpers
- trade-quality and risk analytics extraction
- saved-run diagnostics UI decomposition
- metric rendering consolidation
- Lab workbench panel decomposition
- headless runtime/repository organization
- test fixture and Help page structure cleanup

## Non-Goals

- Do not change simulation behavior, reward logic, payoff logic, transaction-cost handling, reproduction rules, death rules, mutation, learning, market inputs, brain evaluation semantics, uniqueness semantics, or persistence schemas.
- Do not rename the Sine module in this plan.
- Do not refactor Ant World.
- Do not create a generic framework shared by Ant and Sine.
- Do not create duplicate old/new implementations behind permanent compatibility wrappers.
- Do not introduce broad classes where focused functions and modules match the existing codebase better.
- Do not abstract test assertions so heavily that tests stop documenting behavior.
- Do not refactor `src/sine/spawner/brain.ts` for aesthetics. Brain/runtime hot-path changes require separate parity and perf work.
- Do not expect exact millisecond timing parity. Timing schemas, counters, chunk boundaries, checkpoint ticks, and simulation results must stay equivalent; elapsed time itself is naturally variable.

## Architecture Gates

These gates apply to every milestone.

- Public APIs should remain stable unless a step explicitly states otherwise. In particular, `server/sineRepository.mjs` and `server/sineHeadlessRepository.mjs` should remain facades for existing callers during the refactor.
- Compatibility should live at boundaries: repository facades, historical context builders, DTO parsers, and test fixtures. Runtime and UI modules should not accumulate scattered compatibility branches.
- Analytics modules should receive already-loaded context rows or typed models. Repository/context modules may query DB statements; pure diagnostics modules should not.
- Shared helpers should be domain-shaped and small. Prefer explicit helpers such as `createTickSizeBuckets`, `createFixedCountBuckets`, `selectTradeQualityAgents`, and `buildCohortRegimeGrid` over vague generic utilities.
- Different semantics must stay distinct. Historical 20-bucket diagnostics and configurable fixed-count cohort buckets should share primitives only where their behavior is truly identical.
- Metric rendering should avoid adding a third redundant metric component. Reuse existing visual primitives or create one small base primitive with explicit variants.
- UI component splits should be by responsibility, not arbitrary line count.
- Headless organization should keep one runtime engine and one repository contract. Do not fork a second headless-only simulation model.
- Hot-path modules should not import React, server repositories, persistence clients, or browser-only APIs.
- Verification should include `npm run check`, `npm run test:sine`, and targeted Playwright/browser smoke checks for UI refactors.

## Milestone 0: Characterization And Parity Harness

Goal: capture the existing behavior before moving code. This milestone should not change production behavior.

### 1. Add Saved-Run Diagnostics Characterization Tests

Add focused tests that serialize representative saved-run diagnostics before the repository split.

Required coverage:

- full-run diagnostics
- percent-range diagnostics
- population/resilience diagnostics
- death-cause diagnostics
- trading performance and bucket risk
- trade-quality filters, including age percentile filters
- population structure and agent-age distribution

Exit gates:

- Tests run through `npm run test:sine`.
- Expected outputs cover labels, scalar values, bucket boundaries, histogram counts, and null/empty states.
- Tests avoid volatile timestamps unless they are explicitly part of the contract.
- Existing saved-run persistence tests still pass before any extraction work begins.

### 2. Add Cohort/Regime Characterization Tests

Capture filtered cohort analysis behavior before extracting cohort modules.

Required coverage:

- generated-market regime status
- BTC regime status `available`
- BTC regime status `partial`
- BTC regime status `missing`
- empty eligible-agent cohorts
- fixed-count cohort bucket boundaries
- concentration metrics and timing-overlap score

Exit gates:

- Cohort tests assert bucket count, bucket start/end ticks, trade counts, hit rates, total payoff, regime labels, and concentration metrics.
- Market-candle fixtures clean up after themselves and do not pollute future tests.
- Generated, missing, partial, and available regimes remain distinguishable.
- Empty cohort behavior is explicitly covered.

### 3. Add Headless Timing/Checkpoint Characterization Tests

Capture schema and semantic behavior for headless timing and checkpoint output.

Exit gates:

- Tests assert timing object field presence, counter semantics, and top sink method shape without comparing exact millisecond values.
- Tests assert checkpoint ticks for representative interval settings.
- Tests assert cancel, extinction, target completion, and market-end behavior where existing fixtures make that practical.
- Row counts and representative parsed rows remain covered.

### 4. Add UI Smoke Coverage For Split Targets

Add or document Playwright smoke checks for the UI areas that will be split.

Required areas:

- SQLite Run Browser diagnostics
- Trade Quality Distributions and filtered cohort panel
- Lab selected-agent panel
- Help page section navigation

Exit gates:

- Playwright can load the relevant page or mock state without manual setup beyond the normal dev service.
- Smoke checks verify key text/controls render and no obvious layout overflow occurs.
- Existing UI behavior is captured before component decomposition begins.

## Milestone 0 Exit Gates

- Production behavior is unchanged.
- `npm run check` passes.
- `npm run test:sine` passes.
- Characterization tests are specific enough to catch bucket, range, filter, and DTO shape drift during later milestones.

## Milestone 1: Saved-Run Repository Foundation

Goal: split `server/sineRepository.mjs` into focused server modules while keeping the public repository API stable.

### 1. Extract Persistence Writes

Move saved-run batch/session write logic into `server/sinePersistenceWriter.mjs`.

This includes:

- `saveSinePersistenceBatch` internals
- session write/upsert helpers
- birth/death/genome/state/food/event/uniqueness row writers
- persistence JSON/stringify helpers needed by those writers

Exit gates:

- `server/sineRepository.mjs` still exports `saveSinePersistenceBatch`, `upsertSineSession`, `updateSineSessionStatus`, and `deleteSineSession`.
- `server/sineRoutes.mjs` does not need route behavior changes.
- Persistence row counts and representative persisted rows match characterization tests.
- Status persistence behavior, including stopped/paused handling, remains unchanged.
- No SQL statement names or table writes change.

### 2. Extract Historical Analysis Context

Move historical row loading, range resolution, tick filtering, baseline population, alive-at-range-end, and agent-age exposure into `server/sineHistoricalContext.mjs`.

Exit gates:

- Full-run and percent-range diagnostics produce identical characterization outputs.
- `fromPercent` and `toPercent` clamping/reset behavior remains unchanged.
- Agent age exposure remains range-relative where currently range-relative.
- Context construction is the only diagnostics layer that directly loads saved-run births, deaths, resolved foods, and spawned foods from DB statements.

### 3. Extract Explicit Bucket Helpers

Create a small diagnostics bucket helper module with explicit semantics.

Required helper families:

- tick-size historical buckets
- fixed-count cohort buckets
- bucket start/index helpers

Milestone 0 characterization confirmed that these helpers must preserve two different bucket contracts:

- historical diagnostics buckets are anchored to the selected diagnostics range origin, `range.fromTick`. For example, with range `50-100`, bucket size `3`, and a trade at tick `70`, the current bucket is `68-70`, not `70-72`.
- fixed-count cohort buckets use inclusive range span math, `range.toTick - range.fromTick + 1`, and assign every bucket an index from `0` to `bucketCount - 1`.

Exit gates:

- Historical 20-bucket diagnostics preserve current boundaries.
- Cohort fixed-count buckets preserve current boundaries.
- Inclusive/exclusive edge tests cover first tick, last tick, and ticks equal to bucket boundaries.
- Ranged historical diagnostics preserve range-origin bucket anchoring, including the characterized `50-100` range case where tick `70` maps to `68-70`.
- No duplicate server diagnostics implementations of `bucketStart`, `cohortBucketIndex`, or historical bucket sizing remain after migration.
- UI-only chart scaling or rendering helpers are not forced into this server helper.

## Milestone 1 Exit Gates

- `server/sineRepository.mjs` no longer owns persistence write internals, historical row loading, range filtering, or server diagnostics bucket math.
- Saved-run analysis and persistence characterization tests pass.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 2: Saved-Run Analytics Modules

Goal: move analytics logic out of the repository facade and into focused, reusable modules.

Milestone 1 established the server boundary for saved-run analysis:

`DB row loading -> historical context -> pure diagnostics modules -> repository facade/API DTO`

Keep that boundary intact. Analytics modules should consume the context model returned by `createHistoricalAnalysisContext()` and the explicit bucket helpers from `server/sineDiagnosticsBuckets.mjs`. They should not re-query saved-run births, deaths, resolved foods, or spawned foods, and they should not recreate historical or cohort bucket math.

### 1. Extract Trade-Quality Analytics

Move trade-quality model creation, agent trade summaries, min-trade filters, age percentile filters, Sharpe/Sortino summaries, downside volatility summaries, and histograms into `server/sineTradeQuality.mjs`.

Milestone 0 characterization confirmed that age percentile filtering is based on agent exposure within the selected diagnostics range, not always absolute lifetime age. Preserve that range-relative age behavior unless a future plan explicitly changes the user-facing semantics.

Exit gates:

- Trade Quality Distributions values remain unchanged for all characterized filters.
- Filtered cohort analysis consumes the same exported trade-quality selection model.
- Sharpe, Sortino, downside volatility, hit rate, average payoff, and age thresholds remain unchanged.
- Age percentile thresholds remain range-relative for ranged diagnostics.
- Trade-quality constants and filter definitions move with the trade-quality module instead of remaining in `server/sineRepository.mjs`.
- No second implementation of trade-quality filtering exists in `server/sineRepository.mjs` or cohort code.
- The trade-quality module consumes resolved trades and agent-age context; it does not query DB statements directly.

### 2. Extract Population, Trading, Risk, And Structure Diagnostics

Move population diagnostics, death-cause diagnostics, trading performance diagnostics, risk/tail diagnostics, and population structure diagnostics into focused modules.

Suggested modules:

- `server/sinePopulationDiagnostics.mjs`
- `server/sineTradingDiagnostics.mjs`
- `server/sineRiskDiagnostics.mjs`
- or one cohesive `server/sineRunDiagnostics.mjs` if the split would otherwise be too fragmented

Exit gates:

- Run Health values remain unchanged.
- Resilience values and death-cause series remain unchanged.
- Trading Performance series, bucket risk values, drawdowns, and worst-bucket values remain unchanged.
- Risk/Tail histograms and VaR/CVaR values remain unchanged.
- Population Structure values and age distributions remain unchanged.
- Population/risk/trading constants such as population thresholds, historical chart limits, and age bins move with the module that owns the corresponding analytics.
- Analytics modules consume historical context rows and do not directly query DB statements.
- Historical bucket calculations use `server/sineDiagnosticsBuckets.mjs`; no local historical bucket sizing or bucket-start helper is recreated.

### 3. Extract Cohort And Regime Diagnostics

Move cohort timeline, regime grid, and concentration analysis into `server/sineCohortDiagnostics.mjs`.

Keep regime data access as an explicit boundary. The pure cohort diagnostics module should operate on trades, a diagnostics range, bucket count, and a supplied regime context. BTC candle loading and regime-context construction may live in a small adjacent module, for example `server/sineCohortRegimeContext.mjs`, because it is the only cohort-related layer that should touch `marketDataStatements`.

Milestone 0 characterization confirmed that cohort analysis has an internal/public DTO boundary: internal timeline rows may carry `agentIds` for concentration and regime-grid aggregation, but the public API timeline strips `agentIds` before returning data to the UI.

Exit gates:

- Filtered cohort API response shape remains unchanged.
- Cohort timeline values remain unchanged.
- Public cohort timeline rows do not expose internal `agentIds`.
- Empty eligible cohorts still return a full fixed-count timeline with zero trades and `null` hit rates.
- Regime status remains `available`, `partial`, `missing`, or `unknown` under the same conditions as before.
- Generated-market cohort analysis continues to report regime status `unknown`.
- BTC cohort analysis continues to distinguish `available`, `partial`, and `missing`.
- Regime grid trade totals match cohort concentration trade totals.
- Concentration metrics remain unchanged.
- Cohort constants such as trend/volatility labels, overlap limits, and bucket-count bounds move with cohort/regime modules instead of remaining in `server/sineRepository.mjs`.
- Cohort fixed-count bucket math uses `server/sineDiagnosticsBuckets.mjs`; no local `cohortBucketIndex` or fixed-count bucket implementation is recreated.
- Pure cohort diagnostics do not import `marketDataStatements`, `sineStatements`, or saved-run repository code.
- BTC candle/regime context logic is centralized and does not duplicate `marketDataRepository` timestamp parsing behavior unnecessarily.

### 4. Extract Spawner Historical Inspection

Move historical spawner reconstruction into `server/sineSpawnerInspectionRepository.mjs`.

Exit gates:

- `getSineSpawnerInspection` remains exported from `server/sineRepository.mjs`.
- Live, dead-after-death, before-birth, missing-spawner, legacy-genome, learned-state, and uniqueness-inspection tests remain unchanged.
- Death snapshots remain authoritative after death.
- Historical inspection response shape remains unchanged.

## Milestone 2 Exit Gates

- `server/sineRepository.mjs` contains public facade exports and high-level composition only.
- Saved-run routes continue to call the same public facade.
- `server/sineRepository.mjs` no longer owns saved-run analytics constants, filter definitions, bucket helpers, cohort math, or historical reconstruction internals.
- Saved-run analytics modules consume `sineHistoricalContext` output and do not directly query saved-run DB statements.
- Characterization tests pass without fixture rewrites beyond import-path changes.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 3: Saved-Run Diagnostics UI Decomposition

Goal: split the SQLite Run Browser diagnostics UI into focused files without visual or behavioral changes.

Milestone 2 kept the saved-run API DTOs stable while moving server analytics behind `server/sineRepository.mjs`. Keep this milestone strictly UI-side: panels should consume `sineHistoryTypes` and API responses only. Do not import server analytics modules, do not duplicate formulas from `server/sineRunDiagnostics.mjs`, `server/sineTradeQuality.mjs`, or `server/sineCohortDiagnostics.mjs`, and do not use this UI split to change diagnostics semantics.

### 1. Split `RunDiagnosticsPanels.tsx` By Panel

Move each major panel into its own file while keeping `RunDiagnosticsDashboard` as the composition layer.

Suggested files:

- `RunDiagnosticsDashboard.tsx`
- `RunHealthPanel.tsx`
- `RunResiliencePanel.tsx`
- `RunTradingPerformancePanel.tsx`
- `RunTradeQualityPanel.tsx`
- `RunCohortPerformancePanel.tsx`
- `RunRiskTailPanel.tsx`
- `RunPopulationStructurePanel.tsx`
- `RunComparisonPanel.tsx`

Exit gates:

- Run Health, Resilience, Trading Performance, Trade Quality, Filtered Cohort Performance, Risk/Tail, Population Structure, and Comparison all render.
- Component props use existing `sineHistoryTypes` DTOs rather than recalculating domain values.
- No server diagnostic formula is copied into UI components.
- Existing chart primitives remain in `RunDiagnosticsUi.tsx`.
- No panel imports server code or simulation internals.

### 2. Keep Cohort Subcomponents Local To Cohort UI

Move cohort timeline chart, regime grid, concentration display, and cohort empty states into the cohort panel file or a small cohort UI helper file.

Exit gates:

- Filter changes still request cohort analysis with the selected min-trade/min-age/range values.
- Loading, error, empty, generated, missing, partial, and available regime states still render.
- Regime grid layout remains responsive.
- Point-in-time hover/readout behavior remains unchanged.

### 3. Add Descriptor-Based Metric Rendering Without Redundant Components

Introduce metric descriptor arrays where they reduce repeated JSX, while rendering through existing visual primitives or one shared base primitive with explicit variants.

Exit gates:

- Metric labels, values, ordering, and help tooltips remain unchanged.
- The codebase does not gain a third unrelated metric card component duplicating `Metric` and `HistorySummaryItem`.
- Metric renderers remain presentational and do not perform domain calculations.
- Playwright verifies key diagnostics metrics still appear.

## Milestone 3 Exit Gates

- Saved-run UI files are organized by panel responsibility.
- SQLite Run Browser visuals and interactions remain functionally equivalent.
- `npm run check` passes.
- `npm run test:sine:ui-characterization` passes.
- Playwright verifies Saved Run Browser load, filters, cohort panel, comparison mode, and responsive layout.

## Milestone 4: Lab Workbench Panel Cleanup

Goal: split Lab workbench panels and selected-agent presentation without changing live worker packets or runtime behavior.

Milestone 3 validated the compatibility-barrel pattern for UI decomposition: the old public import surface can remain as a tiny export file while responsibility moves into focused panel files. Apply that same pattern here. `SineLabView.tsx` should be able to keep importing from `SineWorkbenchPanels.tsx`, while `SineWorkbenchPanels.tsx` becomes a small barrel/composition boundary rather than the owner of every panel implementation.

Keep this split Lab-native. The saved-run diagnostics shared renderer in `src/sine/history/RunDiagnosticsShared.tsx` is history-specific and should not be reused directly in the Lab just to reduce file count. Lab panels should continue to render through existing Lab visual primitives such as `Metric`, meters, badges, score strips, and selected-agent section components, or through a small Lab-specific descriptor renderer when that removes real repetition.

### 1. Split `SineWorkbenchPanels.tsx`

Move each major workbench panel into a focused file.

Suggested files:

- `PopulationHealthPanel.tsx`
- `RunPerformancePanel.tsx`
- `PopulationCompositionPanel.tsx`
- `RuntimeHealthPanel.tsx`
- `SelectedSpawnerPanel.tsx`
- `SelectedSpawnerClusterContext.tsx`
- small shared visual components for meters, badges, scores, and sections

Exit gates:

- `SineWorkbenchPanels.tsx` remains a small compatibility barrel for the existing `SineLabView.tsx` import path.
- Lab layout remains unchanged.
- Population Health, Run Performance, Population Composition, Runtime Health, and Selected Agent panels still render.
- Runtime Diagnostics, RNN inspection, Uniqueness inspection, and cluster context controls still work.
- No duplicated selected-agent calculations are introduced.
- Extracted Lab panels do not import saved-run history UI helpers merely for visual reuse.

### 2. Centralize Selected-Agent Metric Descriptors

Keep selected-agent derivations in `selectedSpawnerPanelModel` or a nearby focused model module, then render sections through descriptors and existing Lab visual components.

Do this incrementally. `selectedSpawnerPanelModel` currently owns selected-agent identity/status, age, freshness, latest timeline sample, and spawned/resolved ratio. Move additional derived values into that model only when they are already being derived in the UI or when the move prevents repeated calculation. Do not turn the model into a renderer, and do not move raw roster-packet fields into the model just to shorten JSX.

Exit gates:

- Age, birth tick, open trades, cooldown, lifetime performance, recent performance, topology, perception, mutation, learning, and cluster-context metrics remain unchanged.
- Missing, stale, outside-roster, and live selected-agent states still render correctly.
- Tooltip definitions remain attached to the same metrics.
- Rendering components do not recompute domain metrics already available in the model or roster packet.
- The model remains a pure derivation layer with no React, DOM, worker, or persistence imports.
- Existing `selectedSpawnerPanelModel` tests continue to cover status, age/freshness, missing-agent, and timeline behavior.

### 3. Avoid Packet Or Runtime Contract Changes

Keep this milestone UI-only.

Exit gates:

- No changes to `marketWorkerProtocol` packet shapes.
- No changes to worker packet cadence.
- No changes to selected-agent timeline sampling.
- Existing worker protocol tests remain unchanged.

## Milestone 4 Exit Gates

- Workbench panel files are organized by responsibility.
- `SineWorkbenchPanels.tsx` is a thin compatibility export/composition boundary, not a duplicate implementation.
- Selected-agent behavior is functionally identical.
- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run test:sine:ui-characterization` passes.
- Playwright verifies agent selection, selected-agent panel rendering, RNN/Unique buttons, runtime diagnostics button, and mobile layout without horizontal overflow.

## Milestone 5: Headless Runtime Organization

Goal: simplify headless orchestration while keeping one shared simulation engine and one headless run contract.

Milestone 2 introduced an explicit server-side market-data parsing boundary by exporting `parseStartTimestamp()` from `server/marketDataRepository.mjs` and reusing it in saved-run cohort regime analysis. Keep `src/sine/headless` server-agnostic: the headless runner should continue to receive an injected `candleLoader`, while server-side loader code may use `getMarketCandles()` and the shared market-data parsing semantics.

### 1. Extract Headless Timing Collector

Move timing collection, sink instrumentation, flush timing, chunk normalization, sink-method aggregation, and timing snapshot construction into `src/sine/headless/headlessTimingCollector.ts`.

Milestone 0 characterization confirmed that timing parity means preserving schema, counters, chunk fields, sink method accounting, and top-sink-method shape. Do not compare exact elapsed milliseconds.

Exit gates:

- Timing snapshot has the same field names and nested shapes.
- Chunk records preserve start tick, end tick, processed tick count, population, core estimate, sink enqueue time, sink flush time, and ticks-per-second semantics.
- Top sink method is still reported by method, calls, and elapsed ms.
- Sink method call counts still match the timing `sinkMethods` counters.
- Tests do not compare exact elapsed milliseconds.

### 2. Extract Checkpoint Scheduling

Move checkpoint interval calculation, duplicate-checkpoint prevention, and forced checkpoint handling into `src/sine/headless/headlessCheckpointScheduler.ts`.

Milestone 0 characterization confirmed representative checkpoint sequencing, including initial forced checkpoint, interval checkpoints, and final forced checkpoint.

Exit gates:

- Initial forced checkpoint still happens.
- Final forced checkpoint still happens.
- Interval checkpoints fire at the same ticks as before.
- The characterized `checkpointIntervalTicks: 50`, `ticks: 140` run still emits checkpoints at `[0, 50, 100, 140]`.
- No duplicate checkpoint is emitted for the same tick.
- Progress payloads still report the same latest checkpoint/write-count information.

### 3. Extract BTC Candle Refill Helpers

Move headless BTC candle initialization and refill logic into `src/sine/headless/headlessCandleLoader.ts` or a similarly focused module.

This module should manage runner-side candle-loader orchestration only: requiring a loader for BTC sources, applying snapped start metadata, checking the low-water mark, and appending returned candles. It should not import `server/marketDataRepository.mjs`, `marketDataDb.mjs`, or any SQLite/server-only module.

Exit gates:

- Generated-market headless runs do not require a candle loader.
- BTC headless runs still require a candle loader.
- Initial snapped candle behavior remains unchanged.
- Refill low-water behavior remains unchanged.
- Market-end behavior remains unchanged.
- `src/sine/headless` remains free of server/database imports.

### 4. Keep `runner.ts` As Orchestration

After extraction, `runner.ts` should read as setup, record founders, run chunks, checkpoint/progress, finalize.

Exit gates:

- Deterministic headless run result status, termination reason, final tick, population, eligible agent IDs, and row counts remain unchanged.
- Cancel/extinction/market-end handling remains unchanged.
- The headless runner still uses `createSimulationState`, `createCandleSimulationState`, and `advanceSimulationToTarget`.
- No second simulation runtime path is created.

## Milestone 5 Exit Gates

- Headless orchestration is easier to scan without changing semantics.
- `npm run check` passes.
- `npm run test:sine` passes.
- Representative headless smoke run completes and produces the same row-count shape as before.

## Milestone 6: Headless Repository Organization

Goal: split `server/sineHeadlessRepository.mjs` by responsibility while keeping `createSineHeadlessRepository()` stable.

Milestone 2 validated the repository-facade pattern for saved runs: a thin public facade can compose focused write, read, context, and parser modules while preserving route behavior. Apply the same pattern here. `server/sineHeadlessRepository.mjs` should become the single public construction facade, not a second implementation path or a dumping ground for read/write details.

Milestone 5 reinforced that public import surfaces should remain stable while internals move. Preserve both public headless repository exports: `createSineHeadlessRepository()` and `markInterruptedSineHeadlessRunsFailed()`. Server routes, server job orchestration, CLI scripts, and tests should continue importing from `server/sineHeadlessRepository.mjs`; do not push read/write module imports into callers.

### 1. Split Write Sink Logic

Move headless write sink methods and batch-write behavior into `server/sineHeadlessWriteRepository.mjs`.

Exit gates:

- `createSineHeadlessRepository().sink` exposes the same methods.
- `markInterruptedSineHeadlessRunsFailed()` remains exported from `server/sineHeadlessRepository.mjs`.
- Batched writes preserve transaction behavior.
- Batch rollback behavior remains unchanged.
- Run, checkpoint, agent, event, trade, snapshot, and metrics row counts match characterization tests.

### 2. Split Read Query Logic

Move leaderboard, agent detail, lineage leaderboard, event timeline, trade breakdown, run lookup, checkpoint list, and agent-specific list queries into `server/sineHeadlessReadRepository.mjs`.

Exit gates:

- Public methods on `createSineHeadlessRepository()` remain unchanged.
- Server routes, headless jobs, CLI scripts, and tests keep importing the public repository facade instead of read/write internals.
- Returned DTO shapes remain unchanged.
- Query filters such as minimum resolved trades, alive/dead, and lineage remain unchanged.
- Existing headless UI/API tests pass.

### 3. Extract Row Parsers And Minimal Repository Utilities

Move row parsers and tiny JSON/number helpers into focused modules.

Exit gates:

- Invalid JSON fallback behavior remains unchanged.
- Parser outputs remain unchanged.
- Shared utilities stay small and repository-specific; no broad dumping-ground utility module is created.
- Saved-run and headless repositories share helpers only where behavior is identical.
- `server/sineRepositoryUtils.mjs` may be reused for identical JSON/number semantics, but headless-specific parsing rules stay in headless-specific modules.
- No saved-run-only compatibility behavior is pulled into headless code merely to reduce file count.

### 4. Keep SQL Statement Ownership Clear

Either keep all headless SQL statements in one statement module or keep statement creation near the read/write modules if that improves cohesion. Do not scatter related statements unpredictably.

Exit gates:

- Statement names remain discoverable.
- Read and write modules do not duplicate equivalent SQL.
- `createSineHeadlessRepository()` remains the single public construction point.
- `markInterruptedSineHeadlessRunsFailed()` remains part of the public facade.
- Server routes do not need structural changes.

## Milestone 6 Exit Gates

- Headless repository code is organized by write, read, statement, and parse responsibilities.
- `server/sineHeadlessRepository.mjs` is a thin facade over focused modules, similar in spirit to `server/sineRepository.mjs` after Milestone 2.
- Public repository API remains stable, including `createSineHeadlessRepository()` and `markInterruptedSineHeadlessRunsFailed()`.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 7: Test Fixture Consolidation

Goal: reduce repeated fixture-building code while preserving test clarity.

Milestone 2 showed the value of facade-level characterization tests: existing tests that call `server/sineRepository.mjs` caught behavior across the extracted modules without binding tests to private implementation details. Keep that pattern. Direct pure-module tests are useful for narrow edge cases, but they should supplement facade/API-level characterization rather than replace it.

Milestone 4 also showed that UI smoke tests are most valuable when they assert concrete user-facing behavior directly: visible panel headings, selected-agent controls, modal open/close behavior, and responsive overflow. Fixture consolidation should not hide those assertions behind vague helpers.

Milestone 6 reinforced the same public-contract rule for headless tests. Headless repository tests should continue to exercise `server/sineHeadlessRepository.mjs` as the public facade unless a narrow parser or pure helper needs direct edge coverage. Do not bind tests to private read/write/statement modules merely because those files now exist.

### 1. Extract Persistence Test Fixtures

Move repeated persistence fixture builders into `scripts/sine-tests/sinePersistenceFixtures.ts`.

Likely candidates:

- state snapshot builders
- food event builders
- trade event builders
- persistence batch builders
- close/assert helpers where they are reused

Exit gates:

- Assertions remain in the test files.
- Fixture names describe domain behavior, not incidental implementation details.
- No global mutable fixture state is introduced.
- Existing persistence tests pass with the same test names and coverage.

### 2. Extract Headless Test Fixtures Where Reused

Move repeated headless memory sink, empty batch, run start, food, and recorder fixtures only if they are reused or make test intent clearer.

Exit gates:

- Headless tests remain readable.
- Headless repository tests keep importing the public `server/sineHeadlessRepository.mjs` facade for repository contract coverage.
- Failure-path tests still show the failure condition locally.
- Batch rollback and memory sink behavior remain covered.
- No helper hides important side effects.
- Timing/checkpoint assertions remain explicit enough to verify timing schema, sink call counts, checkpoint ticks, candle lifecycle timestamps, and DB row-count shape.

### 3. Split Oversized Test Files Only Along Subsystem Boundaries

Split test files only where the resulting files map to real subsystems.

Exit gates:

- `npm run test:sine` remains the only command needed.
- Test names remain descriptive.
- Imports do not become more complex than the test body they simplify.
- Coverage for persistence, worker protocol, brain evaluation, genome runtime, and headless behavior remains intact.
- UI smoke checks keep direct assertions for user-visible labels, controls, modal behavior, and responsive overflow instead of hiding those checks behind broad fixture helpers.

## Milestone 7 Exit Gates

- Fixture duplication is reduced.
- Test files remain behavior-documenting.
- Facade-level saved-run and headless characterization tests remain in place after fixture extraction.
- `npm run test:sine` passes.

## Milestone 8: Help Page Structure

Goal: make the Help page and local documentation easier to maintain without changing Help content or navigation behavior.

Milestone 4 reinforced that UI splits should stay native to the surface being split. Help content and diagrams should be organized with Help-specific content modules and named diagram/render helpers. Do not introduce broad shared UI abstractions across Lab, saved-run history, and Help merely to reduce file count.

### 1. Split Help Content From Renderer

Move section definitions, terminology, copy, and diagram metadata out of `SineHelpPage.tsx` into a structured content module.

Exit gates:

- Help page text remains unchanged except for intentional typo fixes.
- Section anchors and top navigation still work.
- The React page becomes mostly rendering/layout logic.
- Help content does not import runtime simulation modules.
- Help content uses Help-specific structure rather than shared Lab/history metric renderers.

### 2. Keep Diagrams And Interactive Elements Explicit

Keep SVGs, diagrams, and interactive help elements as named render helpers or content blocks, not as hidden strings inside the content file.

Exit gates:

- Existing visual explanations still render.
- Diagram code remains searchable by topic.
- No runtime packet, server, or simulation dependency is introduced.
- `npm run build` passes.
- Diagram/render helpers remain explicit and Help-scoped; they do not become generic UI utilities unless a real repeated Help pattern needs it.

### 3. Refresh Local Server Documentation

Update `server/README.md` so it reflects the current Sine server layout after Milestones 1, 2, 5, and 6.

Exit gates:

- `server/sineRepository.mjs` is described as the saved-run facade, not as the owner of every persistence and inspection responsibility.
- The README mentions the focused saved-run modules, including persistence writing, historical context, diagnostics, cohort/regime diagnostics, and historical spawner inspection.
- The README mentions the headless runner split into runner orchestration, timing collection, checkpoint scheduling, candle loading, and recording.
- The README describes `server/sineHeadlessRepository.mjs` as the public headless repository facade after Milestone 6.
- The README mentions both public headless repository exports: `createSineHeadlessRepository()` and `markInterruptedSineHeadlessRunsFailed()`.
- The README describes headless read/write/statement/parser modules as internals behind the facade, not as caller-facing APIs.
- Documentation stays concise and does not become an implementation dump.
- Ant World server descriptions remain unchanged unless they are factually stale.

## Milestone 8 Exit Gates

- Help page content is easier to edit by section.
- `server/README.md` accurately describes the current Sine server module split.
- Help page UI behavior remains unchanged.
- `npm run check` passes.
- `npm run build` passes.
- Playwright verifies Help page navigation and representative sections.

## Final Verification Gates

- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run test:sine:ui-characterization` passes.
- `npm run build` passes.
- Playwright verifies Lab selected-agent panel, SQLite Run Browser, filtered cohort diagnostics, comparison mode, and Help page navigation.
- Saved-run diagnostics characterization outputs remain unchanged except for explicitly approved import/file organization changes.
- Headless characterization outputs remain unchanged in schema, counters, checkpoint ticks, and row-count semantics.
- No simulation parity tests change, because this refactor should not alter agent behavior, learning, mutation, reward, reproduction, death, market inputs, brain evaluation, uniqueness scoring, persistence schema, or runtime timing semantics.
