# Sine Seed Bank Plan

Goal: add a Seed Bank tab where reconstructable headless-run agents can be filtered, reviewed, and frozen into persistent seed-bank collections.

This is an additive preservation and selection layer. It must not change Lab behavior, headless simulation behavior, learning, mutation, reproduction, payoff, death, market inputs, brain evaluation, or run-history persistence semantics.

## Non-Goals

- Do not admit Lab agents into seed banks in this pass. Lab runs do not currently have the same headless reconstruction snapshot contract.
- Do not implement reseeding a future run from a seed bank in this pass.
- Do not implement agent blending or averaged genome/learned-state construction in this pass.
- Do not build a permanent derived-metrics warehouse in the seed-bank DB.
- Do not duplicate run diagnostics, trade-quality, Sharpe, Sortino, or age-exposure formulas.
- Do not add seed-bank tables to `data/toy-market.sqlite`.
- Do not require source run-history rows to remain available after an agent has been admitted.

## Architecture Gates

These gates apply to every milestone.

- Keep the simulation runtime out of seed-bank persistence and candidate selection.
- Keep `src/sine` runtime modules independent of server modules.
- Keep SQL in server repository/schema modules, not in React components or simulation code.
- Reuse existing headless facts and diagnostics helpers wherever their semantics match.
- Extract or generalize shared metric helpers before duplicating formulas.
- Store facts needed for reconstruction and admission provenance; derive secondary metrics when possible.
- Keep route handlers thin.
- Keep one public seed-bank repository facade.
- Keep candidate discovery separate from frozen seed-bank storage.
- Functional parity is mandatory for Lab, Runs/headless execution, and saved-run diagnostics.

## Milestone 1: Seed Bank Persistence Domain

Goal: create a durable, independent seed-bank storage layer that can preserve frozen reconstructable agents even if run history is later deleted.

### 1. Add A Dedicated Seed Bank SQLite Owner

Create a separate DB owner and schema initializer, for example:

- `server/sineSeedBankDb.mjs`
- `server/sineSeedBankSchema.mjs`

The default DB path should be separate from `data/toy-market.sqlite`, for example `data/seed-bank.sqlite`.

Exit gates:

- Seed-bank schema initializes without opening or mutating the Toy Market run-history schema.
- `data/toy-market.sqlite` does not receive seed-bank tables.
- Seed-bank DB path can be overridden in tests without affecting the main Sine DB path.
- Foreign-key behavior is enabled where relevant inside the seed-bank DB.

### 2. Define Seed Bank Tables

Create focused tables:

- `seed_banks`
- `seed_bank_entries`

`seed_banks` should store:

- stable bank ID
- label/name
- description
- created timestamp
- updated timestamp

`seed_bank_entries` should store:

- entry ID
- bank ID
- source run ID
- source spawner ID
- source lineage ID
- source generation
- source birth/death/lifespan context
- source reconstruction snapshot count
- admission metrics JSON
- admission filters JSON
- created timestamp

Add a child table for frozen reconstruction snapshots, for example `seed_bank_entry_snapshots`, storing:

- entry ID
- source snapshot tick
- source snapshot reason
- reconstruction schema version
- frozen `genome_json`
- frozen `hidden_state_json`
- frozen `learned_state_json`
- created timestamp

Exit gates:

- Frozen entries contain reconstruction data directly, not source-run references only.
- Frozen entries do not depend on the synthetic partial `SpawnerAgent` object returned by headless reconstruction display helpers.
- Duplicate prevention is deterministic, using source run and source agent within a bank.
- Every source reconstruction snapshot for an admitted agent is copied into the seed-bank DB.
- No frozen snapshot is marked primary in this pass.
- Schema does not store full source run rows or full duplicated diagnostics payloads.

### 3. Add A Seed Bank Repository Facade

Create one public repository facade, for example `server/sineSeedBankRepository.mjs`.

Responsibilities:

- create seed banks
- list seed banks
- update seed bank label/description
- list entries for a bank
- add frozen entries
- detect existing entries for candidate display

Exit gates:

- Route handlers can perform all seed-bank persistence through this facade.
- SQL does not leak into route handlers.
- Repository tests cover create, update, list, add entry, duplicate handling, and readback.
- A frozen entry remains readable after deleting or hiding the corresponding source run-history rows in a test fixture.

### 4. Define The Frozen Entry Contract

Create a narrow shared API contract for seed-bank entries. It should align with the existing reseed concept in `src/sine/headless/seedBankPolicy.ts`: preserve genome, hidden state, and learned state; reset runtime-only state later when reseeding is implemented.

The frozen contract should clearly separate:

- reconstruction payload
- source provenance
- admission-time metrics
- admission filters

Exit gates:

- The contract contains enough data to reconstruct the preserved brain state later without querying run history.
- Admission metrics are labeled as admission-time values.
- Runtime-only fields such as energy, open trades, cooldowns, and trace stores are not treated as preserved seed-bank state.
- No second incompatible seed-bank reconstruction shape is introduced.

## Milestone 1 Exit Gates

- Seed-bank DB and repository exist.
- Seed banks and frozen entries can be created, listed, and read back.
- Main run-history DB behavior is unchanged.
- Seed-bank persistence tests pass.
- `npm run check` passes.

## Milestone 2: Headless Candidate Discovery

Goal: expose reconstructable headless agents as seed-bank candidates using existing run-history facts and shared metric definitions.

### 1. Build Candidate Discovery On Existing Headless Facts

Create a candidate service, for example `server/sineSeedBankCandidates.mjs`, that reads from the existing unified run-history DB through existing helpers:

- `createSineHeadlessRunFacts()`
- `deriveAgentStatsRows()`
- `reconstructionSnapshots()`
- shared trade-quality and diagnostics math helpers

Exit gates:

- Candidate discovery includes only `run_mode = 'headless'` runs.
- Candidate discovery does not duplicate headless birth, death, trade, or snapshot parsers.
- Candidate discovery does not create a second headless analysis repository.
- Source runs with no reconstruction snapshots return a clear empty candidate result.

### 2. Generalize Candidate Metrics Without Duplicating Diagnostics

Extend the existing trade-quality metric path where needed so seed-bank candidates and diagnostics share formula definitions for:

- resolved trade count
- children
- hit rate
- average payoff
- trade-level Sharpe
- trade-level Sortino
- downside volatility if included in candidate rows

If `server/sineTradeQuality.mjs` needs a lower-level per-agent summary export, add it there rather than rebuilding formulas inside the seed-bank candidate service.

Exit gates:

- Candidate Sharpe and Sortino values are produced by shared diagnostics math.
- Candidate average payoff and hit rate match existing headless derived stats for the same run and agent.
- Candidate children count matches existing headless derived stats for the same run and agent.
- Undefined Sharpe/Sortino cases are represented explicitly as `null`, not `NaN` or infinity.
- Existing run diagnostics tests continue to pass.

### 3. Implement Whole-Run Age Exposure Percentiles

Compute age exposure percentile per run across all agents in that run before candidate filters are applied.

For this first pass, seed-bank age exposure should be whole-run based, not range-relative diagnostics age exposure.

Exit gates:

- Age percentile thresholds are computed from all agents in the source run.
- Filtering by age percentile does not recompute percentiles from the already-filtered candidate set.
- Live-at-completion agents use run-end tick for age exposure.
- Dead agents use death tick for age exposure.

### 4. Implement Candidate Filters

Support AND-combined filters:

- selected headless run IDs
- minimum resolved trades
- minimum children
- minimum age exposure percentile
- minimum Sharpe
- minimum Sortino

Exit gates:

- If multiple filters are set, an agent must satisfy all of them.
- Candidates with too few children fail a positive minimum-children filter.
- Candidates with `null` Sharpe or Sortino fail a positive minimum Sharpe/Sortino filter.
- Candidate results are bounded and paginated or otherwise limited for large runs.
- Candidate sort order is deterministic.

### 5. Freeze All Reconstruction Snapshots

For each admitted candidate, copy every available source reconstruction snapshot for that source run and agent into the seed-bank DB.

This pass should not choose, label, or compute a primary snapshot. The future reconstruction/blending policy decides how to use the frozen snapshot set.

Exit gates:

- Every returned candidate has at least one reconstruction snapshot.
- Non-reconstructable agents are excluded with no partial candidate rows.
- Candidate response includes reconstruction snapshot count and latest snapshot tick for review.
- Admission copies all source reconstruction snapshots for the admitted agent.
- The copied snapshot set preserves each source snapshot tick, reason, schema version, genome, hidden state, and learned state.
- No copied snapshot is marked primary.
- Tests cover final, death, trade-interval, reproduction, and birth-only snapshot cases.

### 6. Add Candidate Admission

Add a server operation that admits selected candidates into a seed bank by validating the source run/agent, reading every source reconstruction snapshot for that agent, computing admission context, and then calling the Milestone 1 seed-bank repository facade to freeze the entry.

Admission should re-read and validate the source reconstruction snapshots at write time rather than trusting the client to send reconstruction JSON.

Exit gates:

- Admission uses `createSineSeedBankRepository().addFrozenEntry(...)` or the same public repository facade rather than creating a second seed-bank write path.
- Admission copies frozen `genome_json`, `hidden_state_json`, and `learned_state_json` from every source reconstruction snapshot row for that agent.
- If source reconstruction snapshots are missing at admission time, the request fails clearly and does not create a partial entry.
- Admission stores source provenance, admission metrics, and filter context.
- Duplicate admissions are idempotent or return a clear duplicate status.

## Milestone 2 Exit Gates

- Candidate service API returns reconstructable headless agents only.
- Candidate filters use shared metrics and whole-run age exposure semantics.
- Candidate admission freezes source reconstruction data into the separate seed-bank DB.
- No simulation/runtime behavior changes are introduced.
- `npm run check` and `npm run test:sine` pass.

## Milestone 3: Seed Bank API And UI

Goal: add a top-level Seed Bank tab that lets the user create seed banks, filter candidates from headless runs, and admit selected agents.

### 1. Add Thin Seed Bank Routes

Create a route module, for example `server/sineSeedBankRoutes.mjs`, and register it beside existing Sine route modules.

Routes should wrap the Milestone 2 candidate service and Milestone 1 repository facade. They should not rediscover candidates, recompute metrics, parse reconstruction snapshots, or write seed-bank rows directly.

Initial endpoints should cover:

- list/create/update seed banks
- list entries for a seed bank
- list candidate source runs
- list candidates for selected runs and filters
- admit selected candidates into a bank

Exit gates:

- `server/routes.mjs` delegates to the new route module without embedding seed-bank logic.
- Route handlers call repository/candidate services, not raw SQL.
- Candidate routes call `createSineSeedBankCandidateService()` or the same public candidate-service functions.
- Admission routes use the Milestone 1 seed-bank repository facade for frozen entry writes.
- Admission requests send source references and filter context, not reconstruction JSON from the client.
- Invalid filters return clear `400` responses.
- Missing seed bank or source run returns clear `404` responses where appropriate.
- Missing source reconstruction snapshots fail admission without creating partial entries.
- Duplicate admissions return the existing entry or a clear duplicate/inserted status.

### 2. Add A Typed Frontend API Client

Create a small frontend client, for example `src/sine/seedBankApi.ts`, using existing `getSineJson()` and `postSineJson()` helpers.

Exit gates:

- React components do not build raw fetch calls manually.
- API response/request types are centralized.
- Admission request types contain `bankId`, `sourceRunId`, `sourceSpawnerId`, and optional filter context, not frozen snapshot payloads.
- Query serialization follows existing Sine API conventions.
- API shape tests or route tests cover representative request bodies.

### 3. Add The Seed Bank Top-Level Tab

Add a `Seed Bank` view between `Runs` and `Help`.

Touch points:

- `src/sine/SineApp.tsx`
- `src/sine/SineViewTabs.tsx`
- new `src/sine/SineSeedBankView.tsx`

Exit gates:

- `Seed Bank` appears between `Runs` and `Help`.
- Switching tabs does not interrupt active headless runs.
- Existing `Lab`, `Runs`, and `Help` navigation remains unchanged.
- `npm run build` passes after the tab addition.

### 4. Build Seed Bank Management UI

The view should support:

- creating a seed bank
- editing bank label/name
- editing bank description
- selecting an active bank
- listing current entries in the selected bank

Exit gates:

- More than one seed bank can exist at the same time.
- Label and description persist after refresh.
- Selected bank entries load from SQLite.
- Empty states are readable.
- UI reuses existing Sine panel/button/input styles where practical.

### 5. Build Candidate Filter And Review UI

The candidate area should support:

- selecting one or more headless runs
- selecting the active seed bank context used for duplicate/admitted status
- minimum resolved trades
- minimum children
- minimum whole-run age exposure percentile
- minimum Sharpe
- minimum Sortino
- candidate table
- add selected candidates to the selected seed bank

Candidate rows should show at least:

- source run ID
- spawner ID
- lineage/generation
- children
- resolved trades
- whole-run age exposure percentile
- Sharpe
- Sortino
- hit rate
- average payoff
- reconstruction snapshot count
- latest reconstruction snapshot tick
- already-admitted status

Exit gates:

- Candidate rows update when filters change.
- Multiple filters combine with AND semantics.
- Adding candidates creates frozen seed-bank entries.
- Already-admitted candidates are visibly marked or disabled at the source run + source agent level, not per snapshot.
- Candidate duplicate/admitted status comes from the selected seed bank context by passing the active `bankId` to the candidate API.
- UI copy makes clear that age exposure is whole-run based, not relative to the currently filtered candidate set.
- Large candidate lists remain bounded or paginated.

### 6. Add Minimal Entry Detail Display

Show enough entry detail to confirm what was admitted:

- source run
- source agent
- frozen reconstruction snapshot count
- snapshot reasons/tick range
- admission metrics
- lineage/generation
- created timestamp

Do not build a full architecture inspector or reseeding UI in this milestone.

Exit gates:

- User can distinguish entries from different source runs and snapshots.
- User can see that all reconstruction snapshots were frozen for the admitted entry.
- Entry details do not require source run history to exist.
- UI labels make clear that metrics are admission-time values.
- No seed-bank entry UI duplicates the existing historical RNN inspector.

## Milestone 3 Exit Gates

- Seed Bank tab is usable end to end.
- User can create banks, filter candidates, and admit frozen entries.
- Seed banks persist across refreshes.
- UI uses existing Sine API/client/style patterns.
- `npm run check`, `npm run test:sine`, and `npm run build` pass.

## Final Verification

Run full verification after all milestones.

Exit gates:

- `npm run check` passes.
- `npm run test:sine` passes.
- `npm run build` passes.
- Seed-bank persistence tests cover DB initialization, bank CRUD, entry freezing, duplicate handling, and source-run independence.
- Candidate tests cover min trades, min children, age percentile, Sharpe, Sortino, all-snapshot freezing, and missing-source-snapshot admission failure.
- Route/API tests cover candidate listing, server-side admitted status through `bankId`, source-reference admission request shape, duplicate admission response shape, lab/non-headless exclusion, missing source run handling, and missing-source-snapshot admission failure.
- Existing Lab saved-run diagnostics still pass.
- Existing headless run execution and analysis tests still pass.
- No deterministic simulation parity tests change because this plan is analysis/persistence/UI only.
