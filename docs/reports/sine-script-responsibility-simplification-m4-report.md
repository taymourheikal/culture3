# Sine Script Responsibility Simplification - Milestone 4 Report

## Scope

Milestone 4 split the Sine DB support layer so `server/sineDb.mjs` is a DB-open/bootstrap compatibility facade instead of owning schema SQL and prepared statement construction.

Touched files:

- `server/sineDb.mjs`
- `server/sineSchema.mjs`
- `server/sineStatements.mjs`

## Changes

- Added `server/sineSchema.mjs` with `initializeSineSchema(db)`.
- Moved schema bootstrap into `initializeSineSchema(db)`:
  - PRAGMA setup
  - `CREATE TABLE IF NOT EXISTS`
  - `CREATE INDEX IF NOT EXISTS`
  - `ensureColumn()`
  - migration/bootstrap columns and indexes
- Added `server/sineStatements.mjs` with `createSineStatements(db)`.
- Moved the prepared statement object into `createSineStatements(db)`.
- Kept `server/sineDb.mjs` exporting:
  - `defaultSineDbPath`
  - `activeSineDbPath`
  - `sineDb`
  - `sineStatements`
- Kept downstream imports compatible; repository/writer modules continue importing from `server/sineDb.mjs`.

## Verification

Passed:

```bash
node scripts/checkServerMjsSyntax.mjs
npm run check
npm run test:sine
git diff --check -- server/sineDb.mjs server/sineSchema.mjs server/sineStatements.mjs
```

Runtime facade smoke with a temporary DB path:

```json
{"hasDefaultPath":true,"hasActivePath":true,"hasDb":true,"statementCount":37,"hasListSessions":true}
```

## Exit Gate Audit

- `server/sineDb.mjs` still opens the Toy Market DB path and exports `sineDb`, `defaultSineDbPath`, `activeSineDbPath`, and `sineStatements`.
- Schema initialization still runs at module load through `initializeSineSchema(sineDb)`.
- Schema ownership moved to `server/sineSchema.mjs`; `server/sineDb.mjs` no longer owns table/index/column bootstrap SQL.
- Prepared statement creation moved to `server/sineStatements.mjs`; `server/sineDb.mjs` no longer owns statement SQL.
- `server/sineStatements.mjs` does not import `server/sineDb.mjs`, avoiding a circular dependency.
- `server/sineSchema.mjs` does not import `server/sineDb.mjs`, avoiding a circular dependency.
- Compatibility imports remain stable for:
  - `server/sineRepository.mjs`
  - `server/sinePersistenceWriter.mjs`
  - `server/sineHistoricalContext.mjs`
  - `server/sineSpawnerInspectionRepository.mjs`
  - headless unified read/write repositories
- Unified headless DB tests passed through `npm run test:sine`.
- No API route behavior or DB write ownership was intentionally changed.

