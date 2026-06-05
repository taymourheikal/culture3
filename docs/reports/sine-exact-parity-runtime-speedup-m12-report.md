# Sine Exact-Parity Runtime Speedup M12 Report

## Milestone

Milestone 12: Concurrency-Limited Headless Scheduler.

## Summary

M12 replaces the effective one-active-headless-run model with a conservative active job registry:

- Default maximum concurrent headless runs: originally `2` in this milestone, later raised to `4` by follow-up user request.
- Override: `SINE_HEADLESS_MAX_CONCURRENT_RUNS`.
- Minimum capacity: `1`.
- No queue: starting over capacity returns `409`.
- Each active run owns an isolated worker and its own SQLite connection.
- The old `/api/sine/headless/runs/active` endpoint remains available.
- A new `/api/sine/headless/runs/active-list` endpoint returns all active jobs plus capacity state.

This is orchestration-only for simulation behavior. Same-seed strict digests are unchanged when a run executes beside an independent run.

## Implementation Notes

- Added `server/sineHeadlessConcurrency.mjs` for the concurrency policy.
- Extended `server/sineHeadlessJobs.mjs` from singleton-style active state to a `Map<runId, job>`.
- Added parent-side DB initialization before isolated workers launch.
- Split headless DB open into schema-initializing and lightweight modes so workers do not rerun schema/WAL setup concurrently.
- Added explicit SQLite lock retry around headless write sink calls and batch transactions.
- Updated the Runs UI to render multiple active run cards with independent cancellation and visible capacity state.
- Added `scripts/sineHeadlessConcurrencyBenchmark.ts` for one-run/two-run/cancel API benchmarks.

## SQLite Finding

The first concurrent test exposed a real bug: two workers opening a fresh headless DB could fail with `database is locked`.

Fixes applied:

- The parent scheduler initializes the DB path once before spawning workers.
- Isolated scheduler workers open the DB in lightweight mode after parent initialization.
- Standalone direct worker tests can still initialize normally.
- Write operations retry transient SQLite lock/busy errors.
- Batch writes use `BEGIN IMMEDIATE` so lock acquisition happens before batch mutation.

## Benchmarks

Temporary server:

```bash
SINE_HEADLESS_MAX_CONCURRENT_RUNS=2 \
SINE_BENCHMARK_INSTRUMENTATION=1 \
SINE_HEADLESS_DB_PATH=/tmp/sine-m12-bench.sqlite \
PORT=18791 \
npm run start:server
```

### One Active Run

Command:

```bash
npx tsx scripts/sineHeadlessConcurrencyBenchmark.ts \
  --base-url http://127.0.0.1:18791 \
  --concurrency 1 \
  --ticks 500 \
  --population 250 \
  --checkpoint-interval 100 \
  --chunk 100 \
  --out /tmp/sine-m12-concurrency-1.json
```

Result:

- Total ticks: `500`
- Total wall time: `11558.9 ms`
- Aggregate throughput: `43.26 ticks/sec`
- API p95: `0.85 ms`
- API max: `28.79 ms`
- Latest sampled DB/write time: `7.60 ms`
- Latest sampled core estimate: `2214.09 ms`

### Two Active Runs

Command:

```bash
npx tsx scripts/sineHeadlessConcurrencyBenchmark.ts \
  --base-url http://127.0.0.1:18791 \
  --concurrency 2 \
  --ticks 500 \
  --population 250 \
  --checkpoint-interval 100 \
  --chunk 100 \
  --out /tmp/sine-m12-concurrency-2.json
```

Result:

- Total ticks: `1000`
- Total wall time: `12226.0 ms`
- Aggregate throughput: `81.79 ticks/sec`
- API p95: `1.28 ms`
- API max: `23.04 ms`
- Run 1 wall time: `12021.9 ms`, `41.59 ticks/sec`
- Run 2 wall time: `12220.9 ms`, `40.91 ticks/sec`
- Latest sampled DB/write time: `21.45 ms` and `9.15 ms`
- Latest sampled core estimate: `2484.38 ms` and `2576.49 ms`

Interpretation:

- Two concurrent runs nearly double aggregate experiment throughput: `43.26 -> 81.79 ticks/sec`.
- Individual run speed drops slightly because the runs share CPU and DB bandwidth.
- API responsiveness remains good during concurrent runs.
- DB/write time increases under contention but remains much smaller than simulation compute time.

### Cancellation

Command:

```bash
npx tsx scripts/sineHeadlessConcurrencyBenchmark.ts \
  --base-url http://127.0.0.1:18791 \
  --concurrency 1 \
  --ticks 50000 \
  --population 100 \
  --checkpoint-interval 1000 \
  --chunk 100 \
  --cancel-after-ms 250 \
  --out /tmp/sine-m12-cancel.json
```

Result:

- Final status: `cancelled`
- Final tick: `200`
- Cancel latency: `1739.34 ms`
- API p95: `1.69 ms`
- Latest sampled DB/write time: `24.95 ms`

Interpretation:

- Cancellation remains chunk-boundary based.
- The measured latency includes waiting for the active simulation chunk and final persistence flush.

## Verification

Passed:

```bash
npm run check
npm run test:sine
npm run build
```

Additional UI smoke:

- Playwright rendered the Runs page with a mocked active-list response containing two active jobs.
- Verified two progress cards.
- Verified `2/2 active` capacity display during the original milestone smoke; a later follow-up smoke verified `4/4 active`.
- Verified Start is disabled at capacity.
- Verified each active card has its own Cancel button.

## Exit Gate Assessment

- Multiple headless runs can run concurrently: passed.
- Each run remains deterministic and isolated: passed by strict digest test beside a concurrent run.
- Cancelling one run does not affect another: passed.
- SQLite persistence remains correct under concurrent writers: passed after DB initialization and write retry hardening.
- UI can monitor all active runs: passed by Playwright smoke.
- Default concurrency is conservative and configurable: passed.
- Report separates aggregate throughput from individual run speed: passed.

## Recommendation

The original milestone recommendation was to keep the default at `2` pending target-machine evidence.

After a follow-up user request, the code default was raised to `4`. The environment override remains available for machines where four active runs are too much or where higher concurrency is intentionally being tested.
