# Sine Simplification Milestone 2 Report

Milestone: `docs/plans/sine-simplification-performance-plan.md` Milestone 2.

## Verification Commands

```bash
npm run check
npm run test:sine
npm run build
npx tsx scripts/sinePersistencePacketAudit.ts
npx tsx scripts/sinePerf.ts
```

All commands completed successfully.

## Runtime Comparison

`npx tsx scripts/sinePerf.ts`, single-run advance timings:

| Benchmark | Milestone 0 ms | Milestone 2 ms | Notes |
| --- | ---: | ---: | --- |
| Pure advance, 100 pop / 200 ticks | 2417.4 | 2493.6 | Small single-run slowdown. |
| Pure advance, 250 pop / 200 ticks | 5936.0 | 5866.3 | Slight improvement. |
| Pure advance, 500 pop / 200 ticks | 12062.7 | 11807.3 | Slight improvement. |
| Async sync-runner, 100 pop / 200 ticks | 2236.5 | 2347.0 | Small single-run slowdown. |
| Async sync-runner, 250 pop / 200 ticks | 5873.5 | 6133.7 | Small single-run slowdown. |
| Async sync-runner, 500 pop / 200 ticks | 11988.2 | 12191.6 | Small single-run slowdown. |
| Node parallel-pool fallback, 100 pop / 200 ticks | 2226.5 | 2243.5 | Browser Worker API unavailable in Node. |
| Node parallel-pool fallback, 250 pop / 200 ticks | 5889.1 | 5864.1 | About flat. |
| Node parallel-pool fallback, 500 pop / 200 ticks | 12147.2 | 11952.8 | Slight improvement. |

Packet and hot-path timings stayed broadly in the Milestone 0 range:

- persistence packet build: `42.3 / 103.9 / 203.0 ms` at `100 / 250 / 500` population
- uniqueness compute: `39.1 / 91.5 / 191.2 ms` at `100 / 250 / 500` population
- chart+roster+stats packets: `4.8 / 7.4 / 8.5 ms` at `100 / 250 / 500` population

## Persistence Packet Weight Audit

Detailed audit: `docs/audits/sine-persistence-packet-weight-audit.md`.

Measured with `npx tsx scripts/sinePersistencePacketAudit.ts`:

- initial 250-pop packet: `8610.8 KB`
- steady-state 50-tick packet: `1298.9 KB`
- initial packet is dominated by full birth snapshots and full genome snapshots
- steady-state packet is dominated by state snapshots and food events

No persistence DTO, SQLite schema, or server write behavior was changed in this milestone.

## Functional Parity Evidence

- Market-input golden vectors still pass for generated and candle-backed timelines.
- New market-feature context test proves pending-food density is appended separately from reusable market features.
- Packet shape fixtures still pass.
- Roster selection now uses bounded top-k helpers and the new test proves it matches the legacy bucket/sort behavior for a representative large population.
- Persistence packet builder, outbox, and repository tests still pass.
