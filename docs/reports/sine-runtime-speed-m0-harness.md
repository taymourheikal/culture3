# Sine Runtime Speed Milestone 0 Harness

Milestone 0 adds benchmark-only support for later backend and simulation-speed research. The harnesses are intentionally narrow: they measure timing and isolation behavior without changing Sine reward, learning, mutation, reproduction, payoff, market input, or persistence semantics.

## Server Benchmark Instrumentation

Server timing is disabled by default.

Enable it only for benchmark runs:

```bash
SINE_BENCHMARK_INSTRUMENTATION=1 npm run start:server
```

When enabled, the server exposes:

- `GET /api/benchmark/timing`: event-loop delay, request timing buckets, query timing buckets, and the active headless DB path.
- `POST /api/benchmark/timing/reset`: clears benchmark buckets and resets the event-loop delay histogram.

The timing endpoint reports server-side request handler timing. Headless analysis query buckets wrap repository route handlers and may include row parsing/materialization, but not JSON response serialization. Client scripts still report client-observed latency separately.

## DB Isolation

The headless API does not accept a per-request `dbPath`. For API benchmarks, isolate benchmark data by starting the server with an explicit headless DB path:

```bash
SINE_BENCHMARK_INSTRUMENTATION=1 \
SINE_HEADLESS_DB_PATH=/tmp/sine-headless-benchmark.sqlite \
npm run start:server
```

This is a server startup configuration hook. Default production behavior remains unchanged when `SINE_HEADLESS_DB_PATH` is unset.

If API benchmarks are run against the default server DB, benchmark runs are written to the production headless DB. The API latency script labels this case in its JSON output. Cleanup should only target benchmark-created run IDs such as `benchmark-api-*`.

CLI/headless benchmarks can still use temporary DB paths directly through existing CLI options, because they do not depend on the API route.

## API Latency Harness

Run:

```bash
npm run sine:benchmark:api -- --ticks 500 --initial-spawners 100 --max-spawners 100
```

The script:

- verifies `/api/health`
- runs one headless pass with minimal status polling
- runs one headless pass with active endpoint polling
- reports client-observed p50, p95, max, and sample count per endpoint
- reports throughput for both passes
- includes server benchmark timing when `SINE_BENCHMARK_INSTRUMENTATION=1` is enabled

## Simulation Phase Harness

Run:

```bash
npm run sine:benchmark:phase -- --ticks 200 --initial-spawners 100 --max-spawners 100
```

The script:

- runs the existing Sine simulation engine with optional phase instrumentation
- reports phase timing buckets for the spawner world tick pipeline
- reports market feature timing buckets
- avoids persistence entirely

The phase and market-feature instrumentation objects are optional and inert by default. Normal Lab and headless runs do not record phase timings unless a benchmark explicitly passes instrumentation.

## Milestone 0 Verification

Required checks after harness changes:

```bash
npm run check
npm run test:sine
```

`npm run test:sine` is required because Milestone 0 touches shared Sine runtime modules.
