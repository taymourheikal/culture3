# Sine Unified Run Database Plan

Goal: make `data/toy-market.sqlite` the single canonical Toy Market database for both Lab runs and Runs/headless runs.

Lab write behavior should remain functionally unchanged. Headless should adapt to the Lab core persistence model wherever possible, then write only lean headless-specific extension data for checkpoints, eligibility, and seed-bank reconstruction.

Existing trial data is disposable for this transition. No old-data migration is required.

## Non-Goals

- Do not change simulation behavior, reward/payoff logic, transaction-cost handling, reproduction, death, mutation, learning, market inputs, brain evaluation, or uniqueness scoring.
- Do not make Lab write richer headless-only data.
- Do not keep a separate `data/sine-headless.sqlite` write path.
- Do not preserve current trial DB contents.
- Do not store permanent derived agent metrics as primary data, such as hit rate, average payoff, Sharpe, Sortino, payoff standard deviation, long/short averages, average horizon, or average strength.
- Do not store full cloned headless lifecycle `event_json` blobs.
- Do not store duplicate full rich `snapshot_json` blobs when split reconstruction fields are sufficient.
- Do not introduce a broad generic persistence framework. Keep helpers domain-shaped and explicit.

## Architecture Gates

These gates apply to every milestone.

- `server/sineDb.mjs` remains the canonical Toy Market SQLite owner.
- Lab persistence continues to use the existing core `sine_*` tables and packet writer behavior.
- Headless core history writes into the same core `sine_*` tables.
- Headless extension tables are only for data that the Lab core tables do not cover.
- SQL remains in server repository/writer modules, not in React or simulation runtime.
- `src/sine` runtime modules must not import server modules.
- Shared helpers must be narrow and semantic, not utility dumping grounds.
- Derived metrics are computed from raw rows unless a later measured UI-performance need justifies a materialized summary.
- Functional parity is mandatory except for the intentional DB unification and removal of permanent derived headless metrics.

## Milestone 1: Unified Schema Foundation

Goal: extend the canonical Lab DB so it can represent Lab and headless runs without changing Lab behavior.

### 1. Extend `sine_sessions` Into A Unified Run Table

Add nullable/defaulted columns to `sine_sessions`, such as:

- `run_mode`: `lab` or `headless`
- `seed`
- `target_ticks`
- `checkpoint_interval_ticks`
- `minimum_resolved_trades`
- `completed_at`
- `termination_reason`
- `error`

Lab sessions should default to `run_mode = 'lab'`.

Exit gates:

- Lab-created sessions still save and load through existing code paths.
- Existing Lab queries continue to work when new columns are null/defaulted.
- Headless run metadata can be represented without a separate `sine_headless_runs` table.
- `listSineSessions()` exposes mode/source and tick metadata needed by the unified Run Browser.
- `getSineSessionAnalysis()` still returns the same diagnostics shape for Lab runs.

### 2. Add Lean Headless Extension Tables

Add only headless data that shared Lab tables do not cover:

- `sine_headless_run_checkpoints`
- `sine_headless_agent_eligibility`
- `sine_headless_reconstruction_snapshots`

`sine_headless_reconstruction_snapshots` should store split reconstruction fields:

- `session_id`
- `spawner_id`
- `lineage_id`
- `generation`
- `parent_spawner_id`
- `tick`
- `source_timestamp`
- `source_datetime`
- `reason`
- `schema_version`
- `genome_json`
- `hidden_state_json`
- `learned_state_json`

Do not store a duplicate full `snapshot_json` in this rich reconstruction table.

Exit gates:

- Extension rows reference `sine_sessions(id)` and cascade on run deletion.
- No new `sine_headless_agent_metrics` table is created.
- No extension table stores full cloned headless lifecycle `event_json`.
- Reconstruction snapshots contain enough data to recreate an eligible agent for seed-bank use.
- Lab save/load behavior remains unchanged.

## Milestone 1 Exit Gates

- `toy-market.sqlite` has one unified run/session table capable of representing both modes.
- Headless extension tables exist only for checkpoint, eligibility, and reconstruction data.
- Existing Lab diagnostics and historical inspection continue to work.
- No separate headless DB schema is required for new runs.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 2: Headless Core Persistence Adapter

Goal: make headless write shared core history through the Lab persistence model, while keeping rich reconstruction gated.

### 1. Build A Headless-To-Core Persistence Adapter

Create a server/headless adapter that writes Lab-style core persistence rows for headless runs.

Reuse existing code where semantics match:

- DTO builders in `src/sine/persistence/sinePersistenceDtos.ts`
- packet builders in `src/sine/persistence/buildSinePersistencePacket.ts`
- `server/sinePersistenceWriter.mjs`

Do not reuse the browser Lab outbox directly; it owns browser/session cadence, not headless persistence semantics.
Do not rely on the Lab-only session status sanitizer for headless terminal states.

Add a narrow headless session metadata writer, such as `upsertHeadlessRunSessionMetadata()`, that writes:

- `run_mode = 'headless'`
- `seed`
- `target_ticks`
- `checkpoint_interval_ticks`
- `minimum_resolved_trades`
- `completed_at`
- `termination_reason`
- `error`

Keep this writer in the server repository/write layer. It should complement shared core history writes, not replace Lab persistence.

Exit gates:

- Headless run start/completion writes to `sine_sessions`.
- Headless session metadata is written through a dedicated headless metadata path, not through Lab-only status normalization.
- Headless births write to `sine_spawner_births`.
- Headless deaths write to `sine_spawner_deaths`.
- Headless food spawn/resolve events write to `sine_food_events`.
- Headless lifecycle/event rows write to `sine_events` using compact event DTOs.
- Headless core writes cover all agents, not only eligible agents.
- Lab persistence code remains behaviorally unchanged.

### 2. Preserve Headless Status Semantics In Unified Columns

Map headless statuses and termination information into unified session columns without breaking Lab assumptions.

Headless statuses include:

- `running`
- `completed`
- `cancelled`
- `failed`

Lab statuses remain:

- `running`
- `paused`
- `stopped`

Exit gates:

- Lab status updates still preserve stopped-session stickiness.
- Lab status normalization remains scoped to Lab persistence.
- Headless completed/cancelled/failed runs are visible in the unified run list.
- Headless completed/cancelled/failed statuses are not coerced to Lab `running`, `paused`, or `stopped`.
- Failed-run fallback still writes enough session metadata to diagnose the failure.
- Cancelled headless runs do not appear as Lab `stopped` runs unless explicitly mapped in UI display only.

### 3. Gate Only Rich Reconstruction Snapshots

Keep `minimumResolvedTrades`, but apply it only to seed-bank reconstruction snapshots and eligibility rows.

Core run history must not be gated by this threshold.

Exit gates:

- Ineligible agents still appear in core birth/death/event/food history.
- Eligible agents get `sine_headless_agent_eligibility` rows.
- Eligible agents get reconstruction snapshots at birth, reproduction, and death where available.
- Ineligible agents do not accumulate rich reconstruction snapshots.
- Eligibility tick is stored and queryable.

## Milestone 2 Exit Gates

- Headless core history is written through the unified `toy-market.sqlite` core tables.
- Headless still records all agents in core history.
- `minimumResolvedTrades` gates only rich reconstruction data.
- Lab write behavior and packet cadence are unchanged.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 3: Retire Separate Headless DB Writes

Goal: remove the old two-DB write split for new runs.

This milestone starts only after Milestone 2 proves the unified headless core-history writer and dedicated headless session metadata writer.

### 1. Route Headless Repository To The Canonical DB

Replace `sineHeadlessDb.mjs` usage for new writes with the canonical `sineDb` / `toy-market.sqlite` path.

Exit gates:

- New headless runs do not create or write `data/sine-headless.sqlite`.
- Headless job worker opens the unified DB.
- Parent-process failed-run fallback writes to the unified DB.
- Concurrent headless runs still work with WAL/retry behavior.
- Server status no longer reports a separate active headless DB path for new writes.

### 2. Remove Or Deprecate Old Headless Write Statements

Remove old write dependency on:

- `sine_headless_runs`
- `sine_headless_agents`
- `sine_headless_agent_events`
- `sine_headless_agent_trades`
- `sine_headless_agent_snapshots`
- `sine_headless_agent_metrics`

Keep only compatibility code that is still needed during the transition, and avoid permanent old/new duplicate writers.

Exit gates:

- No new run writes into old `sine_headless_*` tables.
- No `sine_headless_agent_metrics` write path remains.
- There is one canonical headless write sink for new runs.
- Tests do not require a separate headless DB file.

### 3. Rewrite Headless Read Routes Against Unified Schema

Adapt the existing headless/Runs routes to read from:

- `sine_sessions`
- core `sine_*` history tables
- new lean headless extension tables

Derived metrics should be computed from raw rows.

Exit gates:

- Latest headless run endpoint works from unified DB data.
- Active job tracking still works.
- Headless agent detail can read lifecycle, trades, and reconstruction snapshots.
- Headless trade/quality metrics are computed from core food/trade rows, not stored metric rows.
- Headless route response contracts remain compatible where the UI still depends on them.

## Milestone 3 Exit Gates

- The separate headless DB write path is retired for new runs.
- New headless runs use the unified DB only.
- Headless API routes continue to work.
- No permanent duplicate write architecture remains.
- `npm run check` passes.
- `npm run test:sine` passes.

## Milestone 4: Unified Run Browser And Diagnostics

Goal: make the UI browse Lab and headless runs from one source.

Milestone 3 already routes new headless writes and compatibility headless read routes through the unified Toy Market DB. Milestone 4 should therefore focus on UI consolidation and shared diagnostics, not another backend migration pass.

### 1. Convert SQLite Run Browser Into An All-Runs Browser

Read the run list from unified `sine_sessions`.

Show:

- run ID
- run mode: Lab or Runs/headless
- status
- created time
- completed/updated time
- latest tick
- target ticks when present
- market data source
- rich headless data availability

Exit gates:

- Lab runs appear as before.
- Headless runs appear in the same list.
- Run-mode badges are derived from `runMode`.
- Market-source labels are derived from `marketSource` or saved settings.
- Existing Lab diagnostics still open from the same browser.
- Existing headless compatibility routes remain available until the Runs UI no longer depends on them.
- Empty/fresh DB state renders cleanly.

### 2. Point Diagnostics At Shared Core Data

Use existing saved-run diagnostics for both run modes where core data supports it.

Headless-only UI sections should appear only when extension rows exist.
Do not duplicate the headless compatibility analysis UI if the saved-run diagnostics can already derive the same information from unified core rows.

Exit gates:

- Lab diagnostics remain functionally unchanged.
- Headless diagnostics can compute run health, trade, risk, and cohort metrics from shared rows.
- Headless diagnostics do not depend on checkpoint, eligibility, or reconstruction extension rows for core run-health metrics.
- Missing headless-only data renders a clear empty state.
- No duplicate diagnostics implementation is introduced unnecessarily.
- Range filters and trade-quality filters continue to work.
- UI labels do not describe derived headless agent statistics as permanently stored metrics.

### 3. Expose Seed-Bank Reconstruction Availability

In the unified browser or headless detail view, show whether eligible reconstruction snapshots exist for a run/agent.

Exit gates:

- Eligible agents with reconstruction snapshots are discoverable.
- Reconstruction snapshot metadata is readable without loading giant JSON into the run list.
- Selecting a reconstruction snapshot can retrieve genome, hidden state, and learned state.
- Eligibility/reconstruction counts are labeled as reconstructable or eligible agents, not generic stored metrics.
- Lab runs do not show misleading seed-bank reconstruction controls.

## Milestone 4 Exit Gates

- One UI run browser can list and distinguish Lab and Runs/headless runs.
- Existing Lab diagnostics remain available and unchanged.
- Headless diagnostics read from unified core tables.
- Headless seed-bank reconstruction data is discoverable only where it exists.
- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.

## Milestone 5: Clean Reset And Final Verification

Goal: remove old trial data and verify the unified DB from a clean start.

### 1. Add A Deliberate DB Reset Procedure

Because existing data is disposable, reset by deleting the canonical Toy Market DB and obsolete trial headless DB files:

- `data/toy-market.sqlite`
- `data/toy-market.sqlite-wal`
- `data/toy-market.sqlite-shm`
- `data/sine-headless.sqlite`
- `data/sine-headless.sqlite-wal`
- `data/sine-headless.sqlite-shm`

The `sine-headless.sqlite` files are now obsolete cleanup targets. New runs should not depend on them and should not recreate them.
Use an explicit reset command, guarded by a confirmation flag, rather than leaving this as an ad hoc manual deletion step.

Exit gates:

- `npm run db:reset:toy-market -- --confirm` deletes only Toy Market Lab/Runs DB files and obsolete headless DB files.
- Reset documentation tells the user to stop the local API server first.
- Fresh startup creates the unified Toy Market DB.
- No old-data migration is required.
- Foreign keys pass after schema creation.
- `data/sine-headless.sqlite` is not recreated by normal Lab or headless runs.
- Any remaining references to the old headless DB path are limited to reset code/documentation, historical reports, or explicit absence tests.

### 2. Run End-To-End Smoke Tests

Add and run a DB-level smoke test, such as `npm run db:sine:smoke`, that asserts:

- one Lab save
- one headless run
- one cancelled headless run
- one failed-run fallback if practical
- Run Browser listing both modes
- diagnostics for Lab and headless
- seed-bank reconstruction snapshot availability for an eligible headless agent

Exit gates:

- Lab behavior is functionally unchanged.
- Headless behavior is functionally unchanged except DB unification and removed permanent derived metric storage.
- All new runs write to `toy-market.sqlite`.
- The smoke test proves the unified run list contains both Lab and headless modes while the test rows exist.
- Cancelled and failed headless terminal states remain visible through unified session analysis.
- No full headless cloned lifecycle `event_json` is stored.
- No duplicate full rich `snapshot_json` is stored.
- Rich reconstruction snapshots can recreate the agent fields needed for seed-bank admission.
- The obsolete `sine-headless.sqlite` file is absent before and after the smoke.

### 3. Full Verification

Run:

```bash
npm run db:sine:smoke
npm run check
npm run test:sine
npm run build
git diff --check
```

Exit gates:

- All commands pass.
- The unified DB smoke passes from a fresh DB after the deliberate reset.
- Headless concurrency tests pass against the unified DB.
- Lab persistence tests pass.
- Sine API route tests pass.
- No server/runtime/UI dependency boundary violations are introduced.
- `data/sine-headless.sqlite` is still absent after the full verification suite.

## Final Exit Gates

- `data/toy-market.sqlite` is the single canonical Toy Market DB.
- Lab writes the same core data it writes today.
- Headless writes all core history into the same core tables.
- Headless writes lean extension data only where needed for checkpoints, eligibility, and seed-bank reconstruction.
- Permanent derived headless metric storage is removed.
- SQLite Run Browser lists Lab and Runs/headless runs from the unified DB.
- Diagnostics read from unified core data.
- No separate `data/sine-headless.sqlite` is created for new runs.
- Headless-specific compatibility APIs either remain as thin unified-DB readers or are retired only after the UI no longer depends on them.
- Functional parity is preserved except for intentional DB unification and removal of permanent derived metric storage.
