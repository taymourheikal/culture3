# Sine Exact-Parity Runtime Speedup M11 Report

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 11.

## Summary

Milestone 11 moved API-started headless runs out of the main server event loop and into a dedicated Node worker thread.

This is a responsiveness change, not a raw simulation-speed change. The same `runHeadlessSineExperiment()` runner remains the only headless simulation engine, and the worker owns the headless repository/DB sink for normal execution.

The job manager still enforces one active run. It now tracks active state through a `runId`-keyed registry/facade so Milestone 12 can add multi-run scheduling without redesigning the runner boundary.

## Implementation

Changed files:

- `server/sineHeadlessJobWorker.mjs`
- `server/sineHeadlessJobs.mjs`
- `server/sineHeadlessDb.mjs`
- `scripts/sine-tests/headless.test.ts`

Key changes:

- Added `server/sineHeadlessJobWorker.mjs`.
- Worker imports and runs `src/sine/headless/runner.ts`.
- Worker owns `createSineHeadlessRepository()` and the DB sink during normal execution.
- Parent/worker IPC is limited to start data, checkpoint, progress, cancel, result, timing, and error messages.
- Parent job manager now uses a `Map<runId, jobHandle>` with a maximum active count of `1`.
- Existing `/api/sine/headless/runs/active` response shape remains unchanged.
- Added `listActiveSineHeadlessJobs()` as a scheduler-ready facade for the next milestone.
- Added `PRAGMA busy_timeout = 5000` to the headless DB opener after benchmark testing exposed active analysis reads colliding with worker write transactions.
- Worker closes its message port on completion so test and server processes do not retain stale worker handles.

## Verification Coverage

New/updated tests:

- `headless: Headless Job Manager Active Conflict And Cancel`
  - now exercises the worker-backed job path
  - verifies the active registry exposes one active job
  - verifies one-active-run conflict behavior still returns `409`
  - verifies cancellation reaches the isolated runner and persists `cancelled`
- `headless: Isolated Headless Worker Matches Direct Strict Digest`
  - runs the same seed/config once through the direct runner and once through the worker
  - compares `strictWorldDigest()` exactly

Existing tests also continue to cover:

- chunk-size strict digest parity
- headless recorder/runtime digest parity
- cancellation and progress at chunk boundaries
- interrupted run failure marking
- repository write/batch rollback behavior
- persisted run analysis routes and diagnostics

## API Responsiveness Benchmark

Artifact:

- `/tmp/sine-m11-api-latency-500.json`

Temporary server:

```bash
SINE_BENCHMARK_INSTRUMENTATION=1 SINE_HEADLESS_DB_PATH=/tmp/sine-m11-api.sqlite PORT=18788 npm run start:server
```

Command:

```bash
npx tsx scripts/sineApiLatencyBenchmark.ts --base-url http://127.0.0.1:18788 --ticks 500 --seed 101 --initial-spawners 500 --max-spawners 500 --chunk-ticks 25 --checkpoint-interval-ticks 100 --minimum-resolved-trades 1 --poll-interval-ms 100 --status-interval-ms 250
```

Results:

- isolated benchmark DB: `/tmp/sine-m11-api.sqlite`
- both benchmark runs completed at tick `500`
- minimal polling: `22.585` ticks/sec
- active polling: `22.802` ticks/sec
- active/minimal ratio: `1.010`
- event-loop p95: `22.512 ms`
- event-loop max: `41.255 ms`

Active polling client-observed p95 latencies:

| Endpoint | p95 ms |
| --- | ---: |
| `/api/health` | `0.654` |
| `/api/sine/headless/runs/active` | `0.438` |
| `/api/sine/headless/runs/latest` | `2.112` |
| agents analysis | `1.954` |
| lineages analysis | `3.045` |
| agent detail analysis | `1.590` |
| trades analysis | `15.594` |
| events analysis | `1.309` |

Wrapped query p95 latencies remained low:

| Query bucket | p95 ms |
| --- | ---: |
| `headless.analysis.agents` | `0.490` |
| `headless.analysis.lineages` | `2.077` |
| `headless.analysis.agentDetail` | `0.451` |
| `headless.analysis.trades` | `14.367` |
| `headless.analysis.events` | `0.324` |

Comparison to the M1 backend report:

| Metric | M1 500-pop in-process | M11 500-pop isolated |
| --- | ---: | ---: |
| event-loop p95 | `1375.732 ms` | `22.512 ms` |
| event-loop max | `1594.884 ms` | `41.255 ms` |
| active health p95 | `1111.191 ms` | `0.654 ms` |
| active latest p95 | `1350.088 ms` | `2.112 ms` |
| active agents p95 | `1376.002 ms` | `1.954 ms` |
| active trades p95 | `1396.762 ms` | `15.594 ms` |

The benchmark also surfaced a real lock edge case before the final pass: active analysis reads could receive `database is locked` while the worker was writing. `server/sineHeadlessDb.mjs` now applies `PRAGMA busy_timeout = 5000`, and the final benchmark completed without lock errors.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
SINE_BENCHMARK_INSTRUMENTATION=1 SINE_HEADLESS_DB_PATH=/tmp/sine-m11-api.sqlite PORT=18788 npm run start:server
npx tsx scripts/sineApiLatencyBenchmark.ts --base-url http://127.0.0.1:18788 --ticks 500 --seed 101 --initial-spawners 500 --max-spawners 500 --chunk-ticks 25 --checkpoint-interval-ticks 100 --minimum-resolved-trades 1 --poll-interval-ms 100 --status-interval-ms 250
```

## Gate Status

- The selected approach reuses `src/sine/headless/runner.ts`: passed.
- No second headless simulation engine is created: passed.
- The isolated runner owns its repository and DB sink: passed for normal execution; parent fallback writes failure status only if the worker fails before completing persistence.
- IPC does not stream per-agent/per-trade rich records: passed in production job-manager path.
- IPC is limited to start, progress, cancel, timing, status, error, and final result messages: passed in production job-manager path.
- The boundary is keyed by `runId`: passed.
- One-active-run behavior remains enforced: passed.
- Active job state is managed through a `runId`-keyed handle/facade: passed.
- Cancel requests reach the isolated runner: passed.
- Cancel, progress, status, error, and completion messages are routed by `runId`: passed.
- Worker/process failure marks the run failed: passed by parent fallback behavior and existing interrupted/failure contracts.
- Progress, checkpoint, timing, status, and completion data remain available: passed.
- Existing headless routes preserve response shapes: passed.
- Existing `/api/sine/headless/runs/active` behavior remains backward-compatible: passed.
- The isolated runner writes through the same repository/sink contract: passed.
- Interrupted runs are marked failed: passed by existing test coverage.
- Cancelled runs are marked cancelled: passed.
- Completion, market-end, and extinction statuses remain correct: passed by existing headless tests.
- No production schema migration is introduced: passed; only a SQLite connection pragma was added.
- Same-seed isolated and non-isolated runs match under strict digest: passed.
- API p95 latency during active 500-population runs improves materially: passed.
- Progress updates are no longer blocked by long main-thread simulation chunks: passed by benchmark and active endpoint responsiveness.
- Wall-clock runtime is measured but not treated as the primary success metric: passed.
- `npm run check`, `npm run test:sine`, and `npm run build` pass: passed.

## Milestone Decision

Keep the worker-thread isolation implementation.

M11 resolves the backend responsiveness problem identified in M1 without changing simulation semantics. It does not make individual headless runs materially faster, but it keeps the server responsive while a run is active and creates the clean `runId`-keyed boundary needed for the future concurrency-limited scheduler milestone.
