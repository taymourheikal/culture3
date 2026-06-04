# Sine Simplification Milestone 3 Report

Milestone: `docs/plans/sine-simplification-performance-plan.md` Milestone 3.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sinePerf.ts
```

All commands completed successfully.

## Changes

- `src/sine/spawner/genomeIndex.ts` now partitions active/disabled units and active/disabled connections in one pass and groups active connections without repeated filter scans.
- `src/sine/spawner/uniquenessVectorModel.ts` now builds feature context from `GenomeIndex`, so layer counts, connection groups, recurrence metrics, and reachability metrics share the indexed topology path.
- `src/sine/spawner/uniquenessVector.ts` now builds a single `FunctionalGenomeSummary` per spawner and reuses its accumulators for gate counts, output counts, per-input weights, per-output weights, gate bias arrays, and grouped weight summaries.
- `scripts/sine-tests/uniqueness.test.ts` now includes golden anchors for vector keys/order/values and a full deterministic uniqueness detail fixture covering score, raw distance, active/dropped feature counts, nearest neighbors, and explanation ordering.

## Runtime Comparison

`npx tsx scripts/sinePerf.ts`, final Milestone 3 pass:

| Benchmark | Milestone 0 ms | Milestone 2 ms | Milestone 3 ms | Notes |
| --- | ---: | ---: | ---: | --- |
| Uniqueness compute, 100 pop | 41.4 | 39.1 | 34.6 | Improved versus both baselines. |
| Uniqueness compute, 250 pop | 92.7 | 91.5 | 80.0 | Improved versus both baselines. |
| Uniqueness compute, 500 pop | 187.0 | 191.2 | 162.5 | Improved versus both baselines. |
| Pure advance, 100 pop / 200 ticks | 2417.4 | 2493.6 | 2454.5 | About flat; uniqueness is not on every core advance path. |
| Pure advance, 250 pop / 200 ticks | 5936.0 | 5866.3 | 5786.1 | Slight improvement. |
| Pure advance, 500 pop / 200 ticks | 12062.7 | 11807.3 | 11703.0 | Slight improvement. |
| Persistence packet build, 100 pop | 42.3 | 42.3 | 41.0 | About flat. |
| Persistence packet build, 250 pop | 103.9 | 103.9 | 100.1 | Slight improvement. |
| Persistence packet build, 500 pop | 203.0 | 203.0 | 201.1 | About flat. |

Other final perf samples:

- RNN cached plan evaluation: `5.5 / 13.5 / 27.8 ms` at `100 / 250 / 500` population.
- Chart, roster, and stats packets: `4.2 / 6.8 / 8.4 ms` at `100 / 250 / 500` population.
- Node still reports `browserWorkerApiAvailable: false`, so the parallel-pool benchmark remains a sync fallback in this environment.

## Functional Parity Evidence

- `FUNCTIONAL_GENOME_VECTOR_VERSION` remains `functional-genome-v8`.
- Vector feature count, keys, ordering, labels, and representative numeric anchors are covered by golden fixtures.
- Full uniqueness score detail is covered by a deterministic fixture, including nearest-neighbor IDs and most-similar / most-dissimilar explanations.
- Existing roster uniqueness, uniqueness telemetry, worker packet, persistence packet, and repository tests still pass.
- Cluster-aware uniqueness remains future analysis work in `TODO.md`; this milestone did not change distance semantics, candidate interpretation, packet DTOs, or persistence row semantics.

## Plan Impact

Milestone 3 confirms that one-pass vector construction is worthwhile, especially at higher population sizes, but it does not materially change the broader runtime bottleneck. Core simulation and brain evaluation still dominate tick time. The remaining plan should continue to treat headless write throughput, uniqueness scoring shape, and brain/runtime hot paths as separate problems rather than expecting any one refactor to solve total simulation lag.
