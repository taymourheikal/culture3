# Sine DB Write-Model Benchmark Plan

This plan gathers the benchmark evidence needed before deciding whether Lab saved runs and headless runs should keep separate DB/write models or move toward a unified persistence model.

The goal is measurement only. Do not implement Milestone 4 or Milestone 5 of `docs/plans/sine-follow-on-simplification-audit-plan.md` until these results are reviewed.

## Questions To Answer

- How much of current headless runtime is simulation compute versus recorder work versus SQLite writes?
- How much does headless write cost change with population, run length, and `minimumResolvedTrades`?
- How heavy is current Lab persistence by packet size and actual SQLite write time?
- Does the real browser Lab path remain responsive under current persistence load?
- Would adding headless-style rich records to Lab likely be cheap, risky, or clearly too expensive?

## Non-Goals

- Do not migrate, merge, rename, or reshape production DB tables.
- Do not write benchmark data into production DBs unless explicitly called out as a controlled browser smoke with cleanup.
- Do not change simulation, reward, mutation, learning, reproduction, death, uniqueness, or market-input semantics.
- Do not decide the DB architecture automatically from thresholds. Bring the results back for review.
- Do not implement M4/M5 run-analysis unification during this benchmark pass.

## Step 1: Current Headless Cost Across Populations

Use the existing headless script with temp DBs:

```bash
npx tsx scripts/sineHeadless.ts \
  --run-id db-tradeoff-current-100 \
  --ticks 5000 \
  --seed 101 \
  --market-source generated \
  --initial-spawners 100 \
  --max-spawners 100 \
  --minimum-resolved-trades 1 \
  --chunk-ticks 100 \
  --checkpoint-interval-ticks 100 \
  --db /tmp/sine-headless-current-100.sqlite
```

Repeat with `initial-spawners` and `max-spawners` set to `250` and `500`. Run each population at least three times.

Record:

- `timing.runMs`
- `timing.advanceTotalMs`
- `timing.recorderEventMs`
- `timing.recorderFounderMs`
- `timing.recorderFinalizeMs`
- `timing.checkpointMs`
- `timing.sinkWriteMs`
- `timing.sinkEnqueueMs`
- `timing.sinkFlushMs`
- `timing.sinkBufferedRows`
- `timing.topSinkMethod`
- `timing.sinkMethods`
- `timing.latestChunk`
- `counts`

Exit gates:

- Results exist for 100, 250, and 500 population.
- Each run writes only to a temp DB path.
- Each population has at least three samples.
- Results separate compute, recorder, DB enqueue, DB flush, and total DB/write time.
- Results identify the dominant write method, such as `writeTrade`, `writeSnapshot`, `writeMetrics`, or flush.

## Step 2: Pure Runtime Baseline

Run the existing runtime benchmark:

```bash
npx tsx scripts/sinePerf.ts
```

Use the pure advance rows as the runtime comparison point. Do not use browser-worker or parallel-pool rows for the DB write-model decision.

Record:

- pure advance timing at 100, 250, and 500 population
- RNN cached-plan timing at 100, 250, and 500 population
- persistence packet build timing at 100, 250, and 500 population
- uniqueness compute timing at 100, 250, and 500 population

Exit gates:

- Pure runtime timings exist for 100, 250, and 500 population.
- The report compares pure runtime against headless `simulationCoreEstimateMs`.
- The report states whether headless overhead is mostly compute, recorder, DB/write, or benchmark variance.
- Browser-worker and parallel-pool timings are labeled as unrelated to this DB-write decision.

## Step 3: Current Lab Persistence Packet Weight

Run the existing packet audit:

```bash
npx tsx scripts/sinePersistencePacketAudit.ts
```

Record:

- initial packet KB
- steady-state packet KB
- family counts and KB for births, deaths, genome snapshots, state snapshots, food events, events, and uniqueness snapshots
- steady-state event count

Exit gates:

- Initial and steady-state Lab packet weights are recorded separately.
- The largest Lab packet families are identified.
- The report distinguishes packet size from SQLite write time.
- The report explains what Lab already persists before any headless-style data is added.

## Step 4: Lab SQLite Write-Time Benchmark

Add a benchmark-only temp-DB harness if no existing script can safely do this. The harness should use the Lab persistence schema and write representative Lab persistence packets to a temp SQLite DB.

The benchmark should measure:

- initial Lab packet write time
- steady-state Lab packet write time
- rows written by family
- total DB file size after writes
- write time for a repeated sequence of steady-state packets

Implementation constraints:

- Use a temp DB, not `data/toy-market.sqlite`.
- Reuse the existing Lab packet builder and Lab persistence writer behavior as closely as possible.
- Do not add production schema migrations.
- Do not change the production Lab persistence path.

Exit gates:

- Lab SQLite write time is measured, not just packet build time.
- Initial and steady-state write costs are reported separately.
- Row counts and DB size are reported.
- The benchmark can be rerun without touching production saved runs.
- Any helper added for this benchmark is clearly benchmark-only or is a narrow reusable DB-opening helper with no behavior change.

## Step 5: Headless Eligibility Sensitivity

Run the headless benchmark at the same population, seed, ticks, chunk size, and checkpoint interval while varying `minimumResolvedTrades`:

- `1`
- `10`
- `50`

Suggested base shape:

```bash
npx tsx scripts/sineHeadless.ts \
  --run-id db-tradeoff-eligibility-250-mrt-1 \
  --ticks 5000 \
  --seed 101 \
  --market-source generated \
  --initial-spawners 250 \
  --max-spawners 250 \
  --minimum-resolved-trades 1 \
  --chunk-ticks 100 \
  --checkpoint-interval-ticks 100 \
  --db /tmp/sine-headless-eligibility-250-mrt-1.sqlite
```

Repeat for `10` and `50`.

Exit gates:

- Results show how eligibility threshold changes trades, snapshots, metrics, and total row counts.
- Results show how eligibility threshold changes recorder time and DB/write time.
- Results identify whether richer data capture remains cheap when many agents qualify.
- Results estimate the risk of writing headless-rich data for many or all Lab agents.

## Step 6: Longer-Run Growth Test

Run one longer headless sample with a temp DB:

```bash
npx tsx scripts/sineHeadless.ts \
  --run-id db-tradeoff-long-250 \
  --ticks 20000 \
  --seed 101 \
  --market-source generated \
  --initial-spawners 250 \
  --max-spawners 250 \
  --minimum-resolved-trades 1 \
  --chunk-ticks 100 \
  --checkpoint-interval-ticks 1000 \
  --db /tmp/sine-headless-long-250.sqlite
```

Record:

- final DB file size
- row counts
- total timing
- latest chunk timing
- top write method
- checkpoint count

Exit gates:

- Results show whether DB/write time grows as the run gets longer.
- Results distinguish steady overhead from late-run degradation.
- Final row counts and DB size are recorded.
- If only the final `latestChunk` is available, the report labels that limitation clearly.

## Step 7: Lab Runtime/Persistence Smoke Benchmark

Run a real browser Lab session through the existing UI path. This is necessary because Lab mode includes browser worker packet cadence, `postMessage` / structured-clone behavior, UI rendering, persistence outbox behavior, and server persistence ACKs.

Use fixed settings where practical:

- 100 population
- 250 population
- fixed seed
- fixed max population
- fixed runtime window, such as 1,000 to 5,000 ticks
- current Lab persistence mode

Measure or record:

- simulation tick progression
- backlog behavior
- persistence packet sizes when available
- UI responsiveness or visible stalling
- browser console errors
- server errors
- saved row counts after the run
- whether persistence ACKs keep up

Exit gates:

- The run is launched through the real browser Lab path, not only Node simulation.
- The run writes through the current Lab persistence path.
- The saved session uses a unique benchmark name or id and is cleaned up afterward if it touches the production Lab DB.
- Browser console and server logs have no relevant errors.
- The report includes whether current Lab persistence appears close to a responsiveness limit.
- The report explains any measurement that could not be captured with current instrumentation.

## Step 8: Results Packet For Review

Bring the benchmark results back for discussion. Do not make the DB architecture decision inside the benchmark plan.

The results packet should include:

- commands run
- date/time and machine context
- source DB paths used
- population, ticks, seed, market source, chunk size, checkpoint interval, and `minimumResolvedTrades`
- timing table for headless runs
- pure runtime comparison table
- Lab packet-size table
- Lab SQLite write-time table
- browser Lab smoke notes
- DB sizes and row counts
- notable variance across samples
- known limitations of the measurements

Exit gates:

- The evidence is sufficient to discuss separate DBs versus unified DB/write model.
- The evidence distinguishes runtime compute cost from recorder/write cost.
- The evidence includes both headless server-side cost and real browser Lab responsiveness.
- No M4/M5 implementation proceeds until the results are reviewed.
