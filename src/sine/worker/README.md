# Toy Market Worker Services

This directory contains support services used by `marketSimulation.worker.ts`.

## Files

- `packetScheduler.ts`: owns packet cadence and packet-size measurement timing for chart, roster, stats, and persistence packets.
- `uniquenessInspectionService.ts`: owns live uniqueness score caching, on-demand full-population uniqueness detail, and inspection packet creation.

## Worker Ownership Model

The Web Worker owns simulation state:

- market timeline
- spawner world
- backlog/catch-up ticks
- uniqueness caches
- persistence outbox

The main thread owns:

- React UI state
- canvases
- selected spawner state
- user controls
- historical fetch UI

Worker messages should remain small and predictable. Chart packets can be frequent; roster, stats, uniqueness, and full inspection data should be slower or on demand.

## Guidelines

Keep services stateless where practical, or make state ownership explicit through factory functions such as `createPacketScheduler()` and `createUniquenessInspectionService()`.

Do not import React or UI components here. If the Worker needs to expose new data, add it to `marketWorkerProtocol.ts` and build a lean packet in `packets/`.

## Verification

Run:

```bash
npm run test:sine
npm run check
```

For cadence changes, also run a browser smoke test and watch packet sizes in the Toy Market footer.
