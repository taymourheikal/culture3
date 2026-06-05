# Sine Diagnostics And Headless Simplification Plan

This plan addresses the latest Sine maintainability audit. The goal is to reduce mixed responsibilities and repeated diagnostics/headless analysis logic while preserving functional parity.

This project is still actively evolving toward richer backtesting, trading-strategy analysis, and seed-bank workflows. The plan therefore prioritizes changes that make future work easier to extend safely. It is not a file-size reduction pass.

## Non-Goals

- Do not change simulation behavior, reward/payoff logic, transaction-cost handling, reproduction rules, death rules, mutation semantics, learning formulas, market inputs, brain evaluation results, strategy-map semantics, uniqueness scoring, or persistence semantics.
- Do not rename Sine/module paths in this plan.
- Do not refactor Ant World.
- Do not change DB schemas.
- Do not redesign the SQLite Run Browser, headless analysis UI, Lab UI, charts, colors, or layouts beyond preserving existing UI behavior during component extraction.
- Do not create broad utility bags or generic framework abstractions.
- Do not add permanent old/new duplicate implementations.
- Do not optimize by dropping data currently required by live UI, saved-run diagnostics, headless analysis, inspection, persistence, or tests.
- Do not treat shorter files as success if responsibilities remain mixed.

## Architecture Gates

These gates apply to every milestone.

- Functional parity is mandatory. Any moved diagnostics, recorder, repository, UI, or runtime-adjacent behavior must be covered by characterization tests or golden output.
- Prefer domain-shaped helpers over generic utility modules.
- Keep server, frontend, headless, and runtime dependencies clean:
  - `src/sine` must not import server modules.
  - server modules must not import React/UI modules.
  - React components must not reach into simulation internals when existing DTOs already carry the data.
- Shared helpers should be added only where at least two call sites have identical semantics.
- Keep chart primitives cohesive. Do not scatter hover/grid/geometry behavior across unrelated modules.
- Keep run-analysis data contracts explicit at API/repository boundaries.
- Do not introduce abstractions that obscure SQL, tick ordering, lifecycle ordering, or persistence ownership.
- Hot-path cleanup must preserve deterministic ordering and exact outputs.
- `npm run check` must pass after each accepted milestone.
- `npm run test:sine` must pass after diagnostics, repository, recorder, or runtime-adjacent changes.
- `npm run build` must pass after UI or frontend API changes.

## Milestone 1: Guardrails And Focused Characterization

Goal: add enough protection to refactor safely without creating a large new test framework.

### 1. Add Server `.mjs` Syntax Coverage

Add a lightweight check that catches syntax errors in server `.mjs` files that are not covered by TypeScript.

Preferred shape:

- a small script under `scripts/`
- or an extension of an existing check command if it stays simple

Exit gates:

- The check parses or imports relevant `server/*.mjs` files without starting the HTTP server.
- The check does not mutate SQLite DB state.
- The check is documented in the plan/report for this milestone.
- The check catches duplicate declarations or malformed module syntax in server files.
- `npm run check` still passes.

### 2. Add Diagnostics Golden Fixtures

Add focused characterization coverage for saved-run diagnostics before moving diagnostics math or UI wiring.

Required areas:

- population diagnostics
- death-cause diagnostics
- trading diagnostics
- risk/tail metrics
- population structure
- filtered tick ranges
- empty/no-trade/no-death cases

Exit gates:

- Fixture input produces stable expected diagnostics output.
- Tests assert representative metric values, not only object presence.
- Tests cover at least one non-zero filtered tick range.
- Empty/no-trade/no-death inputs produce finite, UI-safe outputs.
- Existing diagnostics API response shapes remain unchanged.

### 3. Strengthen Existing Headless Recorder Characterization

Use the existing headless test surface rather than creating a parallel recorder test framework.

Required recorder seams:

- birth events
- reproduction events
- death events
- eligibility threshold
- trade buffering before eligibility
- snapshot writes
- final flush behavior

Exit gates:

- A fixed event stream produces identical `runs`, `events`, `trades`, `snapshots`, `eligibility`, `checkpoints`, and completion records before and after recorder extraction.
- Ineligible agents remain buffered or dropped exactly as before.
- Eligible agents write the same records as before.
- Sink call ordering is asserted where ordering is part of the contract.
- No production recorder code is refactored before these tests are in place.

## Milestone 1 Exit Gates

- Production behavior is unchanged.
- Server `.mjs` syntax coverage exists.
- Diagnostics golden fixtures cover the formulas most likely to drift.
- Headless recorder seams are characterized through existing test infrastructure.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 2: Diagnostics UI Toolkit Cleanup

Goal: split the broad diagnostics UI helper into cohesive frontend modules while preserving current visual behavior.

Current target:

- `src/sine/history/RunDiagnosticsUi.tsx`

### 1. Split Generic Mini Chart Components

Move mini chart primitives into a focused module, for example:

- `src/sine/history/MiniCharts.tsx`

Keep together:

- `MiniCompositeChart`
- `MiniSeriesChart`
- `MultiSeriesChart`
- chart hover behavior
- SVG gridline behavior
- chart legend behavior
- chart path/bar helpers

Exit gates:

- All existing mini chart call sites still compile.
- Death causes, population drawdown, cumulative payoff, drawdown, bucket hit rate, and bucket average payoff render with the same rows and readouts.
- Hover readouts continue to update from the nearest chart point.
- Gridlines remain visible.
- No panel-specific diagnostics calculations move into chart components.

### 2. Split Panel And Distribution Primitives

Move non-chart UI primitives into focused modules, for example:

- `src/sine/history/DiagnosticsPanel.tsx`
- `src/sine/history/DistributionViews.tsx`
- `src/sine/history/diagnosticFormatters.ts`

Candidate exports:

- `DiagnosticsPanel`
- `BreakdownTable`
- `EventTimeline`
- `HistogramBars`
- `formatNumber`
- `formatPercent`

Exit gates:

- Existing imports are updated without creating barrel cycles.
- Formatting behavior remains unchanged.
- Histogram bars render the same labels/counts.
- Event timelines render the same births/deaths/reproductions values.
- No duplicated formatter or histogram component remains in history panels.

### 3. Verify UI Behavior

Run targeted UI verification for the SQLite Run Browser diagnostics panels.

Exit gates:

- Playwright or existing UI smoke verification confirms diagnostics panels render.
- Chart hover behavior works after extraction.
- Help tooltip rendering is unaffected.
- Desktop layout remains readable.
- `npm run build` passes.

## Milestone 2 Exit Gates

- `RunDiagnosticsUi.tsx` no longer mixes chart toolkit, panel toolkit, distribution views, and formatting.
- Generic chart behavior has one implementation.
- Saved-run diagnostics UI remains visually and behaviorally equivalent.
- No API, DB, or simulation changes are introduced.
- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.

## Milestone 3: Server Diagnostics And Run-Analysis Consolidation

Goal: reduce repeated server-side diagnostics and run-analysis work without hiding domain logic behind vague utilities.

Milestone 1 added diagnostics golden fixtures. Treat those fixtures as the primary parity gate for any diagnostics-helper extraction in this milestone.

Current targets:

- `server/sineDiagnosticsMath.mjs`
- `server/sineRunDiagnostics.mjs`
- `server/sineTradeQuality.mjs`
- `server/sineCohortDiagnostics.mjs`
- `server/sineHeadlessUnifiedFacts.mjs`
- `server/sineHeadlessUnifiedReadRepository.mjs`
- `server/sineHistoricalContext.mjs`

### 1. Add Domain-Specific Diagnostics Helpers Only Where Reused

Extend shared diagnostics math with narrow helpers only where at least two modules have identical semantics.

Candidate helpers:

- fixed tick bucket creation
- bucket start/end shaping
- payoff aggregation rows
- histogram bin constants where bins are shared
- downsample wrapper if semantics are identical

Exit gates:

- Each new helper has at least two real call sites or is not added.
- Existing metric values remain unchanged under diagnostics golden fixtures.
- The Milestone 1 run-diagnostics golden tests pass without relaxed assertions.
- Existing histogram labels and bucket boundaries remain unchanged.
- No generic utility-bag module is introduced.
- `sineDiagnosticsMath.mjs` remains small and domain-readable.

### 2. Consolidate Repeated Run-Facts Preparation Carefully

Introduce a reusable run-analysis context/facts factory only where it removes repeated work without creating a new orchestration blob.

Preferred scope:

- keep current repository method APIs stable
- allow a caller or composed endpoint to reuse one loaded facts object when multiple derived views are requested
- avoid forcing all independent routes through a new dashboard-specific abstraction

Exit gates:

- Existing headless read methods return the same response shapes.
- Existing routes remain compatible.
- A shared facts/context object can be reused by multiple derived reads in one backend flow.
- Single-purpose routes do not become more complex.
- No additional DB writes or schema changes are introduced.

### 3. Separate Historical Row Parsing From Range Shaping If It Reduces Coupling

Refactor `sineHistoricalContext.mjs` only where the separation is clear and small.

Possible split:

- row normalization/parsing
- range/window shaping
- analysis context assembly

Exit gates:

- Historical analysis for the same session/range returns the same context values.
- Tick-range filters still include/exclude the same records.
- Source timestamp/datetime fields remain unchanged.
- Saved-run diagnostics and cohort analysis continue to use the same context semantics.
- No frontend API shape changes are introduced.

## Milestone 3 Exit Gates

- Repeated diagnostics aggregation logic is reduced.
- Shared helpers are domain-specific and demonstrably reused.
- Headless read analysis can avoid repeated facts loading where a flow needs multiple derived views.
- Existing saved-run and headless analysis responses remain functionally equivalent.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 4: Headless Recorder Cleanup And Conservative Runtime Boundary Cleanup

Goal: make headless recording easier to extend for future backtesting/seed-bank work, while touching the simulation core only where it removes clutter safely.

Milestone 1 characterized current recorder behavior, including the current metrics-write behavior when a resolve event crosses the eligibility threshold. Preserve that behavior unless a separate behavior-change pass explicitly changes it.

Current targets:

- `src/sine/headless/recorder.ts`
- `src/sine/spawner/world.ts`

Milestone 3 kept diagnostics helpers and headless analysis context on the server/read side. Do not reuse those read-side modules in the headless runtime recorder; recorder cleanup should stay in `src/sine/headless/` and should only coordinate runtime events and sink writes.

### 1. Extract Agent Accumulator State

Move headless agent accumulator fields and state transitions into a focused module, for example:

- `src/sine/headless/agentAccumulator.ts`

Exit gates:

- Agent birth, death, reproduction, trade, and metric accumulation values remain unchanged.
- The current eligibility-crossing metrics write behavior remains unchanged.
- Accumulator state remains private to headless recording.
- No sink writes move into the accumulator module.
- Extracted runtime modules do not import server diagnostics, server read repositories, or saved-run analysis code.
- Existing headless tests pass without relaxed assertions.

### 2. Extract Eligibility And Buffering Policy

Move eligibility threshold and pre-eligibility buffering logic into a focused module, for example:

- `src/sine/headless/eligibilityBuffer.ts`

Exit gates:

- Agents become eligible on the same tick as before.
- Buffered events/trades/snapshots are flushed or dropped exactly as before.
- Minimum resolved-trade behavior remains unchanged.
- The Milestone 1 manual recorder lifecycle characterization passes without relaxed assertions.
- Sink write ordering remains unchanged where currently observable.

### 3. Keep `createHeadlessRecorder()` As The Public Facade

Preserve the current public recorder API and use extracted modules internally.

Exit gates:

- `createHeadlessRecorder()` call sites do not need behavioral changes.
- `runner.ts` continues to create and use the recorder the same way.
- The recorder facade remains the only module coordinating sink writes.
- Recorder modules remain runtime/sink-facing; server read-side analysis context remains separate.
- No duplicate old/new recorder implementations remain.

### 4. Extract Runtime Instrumentation Helpers Only If Low Risk

Review `world.ts` for phase timing and trace-materialization clutter. Extract only helpers that preserve the tick pipeline’s readability.

Exit gates:

- `world.ts` still clearly shows the simulation phase order.
- Tick ordering, liveness checks, brain evaluation, spawning, reproduction, food resolution, death pruning, and telemetry behavior are unchanged.
- Runtime helpers do not import UI, server, or persistence modules.
- Exact parity tests pass.
- If extraction makes the lifecycle harder to read, leave this step unimplemented and document why.

## Milestone 4 Exit Gates

- Headless recorder responsibilities are separated without changing its public contract.
- Recorder characterization tests prove output parity.
- Simulation-loop cleanup, if performed, preserves exact parity.
- No DB schema, API shape, or UI behavior changes are introduced.
- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.

## Final Verification

Run full verification after the final accepted milestone.

Required checks:

```bash
npm run check
npm run test:sine
npm run build
```

Additional targeted checks:

- server `.mjs` syntax guard through `npm run check`
- SQLite Run Browser diagnostics UI smoke/Playwright check after UI extraction
- headless recorder characterization tests
- diagnostics golden fixture tests
- headless reusable analysis context parity check

Final exit gates:

- Full verification passes.
- No simulation parity tests change.
- No saved-run diagnostics values change except through explicitly approved changes, which are out of scope for this plan.
- No persistence schema changes are introduced.
- No permanent duplicate implementations remain.
- Remaining long files are long because they are cohesive, not because unrelated responsibilities are mixed.
