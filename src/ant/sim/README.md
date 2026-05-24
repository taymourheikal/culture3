# Ant World Simulation Core

This directory contains the deterministic simulation core for Emergent Ant World.

## Main Files

- `types.ts`: world, agent, lineage, event, genome, and parameter types.
- `parameters.ts`: defaults, sanitization, cloning, and parameter merging.
- `world.ts`: world creation, stepping, snapshots, and top-level simulation flow.
- `worldActions.ts`: movement, attacks, reproduction, and action effects.
- `worldFood.ts`: food placement and food interactions.
- `worldLineages.ts`: lineage initialization and lineage metadata.
- `worldSensing.ts`: neural-network input construction.
- `brain.ts`, `genome.ts`: agent neural network execution and inherited genome behavior.
- `batch.ts`, `batchNeuralSummary.ts`: headless batch runs and survivor neural summaries.
- `rng.ts`, `math.ts`: deterministic random and numeric helpers.

## Boundaries

This layer should not import React, canvas, DOM, localStorage, fetch, or SQLite. It should be usable from the browser, server batch workers, and CLI scripts.

All world behavior should flow through explicit parameters where practical. Avoid hardcoded gameplay constants inside step logic unless they are true invariants.

## Determinism

For the same seed and sanitized parameter set, simulation outcomes should be repeatable. Be careful when changing random call order, reproduction allocation, lineage initialization, or batch summary logic.

## Verification

Run:

```bash
npm run check
npm run build
```

For batch behavior, also run a small CLI batch:

```bash
npm run sim:batch -- --runs 3 --ticks 1000 --seed 1 --out data/smoke-batch.json
```
