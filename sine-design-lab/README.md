# Sine Design Lab

Standalone visual sandbox for exploring Sine UI redesign directions before changing the live simulator.

Run it through the existing dev server:

```bash
npm run dev:client
```

Then open:

```text
http://127.0.0.1:5173/sine-design-lab/index.html
```

For the Workbench prototype, open:

```text
http://127.0.0.1:5173/sine-design-lab/layouts.html
```

Additional Workbench palette copies:

```text
http://127.0.0.1:5173/sine-design-lab/workbench-coastal.html
http://127.0.0.1:5173/sine-design-lab/workbench-olive.html
```

The prototype is static HTML/CSS/JS. It does not import the Sine runtime, worker, persistence, or chart modules.

Included directions:

- Trading Terminal
- Scientific Lab
- Control Room
- Neural Observatory

The Workbench prototype includes contextual entry points for the live app's inspection surfaces:

- RNN Inspector
- Uniqueness Detail
- SQLite Run Browser
- Trade Ledger
- Lineage Explorer
- Agent Performance Timeline
- Mutation Diff Viewer
- Population Composition
- Runtime Diagnostics
