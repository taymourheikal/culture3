# Sine Diagnostics And Headless Simplification M1 Report

Milestone 1 implemented guardrails and focused characterization before any production refactor work.

## Changes

- Added `scripts/checkServerMjsSyntax.mjs`.
- Added `npm run check:server:mjs`.
- Updated `npm run check` to run TypeScript checks and the server `.mjs` syntax guard.
- Added diagnostics golden fixtures in `scripts/sine-tests/runDiagnostics.test.ts`.
- Added the run diagnostics suite to `scripts/testSine.ts`.
- Extended the headless memory sink fixture to retain eligibility and death records.
- Added `Headless Recorder Manual Lifecycle Characterization` to `scripts/sine-tests/headless.test.ts`.

## Guardrail Coverage

The server syntax guard uses `node --check` on each top-level `server/*.mjs` file. This parses module syntax without importing modules, starting the HTTP server, or mutating SQLite state.

## Diagnostics Characterization

The diagnostics golden fixtures cover:

- population diagnostics
- death-cause diagnostics
- trading diagnostics
- risk/tail metrics
- population structure
- filtered tick ranges
- empty/no-trade/no-death outputs

## Headless Recorder Characterization

The manual recorder characterization covers:

- founder birth recording
- reproduction event recording
- child birth recording
- pre-eligibility trade and snapshot buffering
- eligibility threshold crossing
- buffered trade/snapshot flushing
- death recording
- final metrics write behavior
- sink call counts where ordering/counting is part of current behavior

## Verification

Commands run:

```bash
npm run check:server:mjs
npm run check
node --import tsx -e "import { tests } from './scripts/sine-tests/runDiagnostics.test.ts'; for (const t of tests) { await t.run(); console.log('PASS', t.name); }"
node --import tsx -e "import { tests } from './scripts/sine-tests/headless.test.ts'; for (const t of tests) { await t.run(); console.log('PASS', t.name); }"
npm run test:sine
```

Results:

- `npm run check:server:mjs`: passed, checked 36 server `.mjs` files.
- Temporary `.mjs` duplicate-declaration probe: `node --check` failed with `SyntaxError: Identifier 'duplicated' has already been declared`.
- `npm run check`: passed.
- direct diagnostics tests: passed.
- direct headless tests: passed.
- `npm run test:sine`: passed.

## Notes For Later Milestones

- The manual recorder test locks current behavior where metrics are written twice on the resolve event that crosses eligibility: once during eligibility marking and once in the resolve branch. Later recorder cleanup should preserve that unless deliberately changed in a separate behavior pass.
- No production diagnostics, recorder, runtime, repository, API, UI, or DB behavior was changed in this milestone.
