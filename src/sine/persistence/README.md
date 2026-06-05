# Toy Market Persistence

This directory contains Worker-side persistence preparation for Toy Market sessions.

## Files

- `buildSinePersistencePacket.ts`: pure builder that maps current simulation state, pending events, and uniqueness scores into a `SinePersistencePacket`.
- `persistenceOutbox.ts`: delivery outbox with packet IDs, in-flight retry handling, event buffering, state snapshot cursors, initial snapshot handling, and uniqueness snapshot cursors.

## Flow

1. The Worker records spawner events into the outbox.
2. On a persistence interval, the outbox builds a packet.
3. The UI receives the packet and posts it to `/api/sine/snapshots`.
4. The UI sends `persistenceAck` back to the Worker.
5. The outbox clears buffered data only after a successful ack.
6. Failed packets are retried with the same packet ID and payload.

## What Gets Persisted

Packets may include:

- session settings and spawner config
- births and deaths
- genome snapshots
- state snapshots
- food spawn/resolve events
- raw spawner events
- uniqueness snapshots

## Guidelines

Keep packet building pure and testable. Do not put `fetch`, React state, server SQL, or browser UI logic here. Server-side storage belongs in `server/sineRepository.mjs` and writes to `data/toy-market.sqlite` through `server/sineDb.mjs`.

## Verification

Run:

```bash
npm run test:sine
```

Persistence behavior should be covered by `persistencePacket.test.ts`, `persistenceOutbox.test.ts`, and the split `sinePersistence*.test.ts` integration suites.
