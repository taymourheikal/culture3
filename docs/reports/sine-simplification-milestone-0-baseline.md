# Sine Simplification Milestone 0 Baseline

This note records the functional-parity fixtures and runtime baselines captured before the simplification/performance refactor begins. Later milestones should compare against this file when they touch market inputs, packets, headless writes, uniqueness, or brain evaluation.

## Environment

- Date: 2026-06-02
- Node: `v24.14.0`
- npm: `11.12.1`
- App/module: `src/sine`
- Verification command: `npm run test:sine`

## Fixture Coverage

Milestone 0 extends the existing Sine test suite rather than adding a parallel harness.

Relevant fixture files:
- `scripts/sine-tests/parityFixtures.test.ts`
- `scripts/sine-tests/marketInputs.test.ts`
- `scripts/sine-tests/brainEvaluation.test.ts`
- `scripts/sine-tests/uniqueness.test.ts`
- `scripts/sine-tests/workerProtocol.test.ts`
- `scripts/sine-tests/headless.test.ts`

Added or tightened anchors:
- Generated and candle-backed market-input golden vectors.
- Full brain-evaluation comparison for outputs, previous/current hidden state, active connection IDs, and activation maps.
- Functional uniqueness vector numeric anchors, feature count, feature keys, and selected trait values.
- Packet scheduler cadence assumptions for chart, stats, roster, persistence, forced posts, retry, and packet-size measurement.
- Headless DB row counts and representative parsed rows for run, checkpoint, trade, event, snapshot, and metrics data.

## Node Runtime Baseline

Command:

```bash
npx tsx scripts/sinePerf.ts
```

Settings:
- Seed: script default deterministic Sine setup.
- Market config: `INITIAL_MARKET_RUNTIME_CONFIG`.
- Spawner config: `DEFAULT_SPAWNER_CONFIG` with `initialSpawners = maxSpawners = population`.
- Populations: `100`, `250`, `500`.
- Advance ticks: `200`.
- Uniqueness population limit: `1000`.

### Advance Timing

| Benchmark | 100 pop | 250 pop | 500 pop |
| --- | ---: | ---: | ---: |
| Pure advance, 200 ticks | 2417.439 ms | 5935.966 ms | 12062.650 ms |
| Async sync-runner advance, 200 ticks | 2236.507 ms | 5873.516 ms | 11988.153 ms |
| Parallel-pool advance in Node, 200 ticks | 2226.535 ms | 5889.107 ms | 12147.174 ms |

Node parallel-pool values are fallback timings because `browserWorkerApiAvailable` was `false` in Node.

### Hot-Path Timing

| Benchmark | 100 pop | 250 pop | 500 pop |
| --- | ---: | ---: | ---: |
| RNN evaluate cached plan | 5.688 ms | 13.732 ms | 27.927 ms |
| RNN evaluate fresh plan | 7.541 ms | 19.433 ms | 38.052 ms |
| Persistence packet build | 41.104 ms | 101.492 ms | 208.025 ms |
| Uniqueness compute | 41.441 ms | 92.683 ms | 187.026 ms |
| Chart + roster + stats packets | 4.702 ms | 7.245 ms | 7.426 ms |

## Browser Worker Baseline

Command:

```bash
npx tsx scripts/sineBrowserPerf.ts
```

Settings:
- Browser: Chromium through Playwright.
- URL: `http://127.0.0.1:5173/sine.html`.
- Market config: `INITIAL_MARKET_RUNTIME_CONFIG`.
- Spawner config: `DEFAULT_SPAWNER_CONFIG` with `initialSpawners = maxSpawners = population`.
- Populations: `100`, `250`, `500`.
- Advance ticks: `200`.
- Parallel worker count: `4`.

| Benchmark | 100 pop | 250 pop | 500 pop |
| --- | ---: | ---: | ---: |
| Browser sync advance, 200 ticks | 1828.100 ms | 4516.300 ms | 9368.500 ms |
| Browser parallel 4-worker advance, 200 ticks | 2318.300 ms | 5217.800 ms | 10654.300 ms |

Browser worker parity command:

```bash
npm run test:sine:browser-parity
```

Result:
- Passed at `500` population for `40` ticks.
- Sync digest and browser-worker digest matched.
- Worker mode stayed parallel with no sync fallback or disabled batches.

## Packet Size Baseline

Command:

```bash
npx tsx scripts/sineMilestone0Baseline.ts
```

The script samples packet sizes with `estimatePacketKb` and then runs the headless timing baseline below.

Settings:
- Seed: `101`.
- Population: `250`.
- Tick: `50`.
- Market config: `INITIAL_MARKET_RUNTIME_CONFIG`.
- Spawner config: `DEFAULT_SPAWNER_CONFIG` with `initialSpawners = maxSpawners = 250`.
- Uniqueness population limit: `1000`.

| Packet | Size |
| --- | ---: |
| Chart | 198.4 KB |
| Roster | 159.8 KB |
| Stats | 13.2 KB |
| Persistence | 9362.9 KB |
| Architecture | 14.1 KB |
| Inspection | 28.4 KB |
| Uniqueness detail | 0.3 KB |

## Headless Timing Baseline

Command:

```bash
npx tsx scripts/sineMilestone0Baseline.ts
```

The script uses `runHeadlessSineExperiment()` with a temporary SQLite repository sink.

Settings:
- Run ID: `milestone-0-baseline`
- Seed: `101`
- Target ticks: `500`
- Chunk ticks: `100`
- Checkpoint interval ticks: `100`
- Minimum resolved trades: `1`
- Market config: `INITIAL_MARKET_RUNTIME_CONFIG`
- Spawner config: `DEFAULT_SPAWNER_CONFIG` with `initialSpawners = maxSpawners = 100`

Run result:
- Status: `completed`
- Termination reason: `target`
- Final tick: `500`
- DB rows: `runs=1`, `agents=102`, `events=106`, `trades=1527`, `snapshots=78`, `metrics=74`, `checkpoints=6`

Timing:

| Metric | Value |
| --- | ---: |
| Run ms | 6320.304 ms |
| Chunks | 5 |
| Simulated ticks | 500 |
| Advance total ms | 6277.461 ms |
| Recorder event ms | 420.795 ms |
| Recorder founder ms | 33.764 ms |
| Recorder finalize ms | 0.427 ms |
| Checkpoint ms | 1.503 ms |
| Candle load ms | 0 ms |
| DB / sink write ms | 424.727 ms |
| Sink writes | 5031 |
| Top sink method | `writeTrade`, 3018 calls, 287.667 ms |

Latest chunk:

| Metric | Value |
| --- | ---: |
| Start tick | 400 |
| End tick | 500 |
| Processed ticks | 100 |
| Population | 100 |
| Chunk ms | 1240.016 ms |
| Advance total ms | 1239.806 ms |
| Recorder event ms | 64.618 ms |
| DB / sink write ms | 60.309 ms |
| Simulation core estimate ms | 1175.188 ms |
| Ticks per second | 80.644 |

## Reporting Convention For Later Milestones

Each later milestone should report:
- Commands run.
- Seed, population, tick count, market config, and spawner config overrides.
- Before/after timing for the touched hot path.
- Whether results came from Node, browser sync, browser Worker, or headless SQLite.
- Functional parity evidence from `npm run test:sine` and any targeted browser/headless checks.
- Any accepted slowdown, with reason. Unexplained slowdown means the milestone is not complete.

For runtime changes, report at least one of:
- 100, 250, and 500 population live advance timing.
- RNN cached/fresh plan timing.
- Uniqueness compute timing.
- Packet build timing and packet sizes.
- Headless chunk timing split into simulation core, recorder, and DB/sink writes.
