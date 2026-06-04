# Sine Follow-On Simplification Audit Plan

This plan addresses the high-value and medium-value simplification targets identified in the latest Sine audit. The goal is to keep the Sine module easier to reason about while preserving functional parity. This is not a file-size reduction pass. The target is duplicated behavior, repeated field lists, unnecessary repeated scans, mixed responsibilities, and data-contract drift.

The plan is split into six milestones:

- Milestone 0: characterization and guardrails
- Milestone 1: low-risk UI, storage, and server utility consolidation
- Milestone 2: runtime-adjacent repeated-work removal
- Milestone 3: descriptor-driven trait/profile cleanup
- Milestone 4: unified run-analysis source model (deferred pending DB/write-model decision)
- Milestone 5: shared run-analysis UI and headless capability panels (deferred pending DB/write-model decision)

## Non-Goals

- Do not change simulation behavior, reward/payoff logic, transaction-cost handling, reproduction rules, death rules, mutation semantics, learning semantics, market inputs, brain evaluation results, strategy-map semantics, uniqueness scoring, or persistence schemas.
- Do not rename Sine/module paths in this plan.
- Do not refactor Ant World.
- Do not create a generic framework shared by Ant and Sine.
- Do not introduce broad abstractions where small domain helpers are clearer.
- Do not keep old and new implementations as permanent parallel paths.
- Do not optimize by dropping data currently required by live UI, saved-run diagnostics, headless analysis, inspection, persistence, or tests.
- Do not treat shorter files as success if responsibilities remain mixed.
- Do not reshape the Lab or headless SQLite schemas merely to make frontend querying easier. Normalize source-specific tables at the server/API boundary unless a later data-retention requirement proves a schema change is needed. Non-semantic indexes are allowed only if measured query behavior shows they are needed and they do not change persistence meaning.

## Architecture Gates

These gates apply to every milestone.

- Functional parity comes first. Any step touching runtime, packet, trait/profile, server diagnostics, or headless API behavior must be covered by before/after tests.
- Shared helpers should be domain-shaped and narrow. Prefer `MiniSeriesChart`, `patchSettingsGroup`, `groupStrategyMapPointsByCluster`, or `perceptionFieldDescriptors` over vague utility modules.
- Runtime helpers must not import React, browser-only APIs, server repositories, or persistence clients.
- UI helpers must not reach into simulation internals when an existing DTO already carries the needed data.
- Data-contract boundaries should stay explicit. If client and server cannot share a type cleanly, add a contract test rather than forcing coupling.
- Hot-path changes should reduce repeated scans or allocations without changing deterministic ordering.
- Descriptor-driven refactors must preserve field order, defaults, bounds, labels, cache-key order, mutation behavior, and formatting.
- Descriptor tables must preserve explicit source order. Do not derive parity-sensitive ordering from generic object-key iteration, auto-sorting, or grouped display order.
- Verification should include `npm run check`, `npm run test:sine`, and targeted browser/Playwright smoke checks for UI/chart changes.

## Milestone 0: Characterization And Audit Baseline

Goal: lock down behavior before moving duplicated logic. This milestone should not change production behavior.

### 1. Capture Current Duplication Targets

Document the exact source locations and ownership boundaries for the target areas:

- diagnostics SVG chart duplication
- Lab/Runs settings storage patch duplication
- server repository JSON utility duplication
- strategy-map repeated cluster scans
- compact brain payload repeated genome lookups
- selected-spawner timeline runtime lookup
- perception trait field-list repetition
- mutation profile field-list repetition
- headless analysis mixed UI/data responsibilities
- headless API/server sort-key drift

Exit gates:

- The target list includes concrete file paths and current owning modules.
- Each target is classified as UI-only, storage-only, server-only, runtime-adjacent, or core-evolutionary.
- Each target records whether it can change runtime speed, code clarity only, or both.
- No production code behavior changes in this step.

### 2. Add Or Verify Characterization Tests

Before implementation, verify that existing tests cover the behavior most likely to drift.

Required coverage:

- strategy-map point/cluster identity, percentiles, summaries, and full golden output for representative populations
- compact brain evaluation parity for object and compact paths
- perception sanitize, exact mutate output, cache-key order/output, summary output, and detail-row order/formatting
- mutation profile sanitize, exact drift output, summary output, and detail-group order/formatting
- settings load/save behavior for Lab and Runs defaults, including grouped key patching
- headless sort keys accepted by the server

Exit gates:

- `npm run test:sine` includes coverage for all high-risk behavior listed above.
- Any missing coverage is added before refactoring the corresponding module.
- Tests assert values and ordering, not only object presence.
- Descriptor candidates have golden tests for field order and cache-key order before conversion.
- Perception and mutation-profile tests lock exact RNG call order by asserting exact mutated/drifted objects for fixed seeds.
- Strategy-map tests include at least one full output comparison for a representative non-degenerate population before optimizing cluster grouping.
- Settings tests cover each grouped save helper that will be refactored: Lab market, Lab playback, Runs market, Runs playback, and Runs spawner config.

### 3. Record Small Perf Baselines

Capture enough timing to detect regressions in runtime-adjacent changes.

Suggested baselines:

- strategy-map computation timing at representative population sizes
- compact brain payload build timing for representative genomes
- browser/live worker smoke timing if already available
- selected-spawner timeline sampling behavior under large population

Exit gates:

- Baseline commands, seeds/settings, and population sizes are recorded in the milestone notes or report.
- Timing separates strategy-map work from full simulation where practical.
- Timing separates compact payload construction from full brain evaluation where practical.
- No benchmark result is treated as a functional-parity gate.

## Milestone 0 Exit Gates

- Production behavior is unchanged.
- Target scope and module ownership are documented.
- `npm run check` passes.
- `npm run test:sine` passes.
- Later milestones have enough tests to detect behavior drift.

## Milestone 1: Low-Risk UI, Storage, And Server Consolidation

Goal: remove duplicated non-runtime logic first. These changes should reduce maintenance burden without touching simulation decisions.

### 1. Generalize Saved-Run SVG Mini Chart Primitives

Extend the diagnostics mini-chart primitives in `src/sine/history/RunDiagnosticsUi.tsx` so the cohort timeline chart can reuse shared geometry, grid, hover, and path behavior.

The new primitive may support:

- configurable width/height
- one or more line series
- optional bars
- shared hover readout
- existing help tooltip behavior

Exit gates:

- `RunCohortPerformancePanel` no longer reimplements chart geometry, hover indexing, gridlines, or line-path construction.
- Existing diagnostics mini charts render the same labels, gridlines, hover markers, and readouts.
- The cohort timeline still shows trade bars, cumulative payoff, hover tick range, trade count, hit rate, and payoff.
- Empty cohort states remain unchanged.
- Targeted browser/Playwright smoke check confirms no clipped labels, blank charts, or hover-target regressions.

### 2. Add A Settings Patch Helper

Create a focused settings helper in `src/sine/jsonStorage.ts` or a nearby storage helper module for the repeated pattern:

`load current -> patch selected keys -> sanitize -> save -> return selected branch`

Use it for Lab market/playback settings and Runs market/playback/spawner settings while keeping separate storage keys and sanitizers.

Exit gates:

- `settingsStorage.ts` and `runsSettingsStorage.ts` no longer duplicate key-patching loops for equivalent behavior.
- Lab defaults and Runs defaults remain separate.
- The exact flow remains `load current -> patch selected keys -> sanitize whole settings object -> save`.
- Legacy generated-market settings migration behavior remains unchanged.
- Saved Runs “restore lab settings” still restores the current saved Lab settings, not hardcoded defaults.
- Tests prove each grouped save helper patches only requested keys and preserves unrelated saved keys.
- Tests distinguish patch-preservation behavior from sanitizer clamp behavior, so in-range patch tests do not accidentally depend on clamping.
- Tests cover Lab market settings, Lab playback settings, Runs market settings, Runs playback settings, and Runs spawner config.
- Existing settings tests pass without relaxing assertions.

### 3. Consolidate Server JSON Repository Utilities

Move duplicate server JSON parse/stringify helpers into one small server utility module.

The live saved-run and headless helpers currently have different fallback semantics. Preserve those semantics with configurable shared primitives rather than forcing both repositories into one identical `parseJson()` behavior.

Exit gates:

- `server/sineRepositoryUtils.mjs` and `server/sineHeadlessRepositoryUtils.mjs` no longer define duplicate JSON parse/stringify behavior.
- Live saved-run parsing still preserves its existing fallback semantics.
- Headless parsing still preserves its existing fallback/null semantics.
- Non-string live saved-run values continue to be handled as they are today.
- Invalid headless JSON continues to fall back as it does today.
- No repository route or DB schema changes are introduced.
- Saved-run and headless persistence tests pass.

### 4. Keep Canvas Grid Consolidation Scoped

Review `src/sine/charts/canvas.ts` and `src/sine/charts/chartFrame.ts` for duplicate grid helpers. Consolidate only identical behavior; leave distinct chart-frame semantics separate.

Exit gates:

- Identical grid drawing code is defined once.
- Chart frame labels, right/left label behavior, and faint market-time gridlines remain unchanged.
- Signal, BTC price, noise, parameter, trading performance, strategy map, and telemetry charts still render.
- Browser/Playwright smoke check covers the main Lab charts.

## Milestone 1 Exit Gates

- UI/storage/server consolidation is complete without changing simulation behavior.
- `npm run check` passes.
- `npm run test:sine` passes.
- Targeted browser/Playwright smoke checks pass for diagnostics charts and Lab charts.
- No new generic UI/storage framework is introduced.

## Milestone 2: Runtime-Adjacent Repeated-Work Removal

Goal: remove avoidable scans and lookups in semi-hot runtime paths while preserving exact output.

Milestone 0 timing makes strategy-map compute the highest-value performance target in this milestone. Compact brain payload construction is measurable but secondary. Selected-spawner timeline cleanup is primarily an ownership/readability improvement, because baseline sampling cost is already very small.

### 1. Group Strategy-Map Points Once

Refactor `src/sine/spawner/strategyMap.ts` so cluster summaries and within-cluster percentiles use one grouped representation instead of repeatedly filtering `points`.

Suggested structure:

- build `pointsByClusterId` once
- compute projected cluster centroids/radii from grouped members
- compute cluster-distance percentile lists from grouped members
- preserve current point and cluster packet shape

Exit gates:

- Every strategy-map point has the same `spawnerId`, `x`, `y`, `clusterId`, `clusterDistance`, `clusterPercentile`, energy, generation, lineage, hit rate, average payoff, and resolved count as before.
- Every cluster has the same id, size, projected centroid, radius, average payoff, hit rate, average generation, and dominant lineage as before.
- Strategy-map tests cover normal, tiny, degenerate, and multi-cluster populations.
- A representative golden strategy-map output remains exactly unchanged before and after the grouping refactor.
- Repeated `points.filter(...)` passes for cluster membership are removed.
- Timing at representative population sizes compares full strategy-map compute before and after the refactor.
- If full strategy-map timing does not materially improve, the result is recorded and no extra speculative strategy-map abstractions are added in this milestone.

### 2. Use Indexed Genome Access In Compact Brain Payloads

Refactor `compactGenomePayload` and related compact learned-state payload construction to avoid repeated `find` calls over `genome.units` and `genome.connections`.

Preferred approach:

- reuse the existing plan-aligned indexing pattern from `CompiledBrainPlan` and `effectiveGenome.ts` where possible
- avoid adding a separate genome-index abstraction unless the existing plan indexes cannot express the needed lookup
- if local maps are required, build them once per payload and keep them local to compact payload construction

Exit gates:

- Compact brain evaluation object-path and compact-path parity tests still match exactly.
- Base connection weights, output biases, gate biases, learned deltas, hidden state arrays, outputs, and activation materialization remain unchanged.
- Genome/plan cache signatures remain unchanged.
- No new process-lifetime unbounded cache is introduced.
- Payload construction no longer performs repeated linear lookups for each unit/connection field.
- The implementation reuses `CompiledBrainPlan` indexes or the existing plan-aligned effective-value pattern instead of creating a redundant long-lived index layer.
- Timing compares payload construction before and after, but no large speedup is assumed as an exit gate.
- Brain/worker tests pass.

### 3. Reuse Spawner Runtime Index For Selected Timeline Sampling

Update selected-spawner timeline sampling to use an existing per-tick or per-packet spawner index instead of scanning `world.spawners` with `.find(...)`.

The ownership point should be `src/sine/worker/packetRuntimeContext.ts`, which already caches packet-scoped food indexes and selected timeline data. Add a packet-scoped `getSpawnerIndex()` there and pass it into the selected timeline service.

Milestone 0 showed this path is already cheap, so keep this refactor narrow and do not add new lifecycle or cache machinery for it.

Exit gates:

- Selected-agent timeline still reports alive/missing status correctly.
- Samples retain the same rolling hit rate, rolling average payoff, rolling loss, energy, health, open trades, action mix, and learned delta norm.
- Existing chart packet tests and selected-spawner timeline tests pass.
- `packetRuntimeContext.ts` owns the packet-scoped spawner index.
- The timeline service does not build its own redundant index when a packet runtime index is already available.
- Missing selected-agent behavior remains unchanged.
- Any timing notes frame this as a cleanup/ownership change, not a primary runtime-speed improvement.

### 4. Avoid Repeated Action-Window Filters

Refactor selected-spawner action-rate calculation to maintain rolling counts instead of filtering the action window three times per sample.

Keep this local and simple. The goal is to remove repeated work without changing timeline semantics, not to introduce a general rolling-window framework.

Exit gates:

- `longRate`, `shortRate`, and `waitRate` match current behavior for the same action sequence.
- Window trimming preserves the existing sample limit and order.
- Tests cover window fill, trim, and selected-agent reset behavior.
- The code remains local to the selected-spawner timeline service or a small bounded-window helper.
- Baseline sampling cost remains low and no unexplained slowdown is introduced.

## Milestone 2 Exit Gates

- Runtime-adjacent changes preserve all DTO shapes and values.
- `npm run check` passes.
- `npm run test:sine` passes.
- Perf notes compare pre/post strategy-map and compact payload timing.
- No runtime caches are introduced without explicit lifetime and reset behavior.

## Milestone 3: Descriptor-Driven Trait And Profile Cleanup

Goal: reduce repeated mutable-trait field lists while preserving evolutionary behavior exactly.

Milestone 2 showed that removing duplicated summary-layer work can improve code shape without improving top-level runtime timing. Treat this milestone as a functional-parity and maintainability cleanup, not a performance milestone.

Amended after Milestone 3: descriptor tables were useful for the repeated scalar perception and mutation-profile field lists, but only because golden tests already locked order, formatting, and fixed-seed mutation/drift output. Keep config-to-domain default mapping explicit when it reflects aliases or non-uniform source fields, and do not extend the descriptor pattern to adjacent profile modules unless they have the same repeated-list problem and comparable parity coverage.

### 1. Introduce Perception Field Descriptors

Create a descriptor table for scalar perception fields in `src/sine/spawner/perception.ts`.

Milestone 0 golden tests now lock cache-key order, detail-row order/formatting, summary values, and fixed-seed mutation output. Treat descriptor order as part of the behavior.

Each descriptor should encode:

- key
- label
- fallback
- sanitizer kind and minimum behavior
- mutation stddev group
- cache-key participation
- summary/window participation where applicable
- detail-row formatting

Keep `deltaLagPairs` separate unless a descriptor improves clarity without obscuring pair-specific behavior.

Exit gates:

- `sanitizePerception` returns exactly the same values for characterized valid, missing, invalid, and boundary inputs.
- `mutatePerception` applies the same mutation chance and stddev family to each field as before.
- `mutatePerception` consumes RNG calls in the same order as before for fixed seeds.
- `perceptionCacheKey` field order and output are unchanged.
- `summarizePerception` average lag, longest window, and pending density scale are unchanged.
- `perceptionDetailRows` labels, order, and formatting are unchanged.
- Adding a new scalar perception trait would require adding one descriptor, not editing five independent field lists.
- Descriptor iteration order is explicit and matches the current golden tests.

### 2. Convert Perception Helpers To Use Descriptors

Refactor sanitize, mutate, cache-key, summary, and detail-row helpers to consume the descriptor table.

Exit gates:

- No duplicate scalar perception field list remains outside the descriptor table, except where a function intentionally handles a subset such as longest-window fields.
- Descriptor subset definitions are explicit, colocated with the descriptor table, and derived from descriptor metadata where practical.
- Perception defaults loaded from config may remain explicit when they map config field names to domain fields rather than repeating helper behavior.
- Existing market input, uniqueness vector, selected-agent panel, Help metadata, and mutation tests pass.
- No runtime behavior changes occur for founders, inheritance, mutation, or inspection.

### 3. Introduce Mutation Profile Descriptors

Create a descriptor table for mutation profile fields only after perception descriptor parity is proven.

Milestone 0 golden tests now lock detail-group order/formatting, summary output, and fixed-seed drift output. Treat group order and drift order as behavior.

Each descriptor should encode:

- key
- label
- group
- fallback
- sanitizer kind: probability or stddev
- detail-row formatter
- whether it participates in profile drift

Exit gates:

- `sanitizeMutationProfile` returns exactly the same values for characterized inputs.
- `driftMutationProfile` mutates the same fields with the same drift value and RNG call order as before.
- `summarizeMutationProfile` topology, weight, bias, perception, payoff-scale, trading-policy, and profile-drift metrics remain unchanged.
- `mutationProfileDetailGroups` labels, grouping, order, and formatting are unchanged.
- Mutation-profile defaults loaded from config may remain explicit where they map non-uniform config fields into profile fields.
- Fixed-seed golden tests prove exact drift output parity before and after descriptor conversion.
- Genome mutation tests pass.
- Descriptor iteration order is explicit and matches the current golden tests.

### 4. Avoid Over-Generalizing Other Profiles

Review payoff profile, trading policy, and plasticity profile code after the perception/mutation conversions. Only convert them if there is the same repeated-field problem and parity coverage is strong.

Exit gates:

- The plan records whether each adjacent profile should remain explicit or move to descriptors later.
- No broad “profile framework” is introduced.
- Adjacent profile behavior remains unchanged.
- Tests remain readable and behavior-focused.
- Payoff profile, trading policy, and plasticity remain explicit in this plan unless a separate parity-backed refactor proves a descriptor table would remove real duplication rather than add framework weight.

## Milestone 3 Exit Gates

- Perception and mutation profile field duplication is reduced without behavior drift.
- `npm run check` passes.
- `npm run test:sine` passes.
- Descriptor tables are small, typed, and owned by the domain modules they describe.
- No mutation, inheritance, founder, uniqueness, or inspection behavior changes.
- Any retained explicit profile/config mapping has a documented reason and is not a second implementation of descriptor-driven helper behavior.

## Milestone 4: Unified Run-Analysis Source Model

Status: deferred pending DB/write-model benchmark and architecture decision.

Goal: make saved Lab runs and headless runs feed one shared analysis contract without forcing their SQLite schemas to match.

The current Lab saved-run browser already has the richer shared diagnostics UI: run health, resilience, death causes, trading performance, risk/tail metrics, trade quality, cohort/regime analysis, population structure, range filters, and comparison mode. Headless runs have a different persistence model with richer agent-level records, checkpoints, exact continuation snapshots, and per-agent metrics. Preserve those storage shapes and normalize them at the repository/API boundary.

### 1. Define The Unified Analysis Contract

Create a source-aware run-analysis DTO in the Sine history/headless boundary.

The DTO should describe:

- source: `lab` or `headless`
- run identity and metadata
- shared diagnostics payload compatible with `RunDiagnosticsDashboard`
- optional comparison target metadata
- capabilities flags, such as `hasUniquenessSnapshots`, `hasAgentMetrics`, `hasExactContinuationSnapshots`, `hasRunCheckpoints`, `hasEligibleAgentFiltering`, and `hasSourceTimestamps`
- trade-scope and coverage metadata, such as whether trade/risk/cohort metrics use all persisted resolved trades or only headless eligible persisted trades
- source-specific extension slots for data that is not common to both sources

Exit gates:

- The common diagnostics shape is the same shape the current SQLite Run Browser panels already consume, or a strictly compatible refinement.
- Capability flags are explicit and typed; UI code does not infer capabilities from source string checks alone.
- Trade scope and coverage are explicit for both sources; headless metrics that use eligible persisted trades are not presented as full-population trade metrics.
- The DTO does not expose raw DB table rows to the frontend.
- Lab-only uniqueness data and headless-only agent/checkpoint/snapshot data are represented as optional capabilities, not forced into fake common fields.
- Existing `SineSessionAnalysis` users compile after import-path or type-name updates.

### 2. Keep DB Schemas Source-Specific

Document and preserve the current storage boundary:

- Lab saved runs continue to use `sine_*` tables in `toy-market.sqlite`.
- Headless runs continue to use `sine_headless_*` tables in `sine-headless.sqlite`.
- No table rename, migration, or mirror-copy layer is introduced in this milestone.

Exit gates:

- No migration changes are made to `server/sineDb.mjs` or `server/sineHeadlessDb.mjs` except comments, read-only helper additions, or measured non-semantic indexes if needed.
- Lab persistence packets remain unchanged.
- Headless recorder/write-sink records remain unchanged.
- Existing saved Lab runs and existing completed headless runs still open.
- Any added index is justified by a concrete query path and does not alter stored rows, DTO semantics, or existing tests.
- Any future schema-alignment idea is documented as a separate data-retention decision, not part of this simplification plan.

### 3. Add Source-Specific Analysis Context Adapters

Create two adapters that build the shared diagnostics inputs from their own tables:

- Lab adapter: reuse `createHistoricalAnalysisContext(sessionId, rangeInput)`.
- Headless adapter: build an equivalent historical context from `sine_headless_agents`, `sine_headless_agent_events`, `sine_headless_agent_trades`, and run metadata.

Both adapters should feed the existing diagnostics builders where possible.

Exit gates:

- Shared diagnostics math remains in `sineRunDiagnostics.mjs`, `sineTradeQuality.mjs`, `sineCohortDiagnostics.mjs`, and related helpers; it is not duplicated for headless.
- Headless resolved trades map to the same fields used by Lab diagnostics: tick, spawn/resolve tick, spawner id, lineage id, payoff, win/loss status, direction, strength, horizon, entry/exit signal, price, and timestamps when available.
- Headless births/deaths map to the same fields used by Lab population, age, and death-cause diagnostics.
- Headless death causes are parsed from death event JSON when present and fall back to `unknown` only when the cause is absent or invalid.
- Headless trade diagnostics include coverage fields that compare persisted eligible trades with run/checkpoint resolved-trade counts when those counts are available.
- Range filtering with `fromPercent` and `toPercent` has the same semantics for Lab and headless.
- Tests cover one Lab fixture and one headless fixture producing finite shared diagnostics.
- Tests cover headless death-cause parsing and the eligible-trade coverage readout.

### 4. Add Unified Run-Analysis API Routes

Add API routes that let the frontend ask for run analysis by source instead of table family.

Suggested route shape:

- `GET /api/sine/run-analysis/runs?source=lab|headless`
- `GET /api/sine/run-analysis/:source/:id?fromPercent=0&toPercent=100`
- `GET /api/sine/run-analysis/:source/:id/cohort?...`

Keep existing Lab and headless routes working during this milestone to avoid a UI cutover cliff.

Exit gates:

- Listing runs returns both source identity and enough metadata for display without the frontend making source-specific list calls.
- Fetching Lab analysis through the new route matches the existing SQLite Run Browser analysis for the same run/range.
- Fetching headless analysis through the new route returns the shared diagnostics plus headless capability flags.
- Fetching headless analysis returns trade-scope and coverage metadata whenever eligible persisted trades may differ from total resolved trades.
- Unknown source, missing run id, invalid range, and missing run return stable error responses.
- Existing `/api/sine/sessions` and `/api/sine/headless/...` routes continue to pass tests.

### 5. Preserve And Extend Contract Tests

Replace the old “headless sort-key only” Milestone 4 emphasis with source-contract coverage.

Tests should cover:

- Lab analysis route parity with existing saved-run analysis.
- Headless analysis route can derive common diagnostics from headless tables.
- Capability flags are present and accurate for both sources.
- Trade-scope and coverage fields are present and accurate for Lab and headless fixtures.
- Headless death-cause diagnostics use parsed event causes when available and label missing causes as unknown.
- Headless sort-key contracts remain covered for any still-existing headless-specific leaderboard endpoints.
- Existing comparison/range/cohort behavior remains stable for Lab runs.

Exit gates:

- Tests fail if a unified analysis route drops a required shared diagnostics section.
- Tests fail if a capability flag is omitted or mislabeled for a fixture.
- Tests fail if headless eligible persisted trade scope is mislabeled as full-population scope.
- Tests fail if a new headless sort key is added without server support.
- No broad server module is converted to TypeScript just to share route constants.
- `npm run test:sine` passes.

## Milestone 4 Exit Gates

- Lab and headless runs can both be represented by a shared run-analysis DTO.
- The Lab and headless SQLite schemas remain source-specific and unchanged.
- Shared diagnostics math is reused rather than forked.
- Trade/risk/cohort diagnostics disclose whether they are full-run or eligible-persisted trade scope.
- Headless death causes are derived accurately where the existing event data supports them.
- Unified analysis routes are covered by contract tests.
- Existing Lab saved-run analysis and existing headless run-launch/read routes retain functional parity.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 5: Shared Run-Analysis UI And Headless Capability Panels

Status: deferred pending DB/write-model benchmark and architecture decision.

Goal: move the SQLite Run Browser out of the Lab tab into a standalone Run Analysis surface, reuse it for both Lab and headless runs, and keep headless-only richness as capability-gated additions rather than a separate analysis UI.

### 1. Move The Run Browser Into Its Own Top-Level Surface

Create or reshape a top-level tab/page for run analysis. The current Lab SQLite Run Browser should no longer be embedded as a Lab-only panel.

Exit gates:

- The Lab tab keeps simulation controls, live charts, roster, selected-agent panel, and live inspection behavior.
- The run-analysis surface is reachable from the main Sine navigation.
- Existing saved Lab runs appear in the new run-analysis surface.
- Selecting a Lab run renders the same diagnostics panels that currently render in the SQLite Run Browser.
- No duplicate copy of the old Run Browser remains embedded in Lab after the cutover.

### 2. Reuse Existing Diagnostics Panels For Both Sources

Refactor the current diagnostics UI around `RunDiagnosticsDashboard`, `RunComparisonPanel`, and related history components so they consume the unified analysis DTO.

Exit gates:

- Run Health, Resilience, Death Causes, Population Drawdown, Trading Performance, Risk/Tail Profile, Trade Quality Distributions, Cohort Performance, Population Structure, range filters, and comparison mode still render for Lab runs.
- The same panel components render for headless runs when the shared diagnostics payload is available.
- Empty or unsupported panels render clear unavailable states based on capabilities, not source-name conditionals scattered through the UI.
- Trade/risk/cohort panels show concise trade-scope and coverage readouts when the selected source is not full-population comparable.
- Chart hover/readout/gridline behavior remains unchanged.
- Formatting helpers are reused from `RunDiagnosticsUi`/existing chart helpers rather than copied into headless components.

### 3. Preserve Existing Headless Analysis Tools In The Shared Surface

Keep headless run launching/progress controls in the Runs page, but move the completed-run analysis experience into the shared run-analysis surface. Preserve existing headless analysis features as capability-gated panels or tools instead of discarding them.

Existing headless features to preserve or re-home:

- eligible-agent leaderboard and filters
- lineage table and lineage filter
- lifecycle timeline
- eligible persisted trade breakdown
- selected-agent drawer
- selected-agent trade ledger
- birth/reproduction/death snapshots
- snapshot RNN architecture modal

Exit gates:

- Starting, cancelling, and monitoring a headless run still works.
- Completed headless runs link into or auto-load in the shared run-analysis surface.
- Headless progress/checkpoint display remains available during active runs.
- The old standalone headless analysis panels are removed or reduced to thin wrappers only after their functionality is available in the shared surface.
- The eligible-agent leaderboard, lineage table, lifecycle timeline, selected-agent drawer, trade ledger, snapshots, and RNN snapshot modal remain available for completed headless runs.
- No permanent old/new headless analysis implementations remain.

### 4. Add Capability-Gated Headless-Only Sections

Add only small, high-value headless-only panels needed to expose data Lab cannot currently derive.

Initial candidates:

- run checkpoints/progress trajectory
- eligible-agent coverage
- exact continuation snapshot availability
- agent metrics/snapshot counts
- selected-agent headless dossier entry points when exact snapshots and metrics exist

Defer richer seed-bank dossiers, exact reconstruction browsing, or market-regime embedding analysis unless separately planned.

Exit gates:

- Headless-only panels render only when the unified analysis capabilities say the data exists.
- Lab runs show concise unavailable states or omit those panels without layout breakage.
- Headless-only panels do not duplicate shared diagnostics already shown elsewhere.
- Headless-only panels preserve the existing `SineHeadlessAnalysis` user value before any old panel is deleted.
- Headless-only data is fetched through source-specific extension endpoints or extension fields, not by exposing raw table rows.
- Tests or smoke checks cover one Lab run and one headless run in the shared UI.

### 5. Preserve Historical And Snapshot RNN Inspection

Move inspection affordances with the run-analysis surface rather than leaving them tied to the Lab tab.

Exit gates:

- Lab saved runs still support historical RNN lookup by spawner id and optional tick.
- Headless completed runs still support opening an RNN architecture from a persisted snapshot.
- The shared UI labels unavailable inspection clearly when a source/capability does not support it.
- Inspection APIs remain source-specific where the data model differs; shared UI components call through a small source-aware facade.
- Existing Lab inspection tests and headless snapshot modal smoke coverage still pass.

### 6. Keep Source-Specific Details Out Of Shared Components

Review the shared UI after the move for source leakage.

Exit gates:

- Shared diagnostics components do not import `headlessApi`, `sineHistoryApi`, or DB-specific type names directly.
- Data-fetching hooks own source selection and request cancellation/staleness guards.
- Components receive typed DTO props and callbacks.
- Source-specific labels are centralized in one small helper or descriptor, not repeated across panels.
- Existing headless API DTO definitions remain easy to import for run-launch/progress code.

### 7. Guard Comparison Compatibility

Make comparison mode source-aware so it does not compare incompatible trade universes without warning.

Exit gates:

- Lab-vs-Lab comparison remains visually and behaviorally unchanged.
- Headless-vs-headless comparison shows coverage metadata when eligible persisted trade scope is active.
- Lab-vs-headless comparison either requires compatible trade scopes or displays a clear warning that trade/risk/cohort metrics are not directly equivalent.
- Comparison metric rows do not silently mix full-population and eligible-persisted trade scopes.
- Tests or smoke checks cover at least one incompatible-scope comparison state.

## Milestone 5 Exit Gates

- The run-analysis UI is a standalone surface, not a Lab-only panel.
- Lab saved-run diagnostics retain visual and behavioral parity with the existing SQLite Run Browser.
- Headless completed-run diagnostics use the same shared panel stack wherever data is common.
- Headless-only information appears through capability-gated additions, not a second analysis UI.
- Existing headless leaderboard, lineage, lifecycle, selected-agent, trade-ledger, snapshot, and RNN architecture inspection features are preserved.
- Lab historical RNN lookup remains available after the browser moves out of the Lab tab.
- Comparison mode does not silently compare incompatible trade scopes.
- Run-launch/progress behavior remains separate and functional.
- No duplicate diagnostics math, chart components, or formatting helpers are introduced.
- `npm run check` passes.
- `npm run test:sine` passes.
- Browser/Playwright smoke checks cover Lab run analysis, headless run analysis, comparison mode, range filters, and active headless run progress.

## Final Verification

Run the standard verification suite after all milestones:

- `npm run check`
- `npm run test:sine`
- `npm run build`
- targeted browser/Playwright smoke checks for diagnostics charts, Lab charts, unified run analysis, and headless run progress

Final exit gates:

- All milestone exit gates pass.
- Functional parity is preserved for simulation, mutation, learning, brain evaluation, uniqueness, strategy map output, saved-run diagnostics, headless analysis, settings storage, and UI interactions.
- Duplicated implementations identified in the audit are either consolidated or explicitly retained with a documented reason.
- No permanent compatibility wrappers or parallel old/new implementations remain.
- Lab and headless storage remain source-specific while frontend run analysis consumes one normalized source-aware DTO.
- Source-specific richer data is exposed through capabilities and extension panels, not by forking the diagnostics UI.
- Descriptor-driven cleanup does not create broad profile frameworks; retained explicit profile/config code is justified by simpler local ownership or non-uniform mapping semantics.
- Runtime-adjacent simplifications show no unexplained slowdown.
- If strategy-map speed becomes important later, investigate feature-space preparation, projection, and clustering directly; do not add more summary-layer abstractions based on Milestone 2 timing alone.
