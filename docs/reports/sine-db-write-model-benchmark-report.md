# Sine DB Write Model Benchmark Report

Date: 2026-06-03

## Goal

Gather benchmark evidence for deciding whether Lab runs and headless runs should keep separate write models/DBs or move toward a unified run-storage model.

This report does not make the architecture decision. It records the benchmark data needed for that decision.

## Benchmark Context

- Machine: local development machine.
- Source mode: generated market data.
- Seed: `101` for headless benchmark runs unless noted otherwise.
- Temp DBs were used for headless and synthetic Lab write benchmarks.
- The browser Lab smoke used the existing dev server and existing Lab DB, then deleted its benchmark sessions.
- Output artifacts are under `data/db-write-benchmark/`.

## Commands Run

```bash
npm run check

npx tsx scripts/sineHeadless.ts --run-id db-tradeoff-current-<pop>-<sample> --ticks 5000 --seed 101 --market-source generated --initial-spawners <pop> --max-spawners <pop> --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 100 --db /tmp/sine-headless-current-<pop>-<sample>.sqlite

npx tsx scripts/sinePerf.ts
npx tsx scripts/sinePersistencePacketAudit.ts
npx tsx scripts/sineLabPersistenceWriteBenchmark.ts --population 250 --intervals 10 --interval-ticks 50 --seed 101

npx tsx scripts/sineHeadless.ts --run-id db-tradeoff-eligibility-250-mrt-<threshold> --ticks 5000 --seed 101 --market-source generated --initial-spawners 250 --max-spawners 250 --minimum-resolved-trades <threshold> --chunk-ticks 100 --checkpoint-interval-ticks 100 --db /tmp/sine-headless-eligibility-250-mrt-<threshold>.sqlite

npx tsx scripts/sineHeadless.ts --run-id db-tradeoff-long-250 --ticks 20000 --seed 101 --market-source generated --initial-spawners 250 --max-spawners 250 --minimum-resolved-trades 1 --chunk-ticks 100 --checkpoint-interval-ticks 1000 --db /tmp/sine-headless-long-250.sqlite

npx tsx scripts/sineLabPersistenceSmokeBenchmark.ts --populations 100,250 --min-tick 1000 --max-wait-ms 300000
```

## Step 1: Current Headless Cost

Fixed population, 5,000 ticks, 3 samples each.

| Population | Avg run ms | Min-Max run ms | Avg advance ms | Avg recorder ms | Avg DB/write ms | Avg core est ms | Avg ticks/sec | Avg DB size |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 42,835.93 | 42,518.41-43,026.80 | 42,289.05 | 153.08 | 464.96 | 42,135.97 | 116.73 | 24.5 MB |
| 250 | 107,466.61 | 104,967.67-110,190.87 | 106,609.27 | 261.48 | 736.98 | 106,347.79 | 46.54 | 44.3 MB |
| 500 | 258,637.01 | 258,402.00-258,839.81 | 256,465.65 | 696.19 | 2,021.26 | 255,769.46 | 19.33 | 126.4 MB |

Observed pattern:

- Core simulation advance dominates total time at all tested populations.
- DB/write time grows with population and trade volume, but remains much smaller than compute time in these 5,000-tick runs.
- At 500 population, DB/write averaged about 2.0 seconds out of about 258.6 seconds total.

## Step 2: Pure Runtime Baseline

From `scripts/sinePerf.ts`.

| Benchmark | 100 pop | 250 pop | 500 pop |
|---|---:|---:|---:|
| Pure advance, 200 ticks | 2,341.89 ms | 5,753.71 ms | 11,962.84 ms |
| Async sync-runner advance, 200 ticks | 2,374.07 ms | 5,619.92 ms | 11,184.76 ms |
| Parallel-pool advance, 200 ticks | 2,051.09 ms | 5,378.75 ms | 10,999.08 ms |
| RNN cached plan eval | 4.26 ms | 10.56 ms | 22.05 ms |
| RNN fresh plan eval | 8.86 ms | 21.31 ms | 47.13 ms |
| Persistence packet build | 44.86 ms | 105.29 ms | 212.41 ms |
| Uniqueness compute | 39.98 ms | 82.20 ms | 166.37 ms |
| Chart + roster + stats packets | 4.63 ms | 7.44 ms | 8.76 ms |

Observed pattern:

- Pure runtime cost scales materially with population.
- Persistence packet building and uniqueness are noticeable but not as large as simulation advance.
- Browser Worker API was unavailable in this Node-side benchmark path, so the parallel rows are not browser-worker parity evidence.

## Step 3: Lab Packet Weight

From `scripts/sinePersistencePacketAudit.ts`, 250 population.

| Packet | Total KB | Largest contributors |
|---|---:|---|
| Initial | 8,610.8 KB | births 4,145.6 KB, genome snapshots 4,150.3 KB, state snapshots 232.3 KB, uniqueness 78.1 KB |
| Steady after 50 ticks | 1,298.9 KB | state snapshots 745.7 KB, food events 372.2 KB, events 97.9 KB, uniqueness 78.4 KB |

Observed pattern:

- Initial Lab persistence packets are dominated by birth and genome snapshot payloads.
- Steady packets are dominated by state snapshots and food/event data.
- If Lab and headless schemas are unified, packet-size pressure is a real concern for Lab runs even if SQLite write time is not the main headless bottleneck.

## Step 4: Lab SQLite Write-Time Benchmark

From `scripts/sineLabPersistenceWriteBenchmark.ts`, 250 population, 10 steady writes, 50 ticks per interval.

| Metric | Value |
|---|---:|
| Initial write | 153.246 ms |
| Steady write count | 10 |
| Steady avg write | 31.715 ms |
| Steady min write | 19.771 ms |
| Steady max write | 39.243 ms |
| Final tick | 500 |
| DB size | 50.2 MB |

Rows written:

| Table | Rows |
|---|---:|
| `sine_sessions` | 1 |
| `sine_spawner_births` | 251 |
| `sine_spawner_deaths` | 4 |
| `sine_spawner_genome_snapshots` | 251 |
| `sine_spawner_state_snapshots` | 2,744 |
| `sine_food_events` | 6,082 |
| `sine_events` | 6,087 |
| `sine_spawner_uniqueness_snapshots` | 2,744 |

Observed pattern:

- Lab SQLite writes are measurable but fairly small compared with simulation advance time.
- The first write is expensive because it includes all initial births and genome snapshots.
- Steady writes are mostly in the 20-40 ms range for this scenario.

## Step 5: Headless Eligibility Sensitivity

250 population, 5,000 ticks, varying `minimumResolvedTrades`.

| Minimum resolved trades | Run ms | Advance ms | Recorder ms | DB/write ms | Eligible agents | DB size | Trades |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 107,030.74 | 106,237.22 | 249.71 | 695.68 | 280 | 38.7 MB | 16,608 |
| 10 | 104,424.38 | 103,679.64 | 237.37 | 610.07 | 191 | 32.7 MB | 16,140 |
| 50 | 102,333.26 | 101,754.16 | 232.55 | 475.61 | 75 | 22.5 MB | 13,382 |

Observed pattern:

- Raising eligibility thresholds reduces eligible-agent rows, snapshots, DB size, and DB/write time.
- It does not materially change the core simulation cost because agents still run and trades still resolve before eligibility filtering affects capture.
- This is useful for storage control, not a primary runtime-speed lever.

## Step 6: Long-Run Growth

250 population, 20,000 ticks, `minimumResolvedTrades = 1`.

| Metric | Value |
|---|---:|
| Run time | 558,353.94 ms |
| Advance time | 545,694.48 ms |
| Recorder time | 2,030.98 ms |
| DB/write time | 12,298.47 ms |
| Checkpoint time | 11.73 ms |
| DB size | 281.2 MB |
| Eligible agents | 639 |
| Agents | 708 |
| Trades | 307,811 |
| Snapshots | 1,487 |
| Metrics | 639 |
| Checkpoints | 21 |

Latest 100-tick chunk:

| Metric | Value |
|---|---:|
| Chunk ms | 3,412.99 |
| Advance ms | 3,302.80 |
| Recorder ms | 12.25 |
| DB/write ms | 109.79 |
| Core estimate ms | 3,290.55 |
| Ticks/sec | 29.30 |

Observed pattern:

- Long-run DB/write time becomes larger in absolute terms, but compute still dominates.
- In the full 20,000-tick run, DB/write was about 12.3 seconds out of about 558.4 seconds.
- The latest chunk shows DB/write can spike above 100 ms per 100 ticks, but the core estimate was still about 3.29 seconds for that same chunk.

## Step 7: Lab Runtime/Persistence Smoke Benchmark

Real browser Lab path, fixed generated populations, 1,000+ saved ticks.

| Population | Elapsed ms | Latest tick | Saved config | Births | Deaths | Persistence POSTs | Avg POST KB | Max POST KB | Non-200 |
|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 100 | 189,173 | 1,047 | 100 / 100 | 104 | 7 | 224 | 63.18 | 3,417.9 | 0 |
| 250 | 183,426 | 1,012 | 250 / 250 | 257 | 12 | 237 | 130.95 | 8,532.8 | 0 |

Browser smoke notes:

- `ok: true`
- `serverMode: existing-server`
- `productionDbTouched: true`
- Benchmark sessions were deleted after the smoke.
- Console errors: none.
- Page errors: none.
- Visible runtime metric labels were present for tick speed, backlog, persistence, and brain evaluation.

Harness correction made during this benchmark:

- The first browser smoke attempt did not reliably set fixed population through the sidebar.
- The harness now seeds the same saved Lab settings keys the app reads at startup and asserts persisted session config before accepting the result.
- The timeout gate now fails if the run does not reach `minTick`; it no longer soft-passes an incomplete run.

## Step 8: Results Packet

Artifacts:

- `data/db-write-benchmark/headless-current-100-1.json`
- `data/db-write-benchmark/headless-current-100-2.json`
- `data/db-write-benchmark/headless-current-100-3.json`
- `data/db-write-benchmark/headless-current-250-1.json`
- `data/db-write-benchmark/headless-current-250-2.json`
- `data/db-write-benchmark/headless-current-250-3.json`
- `data/db-write-benchmark/headless-current-500-1.json`
- `data/db-write-benchmark/headless-current-500-2.json`
- `data/db-write-benchmark/headless-current-500-3.json`
- `data/db-write-benchmark/sinePerf.txt`
- `data/db-write-benchmark/lab-packet-audit.json`
- `data/db-write-benchmark/lab-write-250.json`
- `data/db-write-benchmark/headless-eligibility-250-mrt-1.json`
- `data/db-write-benchmark/headless-eligibility-250-mrt-10.json`
- `data/db-write-benchmark/headless-eligibility-250-mrt-50.json`
- `data/db-write-benchmark/headless-long-250.json`
- `data/db-write-benchmark/lab-browser-smoke.json`

Decision-relevant evidence:

- Headless runtime is dominated by simulation advance, not DB writes, in all measured cases.
- Headless DB/write cost is still nontrivial for long runs and scales with trade volume and captured rows.
- Lab packet payload size is a stronger concern than raw SQLite write time, especially initial genome/birth snapshots and steady state snapshots.
- Eligibility thresholds reduce storage and write work, but they do not meaningfully change simulation compute cost.
- The real browser Lab smoke confirmed fixed-population Lab persistence works and showed no console/page errors, but it is slow enough that UI-path runtime should be considered separately from SQLite write cost.

Limitations:

- All simulation benchmarks used generated market data and seed `101`.
- Headless long-run growth was one 20,000-tick sample, not a variance study.
- Browser smoke used the existing dev server and current machine load, then cleaned up its sessions.
- The benchmark does not compare alternative schemas directly. It measures the current model so we can decide whether a schema/write-model redesign is worth prototyping.

## Exit Gate Audit

- Step 1: Passed. Three samples each at 100, 250, and 500 population were recorded with timing, row counts, and DB sizes.
- Step 2: Passed. Pure runtime, RNN, packet-build, uniqueness, and UI packet baselines were recorded.
- Step 3: Passed. Initial and steady Lab packet families were measured by payload size.
- Step 4: Passed. A benchmark-only Lab SQLite write harness wrote to a temp DB and reported initial/steady write time, rows, and DB size.
- Step 5: Passed. Eligibility thresholds 1, 10, and 50 were benchmarked at 250 population.
- Step 6: Passed. A 20,000-tick 250-population headless run completed with DB size, row count, and timing data.
- Step 7: Passed. Real browser Lab smoke completed fixed 100 and 250 population runs beyond 1,000 ticks, captured payload sizes, verified no page/console errors, and cleaned up sessions.
- Step 8: Passed. Results are recorded in this report with commands, tables, artifacts, limitations, and decision-relevant observations.
