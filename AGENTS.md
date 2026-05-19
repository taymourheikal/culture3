# Repository Guidelines

## Project Structure & Module Organization

This repository is a local browser simulation built with Vite, React, TypeScript, and a small Node SQLite API.

- `src/sim/`: deterministic simulation core. Keep React and DOM APIs out of this layer.
- `src/render/`: canvas rendering and camera helpers.
- `src/client/`: React sidebar panels, persistence client, and browser storage helpers.
- `src/App.tsx`: app shell, animation loop, reset behavior, and tab composition.
- `server/index.mjs`: local SQLite persistence API.
- `scripts/`: headless tooling, including batch simulation runs.
- `data/`: generated SQLite files; do not treat as source.
- `emergent-ant-world-v0-spec.md`: product/spec reference.

There is currently no dedicated `tests/` directory.

## Build, Test, and Development Commands

- `npm run dev`: starts both Vite on `127.0.0.1:5173` and the SQLite API on `127.0.0.1:8787`.
- `npm run dev:client`: starts only the Vite frontend.
- `npm run dev:server`: starts only the SQLite backend in watch mode via `tsx`.
- `npm run start:server`: starts only the SQLite backend without watch mode via `tsx`.
- `npm run check`: runs TypeScript project checks with `tsc -b`.
- `npm run build`: type-checks and builds the production frontend into `dist/`.
- `npm run sim:batch -- --runs 100 --ticks 5000 --out data/batch.json`: runs headless simulations and writes survivor summaries.
- `npm run preview`: serves the built frontend locally.

## Coding Style & Naming Conventions

Use TypeScript with strict types. Prefer explicit domain types in `src/sim/types.ts` and centralized defaults in `src/sim/parameters.ts`. Use two-space indentation, `camelCase` for variables/functions, `PascalCase` for React components and exported types, and descriptive file names such as `ParameterPanel.tsx`.

Keep simulation logic pure and deterministic where practical. UI components should read/write parameters through typed objects rather than duplicating constants.

## Testing Guidelines

No formal test runner is configured yet. Before submitting changes, run:

```bash
npm run check
npm run build
```

For simulation behavior, add small `npx tsx` probes or introduce focused tests before changing core mechanics. Verify UI changes manually in the browser, especially sidebar tabs and reset behavior.

## Commit & Pull Request Guidelines

This directory has no Git history, so no established commit convention exists. Use concise imperative commits, for example `Add agents parameter tab` or `Fix lineage initialization`.

Pull requests should include:

- A short description of behavior changed.
- Commands run, especially `npm run check` and `npm run build`.
- Screenshots for UI changes.
- Notes for simulation balance changes, including any changed defaults.

## Architecture Notes

The simulation should not know React exists. Keep `src/sim/` reusable for future server-authoritative simulation, replay, or experiments. Persistence is local-only and uses Node’s experimental `node:sqlite`; expect the warning during backend startup.
