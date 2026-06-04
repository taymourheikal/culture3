# Market Evolution Lab Rename Plan

This plan renames the old Sine / Toy Market Simulator into Market Evolution Lab while preserving functional parity. It is split into two milestones because the current name appears at two different levels: the product/module boundary and the deeper domain/data contract. The guiding rule is to rename one architectural layer at a time, keep compatibility explicit, and avoid duplicate routes, repositories, runtime models, or persistence paths.

## Non-Goals

- Do not change simulation behavior, reward logic, reproduction rules, mutation behavior, learning behavior, market inputs, or runtime performance characteristics as part of the rename.
- Do not rename `Spawner`, `Food`, `spawnerId`, `foodId`, or `sine_*` DB tables in Milestone 1.
- Do not create parallel "old" and "new" implementations of routes, repositories, workers, persistence clients, simulation helpers, or test suites.
- Do not make old saved live runs or old headless runs unreadable.
- Do not use a broad string replacement without checking routing, persistence, worker imports, browser harnesses, and migration behavior.
- Do not rename Ant World paths, scripts, DBs, or UI copy as part of this plan.

## Architecture Gates

These gates apply across both milestones.

- Market Evolution Lab should have one canonical product-name constant and one canonical API-base constant. Hardcoded copies of the product name or API prefix should be avoided where a shared constant is practical.
- API naming should distinguish the server origin from the app route prefix. The current client has an origin-style base and passes `/api/sine/...` paths separately, so the rename should avoid replacing one concern with another.
- Compatibility should live at boundaries: route normalization, DB-file opening/migration, and historical DTO adapters. Runtime code should not carry scattered old-name branches.
- Route compatibility must call the same handler path as the canonical route. Do not duplicate route implementations for `/api/sine` and `/api/market-lab`.
- Live persistence should have one repository implementation. Headless persistence should have one repository implementation.
- Schema migration should be conservative: verify row counts, foreign keys, indexes, and representative JSON payloads before old storage is considered migrated.
- Legacy persisted JSON should have one explicit strategy: either migrate the JSON through a tested transform or adapt old JSON on read through a repository/DTO boundary. Do not mix both approaches opportunistically.
- Tests should prove behavior parity, not only that renamed symbols compile.
- Any retained legacy names must be intentional and documented. Examples include compatibility routes, migration fixtures, old DB filenames, and legacy table names before Milestone 2.
- The rename should leave the codebase simpler or equivalently simple. A file move plus targeted name cleanup is acceptable; wrapper layers, duplicated DTOs, or duplicated data access are not.

## Milestone 1: Product And Module Rename

Goal: rename the app surface and source/module namespace without changing the runtime data contract. The user should see Market Evolution Lab, the app should run from `market-lab.html`, and the API should expose `/api/market-lab`, while existing saved data and internal simulation terms continue to work.

Milestone 1 intentionally keeps the deeper domain/data-contract names as legacy internals: `Spawner`, `Food`, `spawnerId`, `foodId`, `sine_*`, and `sine_headless_*`.

### 1. Finalize The Product Namespace Map

Create a concrete map for every old public name and classify each entry as renamed now, kept for compatibility, or deferred to Milestone 2.

Recommended Milestone 1 mappings:
- Product name: `Market Evolution Lab`
- Browser entry: `market-lab.html`
- Source directory: `src/market-lab`
- API namespace: `/api/market-lab`
- Live DB filename: `market-lab.sqlite`
- Headless DB filename: `market-lab-headless.sqlite`
- Contract test script: `test:market-lab`
- Headless CLI script: `market-lab:headless`

Deferred to Milestone 2:
- `Spawner`
- `Food`
- `spawnerId`
- `foodId`
- `sine_*` live DB tables
- `sine_headless_*` headless DB tables

Exit gates:
- The naming map covers UI labels, HTML entrypoints, source paths, API paths, package scripts, DB filenames, docs, and compatibility names.
- Every old name is classified as `rename now`, `compatibility`, or `defer`.
- No DB table or persisted JSON field rename is included in Milestone 1.
- The plan identifies `/api/market/sources` and `/api/market/candles` as existing market-data endpoints, so the app API does not collide with `/api/market`.

### 2. Add Canonical Product And API Constants

Add a small module for product-level names and API namespaces. Use it from presentation code and API clients where it reduces repeated literals.

Suggested values:
- `MARKET_LAB_PRODUCT_NAME = "Market Evolution Lab"`
- `MARKET_LAB_PAGE_TITLE = "Market Evolution Lab"`
- `MARKET_LAB_API_PREFIX = "/api/market-lab"`
- `MARKET_LAB_API_ORIGIN = "http://127.0.0.1:8787"` or a renamed version of the existing origin constant
- `LEGACY_SINE_API_BASE = "/api/sine"` only where compatibility is intentionally supported

Exit gates:
- URL construction separates API origin from app route prefix.
- New API clients use the canonical `/api/market-lab` prefix.
- Callers pass relative resource paths or use typed helper functions instead of repeating full `/api/market-lab/...` strings throughout the UI.
- User-facing title/header components consume the shared product name where practical.
- Legacy constants are named as legacy and are not imported by normal frontend request code.
- The constants module does not become a dumping ground for unrelated simulation defaults.

### 3. Move The Frontend Entrypoint And Source Directory

Move `src/sine` to `src/market-lab` and replace the main app entry with `market-lab.html`.

Update:
- Vite Rollup input.
- HTML root ID, page title, and script path.
- React entrypoint imports.
- Worker constructor paths and worker module imports.
- Browser smoke/perf/parity harness imports.
- CSS import paths.
- Dynamic module imports in browser perf/parity scripts.

Keep `sine.html` only as a temporary redirect or compatibility entry if compatibility is desired.

Decide explicitly whether Milestone 1 also renames CSS selectors and variables. A full style namespace rename is allowed if it is mechanical and covered by browser smoke checks. If it is deferred, `.sine-*` classes and `--sine-*` variables should be documented as temporary style internals rather than treated as a failed product rename.

Exit gates:
- `market-lab.html` loads the app directly in Vite.
- The simulation worker starts from the new path and advances ticks.
- Browser smoke/perf/parity harnesses no longer import `/src/sine/...`.
- Any remaining `sine.html` file is a deliberate compatibility redirect or compatibility entry, not the primary app entry.
- A search for `/src/sine` finds no primary runtime imports.
- CSS namespace handling is explicit: either `.sine-*` / `--sine-*` are renamed mechanically, or their temporary retention is documented and excluded from user-facing rename gates.

### 4. Rename Presentation-Level Components And Files

Rename UI-facing `Sine*` components and files where the name is product/module branding, not domain logic.

Examples:
- `SineApp` -> `MarketLabApp`
- `SineHeader` -> `MarketLabHeader`
- `SineHelpPage` -> `MarketLabHelpPage`
- `SineRunsView` -> `MarketLabRunsView`
- `SineHistoricalInspector` -> `MarketLabHistoricalInspector` or `RunArchive`
- `sine.css` -> `marketLab.css`

Avoid renaming deeper simulation-domain files in this milestone if the rename would imply the Milestone 2 data-contract change.

API-client files such as `sineApi.ts` should be renamed as part of API namespace work, not treated as pure presentation code. Their callers and tests should move together so no compatibility re-export becomes permanent.

Exit gates:
- Product-level components and CSS files no longer carry `Sine` as their primary name.
- Internal simulation behavior and persisted DTO shapes are unchanged.
- Component renames are mechanical and do not introduce wrapper components solely to preserve old names.
- TypeScript checks prove all imports were updated rather than leaving compatibility re-export files across the tree.
- API-client rename work is covered by route/API tests, not only by component import checks.

### 5. Update User-Facing Copy

Replace visible stale names:
- `Sine Workbench` -> `Market Evolution Lab`
- `Toy Market Simulator` -> `Market Evolution Lab`
- `ROC Signal Lab` -> `Market Evolution Lab`
- `SQLite Run Browser` -> `Run Archive`
- `Saved Runs` -> `Saved Experiments` or `Run Archive`
- `Spawner Agents` -> `Opportunity Agents` in UI labels only
- `Food` -> `Opportunity`, `Trade`, or `Trade Signal` in UI labels only where the context is clear

Update headers, tabs, Help content, modal titles, ARIA labels, tooltips, README text, and TODO text.

Exit gates:
- The browser title, app header, top navigation, Help page, Run Archive, headless Runs page, and modals use the new product language.
- UI copy no longer describes the app as Sine, Toy Market Simulator, ROC Signal Lab, or Sine Workbench.
- ARIA labels and empty/error states are included in the copy cleanup.
- UI labels may say Opportunity Agents or Trade Signals, but persisted field names such as `spawnerId` and `foodId` remain unchanged.
- The Help page accurately states any retained internal legacy terms if they are visible to advanced users.

### 6. Add `/api/market-lab` Without Duplicating Server Logic

Route `/api/market-lab/...` through the existing live and headless handlers after path normalization. If `/api/sine/...` remains temporarily supported, it should normalize into the same handler path.

Do not create separate Market Lab repositories by copying the Sine repositories in this milestone. Rename modules if useful, but keep one implementation.

Exit gates:
- Frontend live persistence, historical inspection, saved-run listing, deletion, and headless APIs call `/api/market-lab/...`.
- `/api/market-lab` live routes and headless routes return the same response shapes that `/api/sine` returned before the rename.
- If `/api/sine` remains, route tests prove canonical and compatibility routes are equivalent for representative endpoints.
- Server routing still has one live repository implementation and one headless repository implementation.
- No route branch duplicates request parsing, validation, or repository calls solely for the new prefix.

### 7. Rename Scripts And Test Harnesses

Rename the Sine-specific scripts and test directories to Market Lab names.

Examples:
- `scripts/testSine.ts` -> `scripts/testMarketLab.ts`
- `scripts/sine-tests/` -> `scripts/market-lab-tests/`
- `scripts/sineHeadless.ts` -> `scripts/marketLabHeadless.ts`
- `scripts/sinePerf.ts` -> `scripts/marketLabPerf.ts`
- `scripts/sineSmoke.ts` -> `scripts/marketLabSmoke.ts`
- `scripts/sineBrowserParity.ts` -> `scripts/marketLabBrowserParity.ts`
- `scripts/sineBrowserHarness.ts` -> `scripts/marketLabBrowserHarness.ts`

Package scripts should expose the new names. Old script aliases may remain temporarily, but only as wrappers pointing to the renamed scripts.

Exit gates:
- `npm run test:market-lab` runs the full existing contract suite.
- `npm run market-lab:headless` runs the headless CLI against the same engine and config model.
- Browser smoke/parity scripts load `market-lab.html`.
- There is no copied duplicate test suite; tests are moved/renamed, not forked.
- Docs and README references point to the new script names.

### 8. Rename DB Filenames With Compatibility

Rename DB files at the file-boundary level only.

Recommended defaults:
- Live DB: `data/market-lab.sqlite`
- Headless DB: `data/market-lab-headless.sqlite`

Keep table names unchanged in Milestone 1:
- `sine_sessions`
- `sine_spawner_births`
- `sine_food_events`
- `sine_headless_runs`
- `sine_headless_agent_trades`
- and related `sine_*` / `sine_headless_*` tables

Add a conservative compatibility path:
- Prefer the new filename.
- If the new file does not exist and the old file exists, copy or migrate once from the old filename.
- Do not write to both old and new files in the same process.
- Preserve WAL/SHM behavior safely.

The live DB is currently opened at module load, so path resolution and old-file compatibility must happen before `DatabaseSync` is constructed. Headless DB opening already has an explicit open function and can use the same path resolver without duplicating migration logic.

Exit gates:
- DB path resolution happens before the live DB singleton is opened.
- DB-file compatibility is implemented through one shared path-resolution/copy helper where practical, not separate ad hoc live and headless logic.
- Existing live saved runs from `toy-market.sqlite` can still be listed and inspected after the rename.
- Existing headless runs from `sine-headless.sqlite` can still be listed and analyzed after the rename.
- New live runs write to exactly one live DB file.
- New headless runs write to exactly one headless DB file.
- SQLite foreign key checks pass on the opened/migrated DBs.
- Compatibility behavior is tested against temporary DB files rather than only manually against `data/`.
- Logs or startup behavior make the chosen DB file unambiguous during development.

### 9. Update Documentation

Update user and developer documentation to the new product/module namespace.

Files to review:
- Root `README.md`
- `TODO.md`
- Market Lab Help page
- `src/market-lab/README.md`
- `src/market-lab/spawner/README.md`
- `src/market-lab/persistence/README.md`
- `src/market-lab/worker/README.md`
- Server README or migration notes if they mention Sine/Toy Market

Exit gates:
- Docs tell users to open `market-lab.html`.
- Docs use `npm run test:market-lab` and `npm run market-lab:headless`.
- Old names that remain are described as legacy schema, compatibility, or deferred domain terms.
- Docs no longer frame the app as a toy market or sine-wave simulator.
- Ant World documentation remains untouched except where it lists project structure.

### 10. Verify Milestone 1 Functional Parity

Run the renamed app through the existing checks and a browser smoke pass.

Required commands:

```bash
npm run check
npm run test:market-lab
npm run build
```

Browser checks should cover:
- `market-lab.html` loads.
- Simulation starts and stops.
- Market and Opportunity Agent sidebars render.
- Run Archive opens.
- Headless Runs page opens.
- Help page opens.
- A selected-agent modal opens.
- Historical inspection works against existing data.

Exit gates:
- TypeScript, contract tests, and build pass.
- Browser smoke/parity checks pass against `market-lab.html`.
- Browser worker parity passes after the file move, including real worker module loading and browser-side dynamic imports.
- Deterministic simulation fixtures are unchanged.
- Existing live and headless persisted data still opens.
- No duplicate route handler, repository, worker, persistence client, or runtime model was added.
- Remaining `sine` references are limited to Milestone 2 deferred data-contract names, legacy compatibility, old migration names, documented fixtures, or explicitly deferred CSS internals.

### Milestone 1 Exit Gates

- The app is visibly and navigationally Market Evolution Lab.
- `market-lab.html` is the primary browser entrypoint.
- `/api/market-lab` is the primary API namespace.
- New package scripts and docs use Market Lab names.
- Existing saved live runs and headless runs remain usable.
- Runtime behavior, deterministic tests, worker behavior, persistence packet shapes, and historical inspection are functionally equivalent to the pre-rename behavior.
- There is no duplicate architecture introduced to bridge old and new names.
- All Milestone 1 step exit gates pass.

## Milestone 2: Domain And Data-Contract Rename

Goal: rename the deeper simulation/data contract after the product/module rename is stable. This milestone changes internal TypeScript domain names, protocol fields, persistence DTO names, and SQLite table names in a controlled migration while preserving old data access.

This milestone should not start until Milestone 1 is complete and verified.

### 1. Finalize The Domain Vocabulary

Choose the canonical names for the core concepts before editing code. This should be deliberate because these names will appear in runtime types, worker messages, DB schemas, historical inspection, headless analysis, and seed-bank workflows.

Candidate mappings:
- `Spawner` -> `Agent`, `MarketAgent`, or `OpportunityAgent`
- `spawnerId` -> `agentId`
- `Food` -> `Trade`, `TradeOpportunity`, `Opportunity`, or `Position`
- `foodId` -> `tradeId` or `opportunityId`
- `spawner/` directory and files such as `spawnerSimulation.ts` -> the finalized domain directory/file vocabulary
- `sine_sessions` -> `market_lab_sessions`
- `sine_spawner_births` -> `market_lab_agent_births`
- `sine_spawner_deaths` -> `market_lab_agent_deaths`
- `sine_food_events` -> `market_lab_trade_events` or `market_lab_opportunity_events`
- `sine_headless_*` -> `market_lab_headless_*`

Exit gates:
- A final vocabulary map exists before implementation starts.
- Each renamed concept has one canonical new name.
- Directory, file, type, DTO, table, and field names are included in the same vocabulary map.
- The chosen names distinguish agent lifecycle, trade/opportunity lifecycle, and market data clearly.
- Naming choices are reflected in planned TypeScript types, DTO fields, DB tables, and UI labels.
- Ambiguous names such as `Trade` versus `TradeOpportunity` are resolved before schema work begins.

### 2. Add Data-Contract Adapters At The Boundaries

Introduce focused adapters that can read old persisted/protocol shapes and produce the new canonical internal shape. The adapter layer should be small and boundary-local.

Boundaries to cover:
- Live persistence packet reading/writing.
- Historical inspection rows.
- Headless recorder/repository rows.
- Worker protocol messages only if a real compatibility requirement exists. Browser workers and the main UI ship together, so transient worker messages can usually be renamed atomically.
- Saved JSON payloads embedded in DB rows.

Exit gates:
- New runtime code consumes one canonical internal shape.
- Old persisted rows can be converted to the canonical shape through one adapter path.
- Compatibility adapters are not imported by hot simulation logic unless explicitly needed at a boundary.
- There is no active parallel runtime model where old `Spawner` and new `Agent` types represent separate concepts.
- Adapter tests cover representative old live rows, old headless rows, and old JSON payloads.
- Transient worker protocol compatibility is not added unless a test or external caller proves it is needed.

### 3. Rename TypeScript Domain Types And Fields

Rename internal types and fields according to the finalized domain vocabulary.

Likely areas:
- `src/market-lab/spawner/*`
- `spawnerSimulation.ts`
- worker protocol files
- packets
- persistence DTOs
- headless recorder/types
- history/inspection types
- architecture/roster UI props
- tests and fixtures

Do this as a data-contract rename, not a behavior change.

Exit gates:
- TypeScript uses the new canonical domain names in primary code.
- Runtime behavior tests pass with unchanged deterministic outcomes.
- Worker protocol tests prove old/new field handling where compatibility is retained.
- Temporary type aliases have a removal point inside this milestone and are not exported as long-term public API.
- Primary exports use only the new domain names after migration.
- A search for old domain names shows only migration adapters, fixtures, compatibility tests, or historical comments.

### 4. Migrate Live SQLite Schema

Create the new live schema using the Milestone 2 table names. Migrate data from old `sine_*` tables into the new tables.

Migration requirements:
- Preserve primary keys and unique constraints.
- Preserve foreign keys.
- Preserve indexes or equivalent query performance.
- Preserve JSON payloads through the strategy chosen in the architecture gates: either tested JSON-key migration or old-JSON read adapters at the repository/DTO boundary.
- Preserve run status, settings JSON, agent births/deaths, genome snapshots, state snapshots, trade/opportunity events, raw events, and uniqueness snapshots.

Exit gates:
- Migration copies all old live rows into the new schema with matching row counts.
- Foreign key checks pass after migration.
- The JSON compatibility strategy is tested on representative live birth, death, genome, state, event, trade/opportunity, and uniqueness payloads.
- Representative historical inspections match before and after migration.
- Saved-run list, delete, and inspect behavior works from the new schema.
- Old tables are not destructively dropped until verification has passed.
- The repository uses one canonical query path after migration, with old-schema compatibility isolated.

### 5. Migrate Headless SQLite Schema

Create the new headless schema and migrate old `sine_headless_*` data.

Migration requirements:
- Preserve runs, checkpoints, agents, events, trades/opportunities, snapshots, metrics, and analysis summaries.
- Preserve exact continuation snapshots, hidden state, learned state, and genome JSON.
- Preserve run completion/cancel/failure status.
- Preserve all fields needed for seed-bank analysis.

Exit gates:
- Migration copies all old headless rows into the new schema with matching row counts.
- Foreign key checks pass after migration.
- The JSON compatibility strategy is tested on representative headless agent, event, trade/opportunity, snapshot, metric, and checkpoint payloads.
- Existing completed headless runs remain listable and analyzable.
- Existing agent trade ledgers, lifecycle timelines, snapshots, and metrics remain accessible.
- New headless runs write only the new schema path.
- Repository compatibility code remains boundary-local and is not duplicated across analysis components.

### 6. Update Repositories And API Payloads

Update live and headless repositories to query the new schemas and return the new canonical payload names. Keep compatibility reads only where needed for old data.

Update API payloads deliberately:
- If public JSON fields change, tests must assert the new shape.
- If compatibility aliases are retained, they should be generated in one response-normalization helper, not scattered through route code.

Exit gates:
- `/api/market-lab` returns the new canonical field names.
- Existing UI consumers are updated to the new payload shape.
- Old data can still be read through repository compatibility.
- Route handlers remain thin and do not duplicate live/headless repository logic.
- API tests cover live sessions, snapshots, historical inspection, headless runs, headless analysis, deletion, and errors.

### 7. Update Historical Inspection, Run Archive, And Headless Analysis

Ensure all user-facing analysis views consume the new canonical domain model while continuing to display old saved data correctly.

Areas to verify:
- Run Archive.
- Historical agent inspection.
- Architecture modal.
- Trade ledger.
- Population composition.
- Lineage explorer.
- Runtime diagnostics where relevant.
- Headless run details and analysis views.

Exit gates:
- Old live runs and new live runs inspect through the same UI model.
- Old headless runs and new headless runs analyze through the same UI model.
- Agent lifecycle, reproduction, death, trade/opportunity ledgers, and RNN architecture remain visible.
- UI does not branch into separate old-run and new-run components.
- User-facing labels match the Milestone 2 vocabulary.

### 8. Update Tests, Fixtures, And Documentation

Rename tests and fixtures to the Milestone 2 domain vocabulary. Keep old-shape fixtures only where they prove migration or compatibility.

Update:
- Contract tests.
- Persistence tests.
- Route tests.
- Headless tests.
- Browser parity tests.
- README and Help page.
- Migration notes.

Exit gates:
- Tests assert the new domain names in primary payloads.
- Old-name fixtures exist only in migration/compatibility tests.
- Documentation no longer describes old domain names as current architecture.
- Help page uses the same vocabulary as UI labels and API/domain docs where relevant.
- `npm run check`, `npm run test:market-lab`, browser parity/smoke, and `npm run build` pass.

### 9. Remove Or Isolate Compatibility Code

After migrations and compatibility reads are proven, remove unnecessary transitional aliases. Keep only the compatibility code needed for old DBs, old fixtures, or intentional legacy imports.

Exit gates:
- Compatibility modules are small, named, and documented.
- No compatibility branch remains inside hot simulation loops.
- No compatibility branch remains inside React components when a repository/adapter can normalize the data first.
- A search for old domain names produces only migration fixtures, compatibility adapters, or intentional comments.
- No duplicate old/new repository, route, or DTO implementation remains.

### 10. Verify Milestone 2 Functional Parity

Run full parity and migration verification after the data-contract rename.

Required commands:

```bash
npm run check
npm run test:market-lab
npm run build
```

Additional verification:
- Migration dry run on copies of live and headless DBs.
- Row-count and foreign-key verification.
- Historical inspection before/after comparison for representative saved runs.
- Headless analysis before/after comparison for representative completed runs.
- Browser smoke pass over live app, Run Archive, Help, modals, and headless analysis.

Exit gates:
- Deterministic runtime tests produce the same simulation outcomes as before the Milestone 2 rename.
- Old live and headless data remain accessible.
- New live and headless runs write the new domain/schema names only.
- Worker protocol parity tests pass.
- Persistence packet and repository tests pass.
- Browser smoke/parity checks pass.
- No duplicate runtime model, repository, route handler, persistence path, or analysis component was added.

### Milestone 2 Exit Gates

- Primary TypeScript domain names, API payload names, and SQLite table names use the new Market Evolution Lab vocabulary.
- Existing old live and headless data can still be read, inspected, analyzed, and deleted.
- New data writes use the new schema and new canonical payload fields.
- Migration checks pass for row counts, foreign keys, indexes, and representative JSON payloads.
- UI, Help, docs, tests, and API payloads use the same domain vocabulary.
- Compatibility is isolated to named boundary adapters and migration fixtures.
- All Milestone 2 step exit gates pass.
