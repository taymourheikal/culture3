# Ant World Client UI

This directory contains the React UI for Emergent Ant World.

## Main Areas

- `useLiveWorld.ts`: browser-side live simulation loop, rendering bridge, selection, and persistence status.
- `ParameterPanel.tsx`, `parameterFields.ts`, `parameterStorage.ts`: editable environment/agent defaults and local saved settings.
- `AgentsPanel.tsx`: lineage count and per-lineage neural settings.
- `LineagePanel.tsx`, `AgentInspector.tsx`: selected lineage and selected agent views.
- `PopulationGraph.tsx`: live food and lineage population chart.
- `BatchRunnerView.tsx`, `useBatchJob.ts`, `SavedBatchesPanel.tsx`: server-backed batch execution and saved run loading/deletion.
- `BatchVisualizations.tsx`, `BatchWeightAnalysis.tsx`, `ArchitectureComparison.tsx`, `ArchitectureTTestChart.tsx`: batch result analysis.
- `batch*.ts`, `averagedBrain.ts`, `charts.tsx`: client-side batch analysis helpers.
- `HelpPage.tsx`, `AnalysisHelp.tsx`: user-facing explanations.

## Boundaries

UI can import `../sim` types and pure helpers, but simulation rule changes belong in `src/ant/sim/`. Canvas drawing helpers belong in `src/ant/render/`.

Server communication should stay behind small helper hooks or persistence modules. Avoid scattering raw endpoint calls through visualization components.

## Style Guidance

Ant World should keep its game-like feel: clear lineage colors, dense but readable sidebars, and direct controls. Prefer focused panels over large explanatory text in the live UI.

## Verification

Run:

```bash
npm run check
npm run build
```

Use Playwright or browser screenshots when changing chart layout, sidebars, batch visualizations, or modal-like inspection surfaces.
