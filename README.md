# Emergent Ant World

Emergent Ant World is a local evolutionary simulation where simple agents forage, reproduce, mutate, fight, and die. Each agent has inherited traits and a small neural network. There is no training loop during an agent's lifetime; evolution happens because survivors reproduce and pass mutated traits and neural weights to children.

The app has two main modes:

- **Live**: watch one simulation unfold in the browser.
- **Batch**: run many simulations on the local backend and compare survivor outcomes.
- **Toy Market Simulator**: open `sine.html` to run a separate recurrent food-spawner experiment on a generated or BTC/USD market signal.

## Features

- Canvas-based live world with colored lineages and food patches.
- Editable environment and agent defaults, saved locally in the browser.
- Per-lineage neural-network settings, including optional second hidden layer.
- Local SQLite persistence for snapshots, events, batch experiments, runs, and survivor summaries.
- Backend batch runner that continues running independently of browser tab throttling.
- Batch visualizations for survivor populations, traits, NN architectures, pairwise NN distance, behavioral similarity, and clustered weight heatmaps.
- In-app Help page explaining the simulation in non-technical terms.
- Toy Market food-spawner RNN inspection by live ID, browser console helper, and historical SQLite lookup, including mutable perception and mutation-profile traits.

## Project Structure

```text
src/ant/sim/       Ant World simulation core, genomes, neural networks, parameters
src/ant/render/    Ant World canvas camera and rendering helpers
src/ant/client/    Ant World React panels, charts, persistence client, storage helpers
src/sine/          Toy Market Simulator, RNN food spawners, charts, and inspector UI
server/        Local Node API, SQLite schema, batch job runner
scripts/       Headless batch CLI
data/          Generated local SQLite and analysis output, ignored by git
```

## Requirements

- Node.js 24 or newer recommended. The backend uses `node:sqlite`.
- npm

## Setup

```bash
npm install
```

## Development

Run the frontend and local backend together:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173
http://127.0.0.1:5173/sine.html
```

Useful commands:

```bash
npm run check      # TypeScript project check
npm run build      # Type-check and build frontend
npm run preview    # Preview production build
```

Run only one side:

```bash
npm run dev:client
npm run dev:server
```

## Batch Simulations

From the browser, use the **Batch** tab to start server-side experiments. Results are saved to SQLite and can be loaded or deleted from the saved batch widget.

From the CLI:

```bash
npm run sim:batch -- --runs 100 --ticks 35000 --seed 184203 --out data/batch.json
```

Batch output summarizes surviving lineages at `StopTick`, including average traits and averaged neural weights across living agents in each surviving lineage.

## Persistence

The backend creates separate local SQLite databases. These are runtime data and are intentionally ignored by git.

```text
data/ant-world.sqlite   # Emergent Ant World live snapshots and batch experiments
data/toy-market.sqlite  # Toy Market sessions, spawners, genomes, states, food events, uniqueness
```

The Ant World database stores:

- live-world snapshots and birth/death events
- batch experiment metadata
- completed batch runs
- surviving lineage summaries
- averaged neural weight vectors

The Toy Market database stores sessions, spawner births/deaths, genome snapshots, state snapshots, food events, raw spawner events, and uniqueness snapshots. Genome snapshots include each spawner's RNN architecture, perception settings, and mutation profile. Uniqueness snapshots store the population-relative percentile and raw distance calculated from architecture, wiring, weights, perception settings, and selected mutation-profile traits.

After upgrading an existing Toy Market database from the old deterministic reproduction gates, run:

```bash
npm run db:sine-reproduction-output
```

This removes obsolete reproduction gate keys from saved session config JSON.

To split older shared databases, stop the local API server and run:

```bash
npm run db:split
```

The migration copies `sine_*` tables into `data/toy-market.sqlite`, verifies row counts and foreign keys, then removes the old `sine_*` tables from `data/ant-world.sqlite`.

Toy Market live inspection is available in the browser UI by spawner ID. Inspection shows the RNN graph, input labels, current perception windows, mutation profile, recent state, and uniqueness detail. For programmatic inspection while a run is live:

```js
await window.inspectFoodSpawner(471)
```

Historical Toy Market inspection uses a SQLite session ID plus spawner ID, because spawner IDs are scoped to one session.

## Notes

The simulation is deterministic for a given seed and parameter set. Live view can be reset using saved defaults. Batch view uses the saved/default parameters passed to the backend when the job starts.
