# Local API Server

This directory contains the local Node server used by Emergent Ant World and Toy Market Simulator.

## Main Files

- `index.mjs`: starts the HTTP server on `127.0.0.1:8787`.
- `routes.mjs`: request router for world snapshots, batch jobs, batch experiments, and Toy Market persistence/inspection.
- `antDb.mjs`: Ant World SQLite schema and prepared statements for live world and batch data.
- `sineDb.mjs`: Toy Market SQLite schema and prepared statements for sessions, spawners, food events, and uniqueness data.
- `worldRepository.mjs`: live Ant World snapshot and event persistence.
- `batchRepository.mjs`: batch experiment, run, lineage, and analysis persistence.
- `batchJobs.mjs`, `batchWorker.mjs`: server-side batch job orchestration and worker execution.
- `sineRepository.mjs`: public Toy Market saved-run facade for session persistence, diagnostics, cohort analysis, and historical inspection.
- `sinePersistenceWriter.mjs`: saved-run write path for sessions, spawners, genomes, state snapshots, food/events, and uniqueness rows.
- `sineHistoricalContext.mjs`: saved-run historical row loading, tick ranges, alive/dead context, and agent exposure.
- `sineRunDiagnostics.mjs`, `sineTradeQuality.mjs`, `sineCohortDiagnostics.mjs`, `sineCohortRegimeContext.mjs`: saved-run health, trading, risk, trade-quality, cohort, and market-regime analysis.
- `sineSpawnerInspectionRepository.mjs`: historical spawner reconstruction behind the saved-run facade.
- `sineHeadlessRepository.mjs`: public headless-run repository facade. Headless runs write to the unified Toy Market DB through `sineHeadlessUnifiedWriteRepository.mjs` and read through `sineHeadlessUnifiedReadRepository.mjs`.
- `sineHeadlessRoutes.mjs`, `sineHeadlessJobs.mjs`: API routes and configurable concurrent job orchestration for headless Toy Market runs.
- `validation.mjs`: request validation and option sanitization.

## Toy Market Headless Runtime

The browser Lab and headless Runs page share the same simulation engine in `src/sine/`. Headless orchestration lives in `src/sine/headless/`:

- `runner.ts`: setup, chunk advancement, progress, checkpoint, and finalization orchestration.
- `recorder.ts`: converts runtime events into headless run, agent, event, trade, snapshot, transient derived-stat, and checkpoint records.
- `headlessTimingCollector.ts`: lightweight timing counters for simulation, recorder, and sink writes.
- `headlessCheckpointScheduler.ts`: initial, interval, and final checkpoint scheduling.
- `headlessCandleLoader.ts`: runner-side BTC candle initialization/refill coordination with an injected loader.

## Runtime Data

SQLite files and generated outputs live in `data/` and should not be committed. Domain databases are created automatically:

```text
data/ant-world.sqlite
data/toy-market.sqlite
```

Older shared databases can be split with:

```bash
npm run db:split
```

Run it only while the local API server is stopped. The script creates a backup, migrates `sine_*` tables into `toy-market.sqlite`, verifies the copy, drops old `sine_*` tables from `ant-world.sqlite`, and vacuums the Ant DB.

To deliberately reset Toy Market after the unified Lab/Runs DB transition, stop the local API server and run:

```bash
npm run db:reset:toy-market -- --confirm
```

This deletes `data/toy-market.sqlite`, its WAL/SHM files, and obsolete trial `data/sine-headless.sqlite` files. Fresh startup recreates `data/toy-market.sqlite`; new Lab and Runs/headless writes should not recreate `data/sine-headless.sqlite`. Derived headless statistics are computed from unified core rows rather than permanently stored in a separate metrics table.

For isolated benchmarks, set `SINE_DB_PATH` before starting the server-side Toy Market modules. The headless repository facade no longer creates a separate DB from a runtime `--db` argument.

## Boundaries

The server can import pure simulation code from `src/ant/sim/` and shared Toy Market inspection helpers. It should not import React components or browser-only modules.

Keep SQL ownership in repository modules. Route handlers should validate input, call repositories/jobs, and return JSON.

## Development

Run the API only:

```bash
npm run dev:server
```

Run frontend and API together:

```bash
npm run dev
```

If port `8787` is already in use, stop the existing server before starting another one.

## Verification

Run:

```bash
npm run check
npm run test:sine
npm run build
```

For batch changes, start a small browser or CLI batch and confirm the saved experiment can be loaded.
