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
- `sineRepository.mjs`: Toy Market session, spawner, genome, state, event, food, and uniqueness persistence.
- `validation.mjs`: request validation and option sanitization.

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
