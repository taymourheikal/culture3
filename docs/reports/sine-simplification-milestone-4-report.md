# Sine Simplification Milestone 4 Report

Milestone: `docs/plans/sine-simplification-performance-plan.md` Milestone 4.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
```

All commands completed successfully.

## Timing Samples

Both samples used:

- seed: `101`
- market source: `generated`
- target ticks: `500`
- initial/max population: `100 / 100`
- chunk size: `100`
- checkpoint interval: `100`
- minimum resolved trades: `1`

### Preflight: Direct Repository Writes

Captured before batching:

- run time: `6188.1 ms`
- advance total: `6132.2 ms`
- recorder event time: `424.0 ms`
- sink/write time: `437.3 ms`
- sink writes: `5031`
- top sink method: `writeTrade`, `293.9 ms / 3018 calls`
- latest chunk:
  - chunk: `1209.5 ms`
  - advance: `1209.2 ms`
  - recorder: `65.5 ms`
  - DB/write: `61.0 ms`
  - core estimate: `1143.7 ms`

### Postflight: Buffered And Batched Repository Writes

Captured after batching:

- run time: `6215.5 ms`
- advance total: `6145.9 ms`
- recorder event time: `16.9 ms`
- sink/write time: `48.3 ms`
- sink enqueues: `5031`
- sink flushes: `7`
- flushed rows: `5031`
- top enqueue method: `writeTrade`, `1.2 ms / 3018 calls`
- latest chunk:
  - chunk: `1212.4 ms`
  - advance: `1206.7 ms`
  - recorder: `4.4 ms`
  - DB/write: `5.9 ms`
  - enqueue: `0.3 ms`
  - flush: `5.7 ms`
  - flushed rows: `625`
  - core estimate: `1202.3 ms`

Row counts were identical:

| Row family | Count |
| --- | ---: |
| runs | 1 |
| agents | 102 |
| events | 106 |
| trades | 1527 |
| snapshots | 78 |
| metrics | 74 |
| checkpoints | 6 |

## Changes

- Added `src/sine/headless/bufferedSink.ts`, a headless-only buffered sink that preserves the existing `HeadlessRecordSink` recorder contract.
- Extended headless timing DTOs with enqueue/flush counters and latest-chunk flush diagnostics.
- Updated `runHeadlessSineExperiment()` to flush buffered rows after the initial checkpoint, each chunk checkpoint, completion, and failed-run status.
- Added `writeBatch()` to the headless repository sink and routed single-record and batch writes through shared row-writer helpers.
- Batched repository writes run inside a SQLite transaction.
- Updated the Runs page timing panel to show enqueue time, flush time, and flushed rows while preserving the existing DB/write metric.

## Functional Parity Evidence

- Existing headless deterministic run tests still pass.
- Existing headless DB isolation/cascade test still passes with the same representative row counts and agent/trade/snapshot/metric details.
- Existing headless job cancel test still passes.
- New tests cover:
  - buffered flush failure writes failed status
  - buffered finalization failure writes failed status
  - repository batch rollback after an injected write failure
  - market-end termination flushes completion/checkpoint records
  - timing fields for enqueue count, flush count, and flushed rows

## Repository Split Decision

The repository split step was intentionally skipped in this milestone.

Reason: batching stayed clear inside the existing repository facade after the sink methods were routed through shared row-writer helpers. Splitting now would create extra files without reducing duplication or clarifying ownership. A future split is still justified if analysis queries, row parsers, and write batching continue to grow together in `server/sineHeadlessRepository.mjs`.

## Plan Impact

Milestone 4 reduced headless recorder/sink overhead substantially, especially per-record `writeTrade` cost. It did not improve total runtime materially because core simulation/advance still dominates the chunk. The next high-value runtime target remains Milestone 5: brain effective-value and evaluation hot paths.
