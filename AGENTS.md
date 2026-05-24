# Repository Guidelines

## Project Structure & Module Organization

- `src/ant/sim/`: Emergent Ant World deterministic simulation core. Keep React, DOM, and persistence out of this layer.
- `src/ant/client/`, `src/ant/render/`, `src/ant/App.tsx`: Ant World React UI, canvas rendering, batch visualizations, parameter panels, and persistence client.
- `src/sine/`: standalone Toy Market Simulator frontend and food-spawner RNN/NEAT-like logic. It is intentionally separate from Ant World.
- `server/`: local HTTP API, SQLite repositories, and worker-thread batch job orchestration.
- `scripts/runBatch.ts`: headless Ant World batch runner.
- `scripts/testSine.ts`: Toy Market contract tests.
- `data/`: generated SQLite files, screenshots, and experiment outputs; do not treat as source.
- `index.html` serves Ant World; `sine.html` serves Toy Market.

## Build, Test, and Development Commands

- `npm run dev`: starts Vite and the SQLite API. Vite may choose another port if needed.
- `npm run dev:client`: starts only the frontend.
- `npm run dev:server`: starts the SQLite API in watch mode on `127.0.0.1:8787`.
- `npm run start:server`: starts the SQLite API without watch mode.
- `npm run check`: runs TypeScript project checks.
- `npm run test:sine`: runs Toy Market simulator/RNN contract tests.
- `npm run build`: type-checks and builds both frontends into `dist/`.
- `npm run sim:batch -- --runs 100 --ticks 5000 --out data/batch.json`: runs headless Ant World simulations.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, `camelCase` for values/functions, and `PascalCase` for React components and exported types. Prefer domain types in `src/ant/sim/types.ts` and `src/sine/spawner/types.ts`. Centralize tunable defaults and bounds; avoid duplicated slider limits.

Keep simulation cores deterministic where practical. UI components should call typed APIs rather than reaching into simulation internals.

## Testing Guidelines

Before handing off changes, run:

```bash
npm run check
npm run test:sine
npm run build
```

Use Playwright for visual/layout checks when changing charts, sidebars, or canvas behavior. For simulation mechanics, add focused contract tests near `scripts/testSine.ts`.

## Commit & Pull Request Guidelines

Recent commits use concise imperative messages, for example `Add project README` and `Expand experience guide`. Keep that style.

Pull requests should include behavior changed, commands run, screenshots for UI changes, and notes for changed simulation defaults or reward logic.

## Architecture Notes

Ant World batch runs are server-backed and persisted to `data/ant-world.sqlite`. Toy Market is a separate frontend with its own settings storage, market generator, GRU-like spawner brains, mutation settings, help content, and `data/toy-market.sqlite` persistence. Avoid coupling the two unless explicitly requested.
