# Sine Persistence Packet Weight Audit

Milestone: `docs/plans/sine-simplification-performance-plan.md` Milestone 2, Step 4.

This audit measures the live UI persistence packet contract only. It does not change persistence DTOs, SQLite schemas, server write behavior, or historical reconstruction behavior.

## Measurement

Command:

```bash
npx tsx scripts/sinePersistencePacketAudit.ts
```

Settings:

- source: generated market
- initial population: 250
- max population: 250
- state snapshot interval: 50 ticks
- uniqueness scores included for the measured packet tick

Results:

| Packet | Tick | Total KB | Births | Deaths | Genome Snapshots | State Snapshots | Food Events | Event Rows | Uniqueness |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial | 0 | 8610.8 | 250 / 4145.6 KB | 0 / 0 KB | 250 / 4150.3 KB | 250 / 232.3 KB | 0 / 0 KB | 0 / 0 KB | 250 / 78.1 KB |
| Steady state | 50 | 1298.9 | 0 / 0 KB | 0 / 0 KB | 0 / 0 KB | 250 / 745.7 KB | 1015 / 372.2 KB | 1015 / 97.9 KB | 250 / 78.4 KB |

Packet overhead outside the measured row-family arrays was about `4.5-4.7 KB`.

## Required Fields By Consumer

Birth rows:

- Server writes `sine_spawner_births` from the full birth spawner snapshot.
- Historical inspection needs a birth snapshot as the base reconstruction point.
- Birth lineage, parent, generation, plasticity, and genome facts support run analysis and future seed-bank reconstruction.

Death rows:

- Server writes `sine_spawner_deaths` from the death spawner snapshot.
- Historical inspection uses the death snapshot as authoritative state after death.
- Death rows preserve terminal energy, health, hidden state, learned state, and genome state at death.

Genome snapshots:

- Server writes both `genome_json` and `spawner_json`.
- Historical inspection uses latest genome snapshot at or before a requested tick.
- Seed-bank reconstruction needs exact genome, topology, mutation profile, perception, payoff profile, trading policy, and plasticity profile.

State snapshots:

- Server writes full `state_json` plus indexed scalar learning/plasticity columns.
- Historical inspection overlays live state only when the requested tick is before death.
- Exact continuation requires hidden state, learned state, payoff counters, recent payoffs, cooldown, energy, and health.

Food events:

- Server stores `food_json` for historical trade/event inspection.
- Food rows preserve creator ID, lineage, direction, strength, horizon, entry/exit signal, payoff scale, trace ID, payoff, and status.

Event rows:

- Server stores compact scalar event facts plus the event JSON.
- Run analysis and selected-agent inspection use events around the requested tick.

Uniqueness snapshots:

- Server writes score, raw distance, vector metadata, nearest neighbors, and feature explanations.
- Run analysis uses latest uniqueness rows for most-unique and most-typical summaries.

## Duplication Candidates

These are candidates only. They require a separate compatibility plan before implementation.

- Initial birth and genome snapshots each carry full spawner snapshots. At 250 population this duplicates about `4.1 MB` twice. A future packet shape could send one full founder snapshot plus a scalar birth row or a genome-only row, but old and new saved runs must both reconstruct correctly.
- Genome snapshot `spawner_json` overlaps birth/death `spawner_json`. Historical reconstruction currently uses this as a fallback, so removal would need a clear materialization path.
- State snapshots carry `plasticityProfile` and learned-state scalars that are also indexed into separate columns. The full state JSON is still needed for reconstruction, but scalar duplicates could be reviewed.
- Food events and compact event rows both include event identity, tick, spawner, lineage, and payoff facts. The compact event row is useful for querying; the food row is useful for trade reconstruction.
- Full uniqueness feature explanations are useful for inspection but could be sampled or separated from score-only rows in a future contract.

## Compatibility Gates For Any Future Thinning

- Old saved runs and new saved runs both open in historical inspection.
- Birth, death, genome, state, food, event, and uniqueness row counts remain explainable after migration.
- Dead-agent reconstruction still uses the death snapshot as authoritative after death.
- Exact continuation snapshots still include genome, hidden state, learned state, plasticity profile, trading policy, perception, payoff profile, and counters.
- Seed-bank reconstruction can rebuild eligible agents without reading live UI state.
- Server routes keep returning the same public shapes or include explicit version handling.
- No row family is dropped solely because it is large; every removed field must have a replacement source and a test.
