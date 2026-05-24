# Food-Spawner RNN Core

This directory contains the neural food-spawner agents used by the Toy Market Simulator.

## What Lives Here

- `types.ts`: core spawner, genome, unit, connection, food, event, and telemetry types.
- `brain.ts`: GRU-like recurrent forward pass.
- `world.ts`: spawner population loop, action selection, food creation/resolution, death, reproduction, and telemetry.
- `reward.ts`: payoff-to-energy/health calculations.
- `marketInputs.ts`: observable inputs derived from recent market history.
- `perception.ts`: default, sanitization, mutation, summaries, and display rows for per-agent input-window settings.
- `mutationProfile.ts`: default, sanitization, drift, summaries, and display rows for per-agent mutation tendencies.
- `genome*.ts`: sparse recurrent genome creation, innovation IDs, mutation, topology rules, metrics, and validation.
- `events.ts`: structured event helpers.
- `uniqueness*.ts`, `robustDistance.ts`: functional genome vector, raw Mahalanobis distance, and population-relative uniqueness percentile.
- `config.ts`: default spawner settings and constants.
- `rng.ts`, `math.ts`: deterministic utility helpers.

## Architecture Rules

Inputs and outputs are fixed by the contract in `config.ts`. The current input contract has 16 slots. Perception can mutate the tick windows used to compute several inputs, but it must not change the slot order or meaning. Architecture mutation can add, disable, or re-enable hidden units and legal connections. Hidden units are GRU-like recurrent memory units with update, reset, and candidate gates.

Do not add React, DOM, storage, fetch, or canvas code here. This layer should be usable from tests, Workers, and persistence reconstruction without browser UI dependencies.

## Mutation And Reproduction

Spawner agents reproduce only through world rules in `world.ts`. Children inherit a mutated genome, perception settings, and mutation profile from the parent. Founder creation and child mutation should preserve genome validity; add or update contract tests when changing topology, perception, or mutation-profile rules.

Reward, payoff, sizing, death thresholds, reproduction eligibility, and brain-cost behavior are world/config rules. Do not hide those rules inside genome mutation helpers.

All timing in this layer is tick-based. Age, cooldown, food horizon, history retention, and RNN lag windows should be stored and reasoned about as ticks, not seconds.

## Verification

Run:

```bash
npm run test:sine
npm run check
```

Add focused tests in `scripts/sine-tests/` for any change to genome legality, forward-pass behavior, reward, reproduction, death, uniqueness, or telemetry.
