# Sine Follow-On Simplification Milestone 2 Report

Milestone: `docs/plans/sine-follow-on-simplification-audit-plan.md` Milestone 2.

Goal: remove avoidable scans and lookups in semi-hot runtime paths while preserving exact strategy-map, compact brain, selected-agent timeline, packet, and DTO behavior.

## Changes

- `src/sine/spawner/strategyMap.ts`
  - Added `groupStrategyMapPointsByCluster`.
  - Reused one grouped point representation for projected cluster centroids/radii and cluster-distance percentiles.
  - Removed repeated `points.filter(...)` passes for cluster membership.

- `src/sine/spawner/compactBrainEvaluation.ts`
  - Replaced repeated genome unit/connection `find(...)` lookups with plan-aligned arrays built from `CompiledBrainPlan` indexes.
  - Did not add any process-lifetime cache or separate genome-index abstraction.

- `src/sine/worker/packetRuntimeContext.ts`
  - Added packet-scoped `spawnerIndex()` ownership beside the existing packet-scoped food index.
  - Selected-spawner lookup and selected timeline sampling now reuse that packet-scoped spawner index.

- `src/sine/worker/selectedSpawnerTimelineService.ts`
  - Accepts an optional `SpawnerRuntimeIndex` for indexed selected-agent lookup.
  - Maintains rolling action counts instead of filtering the action window once per action rate.
  - Keeps direct-call fallback behavior for callers that do not provide a packet-scoped index.

- `scripts/sine-tests/selectedSpawnerTimeline.test.ts`
  - Tightened action-window coverage with exact expected long/short/wait rates after window trimming.

## Timing Notes

Milestone 0 baseline values are from `docs/reports/sine-follow-on-simplification-m0-report.md`. Post-change values were captured with the same local-machine benchmark shapes.

### Strategy Map Compute

Measured work: `preparePopulationFeatureSpace(world.spawners)` plus `buildPopulationStrategyMap(...)`.

| Population | M0 avg ms | M2 avg ms |
| --- | ---: | ---: |
| 100 | 39.143 | 43.897 |
| 250 | 64.588 | 70.199 |
| 500 | 135.556 | 147.768 |

The grouping refactor removes repeated cluster-membership scans and keeps output parity, but full strategy-map timing did not materially improve in this sample. No extra speculative strategy-map abstraction was added in this milestone.

### Compact Brain Payload Construction

Measured work: `compactJobFromBrainEvaluationJob(...)` with precompiled plans.

| Population | M0 avg payload ms | M2 avg payload ms |
| --- | ---: | ---: |
| 100 | 0.053877 | 0.047799 |
| 250 | 0.053006 | 0.043563 |
| 500 | 0.051609 | 0.042642 |

Compact payload construction improved after removing repeated genome lookups.

### Selected-Spawner Timeline Sampling

Measured work: `createSelectedSpawnerTimelineService().sample(...)` with prebuilt food and spawner indexes.

| Population | M0 avg sample ms | M2 avg sample ms |
| --- | ---: | ---: |
| 100 | 0.013265 | 0.005690 |
| 500 | 0.016293 | 0.006009 |
| 1000 | 0.021074 | 0.005323 |

This remains a low-cost path. The improvement is useful, but it should still be treated primarily as cleanup and packet-index ownership work.

## Verification

- `npm run check`: passed.
- `npm run test:sine`: passed.

## Milestone 2 Gate Status

- Runtime-adjacent DTO shapes and values are preserved by compact brain parity tests, strategy-map golden tests, selected-spawner timeline tests, and worker packet tests.
- Repeated strategy-map cluster membership filters are removed.
- Compact payload construction no longer performs repeated unit/connection linear lookups for each plan field.
- Packet runtime context owns the packet-scoped spawner index.
- Selected-spawner action rates use rolling counts and exact bounded-window tests.
- No new process-lifetime runtime cache was introduced.
