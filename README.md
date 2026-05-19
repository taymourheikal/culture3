# Emergent Ant World

Emergent Ant World is a local evolutionary simulation where simple agents forage, reproduce, mutate, fight, and die. Each agent has inherited traits and a small neural network. There is no training loop during an agent's lifetime; evolution happens because survivors reproduce and pass mutated traits and neural weights to children.

The app has two main modes:

- **Live**: watch one simulation unfold in the browser.
- **Batch**: run many simulations on the local backend and compare survivor outcomes.

## Features

- Canvas-based live world with colored lineages and food patches.
- Editable environment and agent defaults, saved locally in the browser.
- Per-lineage neural-network settings, including optional second hidden layer.
- Local SQLite persistence for snapshots, events, batch experiments, runs, and survivor summaries.
- Backend batch runner that continues running independently of browser tab throttling.
- Batch visualizations for survivor populations, traits, NN architectures, pairwise NN distance, behavioral similarity, and clustered weight heatmaps.
- In-app Help page explaining the simulation in non-technical terms.

## Project Structure

```text
src/sim/       Simulation core, genomes, neural networks, parameters
src/render/    Canvas camera and rendering helpers
src/client/    React UI panels, charts, persistence client, storage helpers
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

The backend creates `data/ant-world.sqlite` automatically. This is local runtime data and is intentionally ignored by git.

The database stores:

- live-world snapshots and birth/death events
- batch experiment metadata
- completed batch runs
- surviving lineage summaries
- averaged neural weight vectors

## Notes

The simulation is deterministic for a given seed and parameter set. Live view can be reset using saved defaults. Batch view uses the saved/default parameters passed to the backend when the job starts.
