# Sine Runtime Speed Milestone 1 Report

Milestone 1 asks whether the current backend stack limits Sine throughput, API responsiveness, or future scalability, and whether backend isolation, native/WASM, SQLite changes, or cloud hardware are likely to help.

## Short Answer

The backend stack is mainly limiting **responsiveness**, not raw simulation throughput. The active headless runner executes CPU-heavy work in the same Node process that serves HTTP, so API calls wait behind simulation chunks. At 500 population / 500 ticks, client-observed analysis endpoint p95 latency reached about 1.35-1.40 seconds, while the wrapped repository query p95 was only about 24 ms for the slowest analysis query. That points to event-loop blocking by simulation, not SQLite read cost.

Moving a whole headless run into a Node worker thread or child process is worth considering for API responsiveness and cancellation responsiveness. It should not be expected to materially improve wall-clock runtime by itself unless it also enables better parallelism or avoids contention. It can reuse the existing `src/sine` engine if the worker/process imports the same runner and owns the DB sink.

Native/WASM is plausible only if later Milestone 2 evidence shows a compact numeric kernel dominates runtime. Current evidence still points to object-heavy per-agent world evaluation, allocation, and serialization/materialization work. That makes native/WASM a medium-probability future path, not an immediate high-confidence speedup.

## Benchmark Setup

Machine:

- Apple M1 Pro
- 10 CPU cores reported by `sysctl`
- 8 performance cores and 2 efficiency cores reported by `sysctl`

Benchmark server:

```bash
PORT=18787 \
SINE_BENCHMARK_INSTRUMENTATION=1 \
SINE_HEADLESS_DB_PATH=/tmp/sine-headless-m1-api.sqlite \
npm run start:server
```

This used an isolated headless DB path, not the production headless DB.

API population benchmarks:

- generated market
- seed `101`
- 500 ticks
- `chunkTicks = 25`
- `checkpointIntervalTicks = 100`
- `minimumResolvedTrades = 1`
- fixed populations: 100, 250, 500
- compared no-poll, minimal status polling, and active endpoint polling

Chunk-size benchmarks:

- CLI/runtime path: 100 population / 1,000 ticks / temp DB per run / chunks 1, 10, 25, 50, 100, 250, 500, 1000
- Server/API path: 100 population / 500 ticks / isolated DB / chunks 1, 10, 25, 50, 100
- The API path stays within the current server cap: `MAX_JOB_CHUNK_TICKS = 100` in `server/sineHeadlessJobs.mjs`.

Instrumentation limits:

- Client scripts report end-to-end client-observed latency.
- Server request timing measures handler time after the event loop begins processing the request.
- Query timing wraps repository route handlers and includes row parsing/materialization, but not response JSON serialization.

## API Responsiveness

Population benchmark, `chunkTicks = 25`:

| Population | No-poll ticks/s | Minimal ticks/s | Active ticks/s | Active/min ratio | Event loop p95 ms | Event loop max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 106.135 | 102.522 | 113.430 | 1.106 | 249.299 | 448.266 |
| 250 | 40.830 | 42.134 | 40.601 | 0.964 | 636.486 | 657.981 |
| 500 | 19.088 | 19.182 | 18.794 | 0.980 | 1375.732 | 1594.884 |

The original 100-population active-polling pass looked faster than minimal polling. Per the plan gate, it was rerun with a larger sample: 1,500 ticks at 100 population still showed active polling faster than minimal polling, 105.456 ticks/s vs 97.220 ticks/s. Treat this as run-to-run noise at small population, not evidence that polling improves throughput. The 250 and 500 results show active endpoint polling has no large throughput penalty, but responsiveness still degrades heavily because simulation chunks block the event loop.

Idle latency before active jobs:

| Population benchmark | `/api/health` p95 ms | active job p95 ms | latest run p95 ms |
| --- | ---: | ---: | ---: |
| 100 setup | 0.628 | 0.546 | 2.890 |
| 250 setup | 0.657 | 0.563 | 6.468 |
| 500 setup | 0.518 | 0.637 | 5.517 |

Active job client-observed p95 latency:

| Population | health ms | active status ms | latest ms | agents ms | lineages ms | agent detail ms | trades ms | events ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 191.300 | 222.740 | 222.534 | 226.551 | 227.238 | 227.993 | 223.363 | 229.451 |
| 250 | 447.369 | 563.204 | 657.493 | 628.806 | 633.218 | 630.570 | 640.945 | 651.336 |
| 500 | 1111.191 | 1.194 | 1350.088 | 1376.002 | 1392.991 | 1369.422 | 1396.762 | 1352.830 |

The 500-population active-status p95 is low because the active-status samples mostly landed outside blocked windows in that pass; the other endpoints and event-loop histogram show the actual responsiveness problem.

Active job progress cadence, measured by polling active status every 100 ms and recording observed tick changes:

| Population | Tick update samples | First tick update ms | Avg interval ms | p50 interval ms | p95 interval ms | Max interval ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 19 | 560.538 | 240.295 | 240.971 | 259.954 | 259.954 |
| 250 | 20 | 530.682 | 607.167 | 607.647 | 632.297 | 632.297 |
| 500 | 20 | 1055.406 | 1329.521 | 1331.183 | 1419.363 | 1419.363 |

This cadence confirms that status/progress visibility is gated by chunk completion and event-loop availability. With `chunkTicks = 25`, progress becomes visibly coarse at 500 population.

Wrapped analysis query p95 during the same benchmark:

| Population | agents ms | lineages ms | agent detail ms | trades ms | events ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | 1.340 | 2.274 | 0.549 | 3.235 | 0.172 |
| 250 | 1.193 | 4.464 | 4.472 | 10.918 | 0.484 |
| 500 | 3.534 | 3.873 | 1.678 | 24.405 | 0.561 |

Conclusion: API responsiveness is dominated by event-loop availability, not analysis query runtime.

## Chunk Size And Yield Overhead

CLI/runtime path, 100 population / 1,000 ticks:

| Chunk ticks | Run ms | Advance ms | Sink write ms | Flushes | Chunks | Total ticks/s |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 10872.702 | 9381.683 | 306.682 | 974 | 1000 | 91.973 |
| 10 | 10115.197 | 9851.875 | 126.480 | 101 | 100 | 98.861 |
| 25 | 10069.485 | 9879.735 | 127.550 | 42 | 40 | 99.310 |
| 50 | 9665.641 | 9545.479 | 82.368 | 22 | 20 | 103.459 |
| 100 | 9852.839 | 9757.796 | 64.333 | 12 | 10 | 101.494 |
| 250 | 9478.942 | 9393.114 | 62.494 | 12 | 10 | 105.497 |
| 500 | 9661.588 | 9571.941 | 64.460 | 12 | 10 | 103.503 |
| 1000 | 9408.805 | 9315.748 | 60.058 | 12 | 10 | 106.283 |

Server/API path, 100 population / 500 ticks:

| Chunk ticks | Minimal ticks/s | Active ticks/s | Active/min ratio | Event loop p95 ms | Health p95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 90.645 | 86.445 | 0.954 | 26.984 | 25.827 |
| 10 | 97.182 | 106.724 | 1.098 | 109.314 | 71.687 |
| 25 | 108.225 | 107.921 | 0.997 | 238.158 | 215.872 |
| 50 | 111.532 | 100.644 | 0.902 | 519.307 | 481.539 |
| 100 | 107.550 | 104.015 | 0.967 | 984.089 | 1872.963 |

Interpretation:

- Chunk `1` is worst for throughput because yield/flush overhead dominates.
- Larger chunks reduce overhead but block the event loop longer.
- For API use, `10-25` is the best responsiveness/throughput range from this sample.
- For pure CLI/headless throughput, larger chunks are acceptable and slightly faster, but the gain is modest because advance/core compute dominates.
- Cancel responsiveness was not separately measured in this milestone. It is expected to follow chunk length because the current server checks cancellation between chunks.

## SQLite Read And Write Contention

Current write shape from `server/sineHeadlessWriteRepository.mjs` and `server/sineHeadlessStatements.mjs`:

- Writes are batched through `writeBatch()` in one explicit transaction.
- Append-only write path: `sine_headless_agent_events`.
- Upsert-heavy write paths: runs, checkpoints, agents, trades, snapshots, metrics.
- Death/eligibility and run progress also use updates.

Benchmark result:

- Wrapped read queries are low milliseconds, even while a simulation is active.
- The trade analysis query is the slowest read bucket, reaching 24.405 ms p95 at 500 population.
- Client-observed active endpoint latency is much higher because requests wait for event-loop access.

Conclusion: SQLite query/write contention is not the primary Milestone 1 bottleneck. A DB writer worker might improve responsiveness if writes later become bursty, but it is currently low value for wall-clock speed.

## Source Research

Primary/official sources:

- Node event loop guide: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
- Node `worker_threads`: https://nodejs.org/api/worker_threads.html
- Node `child_process`: https://nodejs.org/api/child_process.html
- Node `cluster`: https://nodejs.org/api/cluster.html
- Node `perf_hooks`: https://nodejs.org/api/perf_hooks.html
- Node `node:sqlite`: https://nodejs.org/api/sqlite.html
- Node N-API/native addons: https://nodejs.org/api/n-api.html
- Node WASI/WebAssembly support: https://nodejs.org/api/wasi.html
- WebAssembly overview/reference: https://webassembly.org/
- SQLite WAL: https://www.sqlite.org/wal.html
- SQLite transactions: https://www.sqlite.org/lang_transaction.html
- SQLite synchronous pragma: https://www.sqlite.org/pragma.html#pragma_synchronous
- AWS compute-optimized instance families: https://aws.amazon.com/ec2/instance-types/compute-optimized/
- Google Cloud machine families: https://cloud.google.com/compute/docs/machine-resource

Secondary benchmark articles:

- None used as decision evidence in this report. Native/WASM/cloud benchmark claims are intentionally deferred until Milestone 2 hot-path evidence identifies a specific candidate kernel.

## Backend Options

### Whole-run Node worker thread

Likely value:

- Major for API responsiveness.
- Low to moderate for wall-clock runtime unless worker isolation reduces contention or enables real parallelism.

Architecture:

- Can reuse `src/sine/headless/runner.ts` and the same engine.
- Best shape is for the worker to own the headless DB sink, so only lean progress, timing, status, and cancel messages cross the worker boundary.
- Avoid sending per-trade/per-agent records across the worker boundary if possible.
- Worker communication uses cloned/transferred messages, so payload design matters. The viable design batches control/progress/final messages and keeps rich write records inside the worker/process.

Minimum boundary data:

- start: run id, seed, target ticks, sanitized market config, sanitized spawner config, checkpoint interval, chunk size, minimum resolved trades, DB path or sink mode
- progress: tick, population, latest checkpoint summary, timing counters
- control: cancel request
- final: status, final tick, termination reason, error if any

### Whole-run child process

Likely value:

- Major for API responsiveness and crash/memory isolation.
- Low to moderate for wall-clock runtime.

Tradeoff:

- Cleaner isolation than a worker thread.
- Heavier startup and IPC.
- More operational complexity than worker threads.

### Cluster

Low value for this exact problem. Cluster helps distribute incoming connections across worker processes, but it does not by itself make a single active headless simulation faster. It could complicate active-job ownership unless the job runner is separately isolated.

### SQLite tuning or DB writer worker

Likely value:

- Low for wall-clock speed.
- Possible moderate responsiveness value if future writes become larger or burstier.

Current write batches already use explicit transactions. WAL is the relevant SQLite mode for concurrent reads/writes, but M1 data does not justify schema/write-model changes for speed.

### Native/WASM

Preliminary likelihood:

- Medium if Milestone 2 identifies a compact numeric kernel, such as brain evaluation over flattened arrays, that consumes a large share of advance time.
- Low if the dominant cost remains object graph traversal, per-agent allocation, branching world logic, persistence materialization, or JS/native boundary transfer.

Conditions that must be true for native/WASM to be worth prototyping:

- A specific hot path accounts for enough total advance time to pay for the refactor.
- Inputs/outputs can be represented as typed arrays or compact structs.
- The TypeScript engine remains canonical, or the native/WASM module is a narrow kernel with parity tests against the TypeScript implementation.
- Boundary crossings are batched; no per-agent/per-connection JS/native chatter.

Conditions that would make native/WASM low value:

- Most time is spent assembling inputs, updating JS objects, cloning records, or persisting data.
- The candidate kernel requires duplicating reward, lifecycle, learning, mutation, or persistence semantics.
- The boundary payload is larger than the saved compute.

### Cloud hardware

Cloud is not recommended yet as a primary speed strategy.

Why:

- More cores will not help much while a run is mostly single-threaded JavaScript.
- Higher single-core clock may help, but the expected gain is unknown without running the same benchmark on a candidate machine.
- Higher memory bandwidth may help only if Milestone 2 proves the hot path is bandwidth-bound rather than allocation/branching-bound.
- Cloud becomes more attractive after true parallelism, worker-process scaling, or native kernels exist.

Local benchmark to predict cloud benefit:

- compare phase/brain benchmark ticks per second, event-loop delay, and allocation pressure on the same seed/population/ticks before paying for cloud runs.

## Recommendations After M1

Ranked by likely value:

1. Major responsiveness value: isolate whole headless runs in a Node worker thread or child process, with the worker/process owning the DB sink.
2. High next research value: Milestone 2 hot-path analysis, especially brain evaluation, allocation, feature context, and serialization/materialization.
3. Moderate runtime value: tune chunk ranges by execution mode. API mode should prefer `10-25`; pure headless can use larger chunks if responsiveness is irrelevant.
4. Medium future value: native/WASM only if Milestone 2 finds a narrow numeric kernel with compact data.
5. Low current speed value: SQLite write-model changes or a DB writer worker.
6. Low current confidence: cloud hardware, unless the same benchmark demonstrates a measurable gain on a candidate instance.

## Milestone 1 Gate Audit

- Backend report exists: this document.
- M0 harness gates are satisfied: `docs/reports/sine-runtime-speed-m0-harness.md` documents the event-loop, API latency, DB isolation, query timing, and phase timing harnesses.
- API responsiveness was measured at idle and active 100/250/500 population with p50/p95/max available in the JSON artifacts.
- Throughput was measured with no polling, minimal status polling, and active endpoint polling.
- Active job progress cadence was measured at 100, 250, and 500 population.
- The surprising 100-pop active-polling result was rerun with a larger 1,500-tick sample and is labeled as noise, not as evidence.
- Chunk tradeoffs were measured in both CLI/runtime and Server/API paths, with API chunks constrained to the current server cap.
- SQLite query/read contention was measured during active runs; write shape was validated from the codebase.
- Official/primary backend references are listed above.
- Secondary benchmark evidence was not used for decisions.
- Backend options are ranked by expected wall-clock, responsiveness, and architecture value.
- Backend worker/process isolation is worth prototyping for responsiveness, not as a guaranteed wall-clock speedup.
