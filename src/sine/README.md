# Toy Market Simulator

This directory contains the standalone ROC Signal Lab frontend and simulation runtime. It is separate from Emergent Ant World and is served by `sine.html`.

## Main Pieces

- `main.tsx`, `SineApp.tsx`: React entrypoint and top-level view switch.
- `SineLabView.tsx`: live simulator screen, chart canvas orchestration, roster, historical inspector, and sidebar.
- `useMarketSimulationWorker.ts`: UI-facing Worker bridge. It owns React state for lean packets, commands, inspection requests, and persistence acknowledgements.
- `marketSimulation.worker.ts`: simulation loop owner. It runs the market timeline and spawner world off the React thread.
- `marketWorkerProtocol.ts`: typed command and packet contract between UI and Worker.
- `charts/`: canvas chart rendering.
- `packets/`: lean Worker packet builders for chart, roster, stats, telemetry, and inspection data.
- `spawner/`: food-spawner RNN genome, mutable perception, mutation/plasticity inheritance, lifetime learning, world, reward, and uniqueness logic.
- `persistence/`: browser-to-server persistence packet assembly and retry outbox.
- `worker/`: Worker-side scheduling and inspection services.
- `styles/`: CSS imported by `sine.css`.

The spawner RNN output contract is centralized in `spawner/config.ts`. It currently exposes six outputs: long, short, strength, horizon, cooldown, and reproduce. Reproduction is probabilistic: the RNN output sets the chance of birth, while the world still enforces energy and population-cap eligibility.

The input contract is fixed at 16 slots. Per-agent `perception` settings decide which tick windows are used to calculate several market-derived inputs, but the slot meanings and order do not change. Per-agent `mutationProfile` settings decide how descendants mutate topology, weights, biases, perception, control genes, and the mutation profile itself. Per-agent `plasticityProfile` settings decide how strongly reward-modulated learned deltas form, decay, and mutate across descendants.

Spawner brains use an effective genome view. During life, learned neural deltas affect connection weights, output biases, and hidden gate biases without mutating the base genome in place. During reproduction, the parent's effective neural values are materialized into the child seed genome before ordinary mutation, while the child's own learned overlay starts empty.

Brain evaluation is selected per simulation tick. Below the configured parallel threshold, the market Worker evaluates spawner brains synchronously inside the simulation Worker. At or above the threshold, it uses nested brain-evaluation Workers when the browser supports them. If population crosses the threshold during a tick, the new mode applies on the next tick selection; if population drops below the threshold, evaluation switches back to sync. Parallel mode is an optimization for high populations, not a guaranteed win at every population.

The brain-evaluation pool reports its effective mode. Repeated worker failures or timeouts temporarily disable parallel evaluation and fall back to sync immediately, so the footer should show `sync` while the pool is disabled. Pause and stop update run state immediately but take effect at the next tick boundary: an in-flight tick may finish, and no new ticks start afterward. Reset and new-session paths still invalidate in-flight brain work.

Toy Market simulation time is tick-first. Generated mode treats one tick as one generated bar; BTC modes treat one tick as one candle. Seconds should only appear as playback speed controls such as ticks per second or bars per second. Horizons, cooldowns, history windows, chart windows, and RNN lag inputs should be expressed in ticks.

## Boundaries

Keep React components out of `spawner/`, `packets/`, `persistence/`, and `worker/`. Those modules should stay deterministic or message-oriented where possible.

Keep large simulation state in the Worker. UI packets should remain lean and should not send full history every frame. Full genome and hidden-state data should be requested only through inspection flows.

Roster packets should carry compact summaries only. Full perception and mutation-profile details belong in live or historical inspection payloads.

## Verification

For changes here, run:

```bash
npm run check
npm run test:sine
npm run build
```

Run `npm run db:sine-reproduction-output` after upgrading an existing Toy Market database from the old deterministic reproduction gates. The migration removes obsolete reproduction gate keys from saved session config JSON without changing table schemas or genome snapshots.

Use Playwright or a browser smoke test when touching canvas rendering, sidebars, modals, or Worker packet cadence.

Run `npm run test:sine:browser-parity` after changing browser brain-evaluation Worker behavior.
