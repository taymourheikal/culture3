# Sine Exact-Parity Runtime Speedup M2 Report

## Summary

Milestone 2 investigated private food lifecycle indexing for high-action runs. The implementation preserved exact behavior in contract tests, but it did not pass the performance gate. The index shifted cost from `foodTrimming` into `foodResolution`, and total high-action runtime was slower than the post-M1 baseline.

The food-index implementation was not retained. Production remains on the current `world.foods` scan/trim path.

## Attempted Design

- Keep `world.foods` as the public ordered compatibility surface.
- Add private pending buckets keyed by `resolveTick`.
- Add resolved buckets keyed by `resolveTick` for retention trimming.
- Maintain per-creator pending counts for roster, selected-agent timeline, stats, and market-input density.
- Preserve same-tick resolution order and dead-creator policy.

## Result

The attempted design reduced `foodTrimming` to near-zero in high-action probes, but per-resolved-food lifecycle bookkeeping made `foodResolution` slower.

High-action probe against post-M1 benchmark:

| Population | M1 avg ms/tick | M2 probe avg ms/tick | M1 foodResolution ms | M2 probe foodResolution ms | M1 foodTrimming ms | M2 probe foodTrimming ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 250 | 24.833 | 29.445 | 1100.7 | 1341.7 | 77.1 | 1.0 |
| 500 | 51.179 | 56.955 | 2251.1 | 2622.6 | 161.2 | 0.5 |

## Decision

Defer food lifecycle indexing. Do not reintroduce it unless a future prototype proves that total food resolution plus retention time improves under high-action workloads before production integration.

Later milestones should compare against the post-M1 benchmark, not this rejected M2 probe.

## Verification

- `npm run check` passed during the attempted implementation.
- `npm run test:sine` passed during the attempted implementation.
- The attempted implementation was reverted because the speed gate failed.
