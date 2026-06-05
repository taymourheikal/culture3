# Sine Housekeeping And Runtime Cleanup Plan

This plan addresses the selected housekeeping audit findings:

1. Consolidate benchmark scripts.
2. Reduce repeated numeric/parsing helper logic.
3. Remove repeated per-learning connection-map construction.

The goal is codebase simplicity and architectural cleanliness first, with one narrow runtime hot-path opportunity in learning. Functional parity is mandatory.

## Non-Goals

- Do not unify the Lab saved-run UI and headless analysis UI in this plan.
- Do not perform DB/storage cleanup, vacuuming, archiving, or retention work in this plan.
- Do not rename Sine/Toy Market/module paths or update naming docs in this plan.
- Do not change simulation behavior, reward/payoff logic, transaction-cost handling, reproduction rules, death rules, mutation, learning formulas, market inputs, brain evaluation semantics, uniqueness semantics, or persistence schemas.
- Do not create broad cross-domain utility frameworks shared with Ant World.
- Do not force browser benchmark code to import Node-only script helpers.
- Do not hide SQL behind vague generic abstractions.
- Do not redesign the UI or change CSS class names.

## Architecture Gates

These gates apply to every milestone.

- Keep one canonical Sine runtime engine.
- Keep browser, server, script, and runtime dependencies clean:
  - `src/sine` must not import server modules.
  - server modules must not import React/UI modules.
  - script helpers must not become runtime dependencies unless explicitly browser-safe.
- Prefer narrow, domain-shaped helpers over generic utility bags.
- Extract shared code only where semantics are actually identical.
- Keep compatibility at boundaries: API clients, repository facades, row parsers, packet builders, and public DTO materializers.
- Do not add permanent old/new duplicate implementations.
- Any runtime speed path must call the same canonical formula or prove exact output through tests.
- `npm run check` must pass after each accepted milestone.
- `npm run test:sine` must pass after runtime, diagnostics, repository, or API changes.
- `npm run build` must pass after UI, worker protocol, API client, or shared frontend changes.

## Milestone 1: Benchmark And Utility Foundations

Goal: reduce benchmark-script duplication and repeated script-local helper logic without changing benchmark semantics or production runtime behavior.

This milestone should stay mostly in `scripts/`. Shared helpers may import pure Sine runtime/types where already done by benchmark scripts, but production runtime modules should not import script helpers.

### 1. Audit Benchmark Script Duplication

Audit overlapping logic in:

- `scripts/sineRuntimeHotPathBenchmark.ts`
- `scripts/sinePerf.ts`
- `scripts/sinePhaseBenchmark.ts`
- `scripts/sineBrowserPerf.ts`
- `scripts/sineApiLatencyBenchmark.ts`
- `scripts/sineLabPersistenceSmokeBenchmark.ts`
- `scripts/sineLabPersistenceWriteBenchmark.ts`
- `scripts/sineHeadlessConcurrencyBenchmark.ts`

Classify repeated helpers as:

- Node benchmark helper
- browser-safe benchmark helper
- script-specific logic that should remain local

Exit gates:

- Repeated `parseArgs`, `readInteger`, `round`, percentile, timing-bucket, trace-instrumentation, and scenario-definition sites are listed.
- Browser `page.evaluate()` constraints are documented before extraction.
- Production runtime files are not changed in this step.
- No benchmark behavior changes are made in this step.

### 2. Extract Node Benchmark Helpers

Create a small helper folder, for example `scripts/sine-benchmark/`, for Node benchmark helpers:

- CLI option parsing primitives
- integer/list readers
- round/percentile helpers
- timing bucket collection and summaries
- trace instrumentation creation and summaries
- shared Sine benchmark scenario definitions where the configs are truly identical

Exit gates:

- `scripts/sineRuntimeHotPathBenchmark.ts` uses the shared timing and trace helpers.
- `scripts/sinePhaseBenchmark.ts` uses the shared CLI/timing helpers.
- At least one persistence/API/headless benchmark uses the shared CLI/numeric helper where it fits cleanly.
- No browser-only benchmark is forced to import Node-only helpers.
- Top-level JSON keys for `sineRuntimeHotPathBenchmark.ts` remain unchanged.
- Existing benchmark scenario values are unchanged where shared.

### 3. Keep Browser Benchmark Sharing Narrow

Evaluate whether `sineBrowserPerf.ts` can share browser-safe scenario definitions or trace instrumentation. If sharing makes `page.evaluate()` harder to read or couples browser code to Node helpers, leave it local and document the reason.

Exit gates:

- Any shared browser benchmark helper lives in a browser-safe location or is not added.
- `sineBrowserPerf.ts` still runs in the browser context without Node-only imports.
- If browser benchmark logic remains inline, the report states why this is intentional.
- No benchmark worker/pool behavior is changed.

### 4. Add Benchmark Smoke Verification

Run representative short benchmark commands after extraction.

Required smoke commands:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts --ticks 5 --populations 10 --scenarios baseline --brain-iterations 1
npx tsx scripts/sinePhaseBenchmark.ts --ticks 5 --initial-spawners 10 --max-spawners 10
```

Run additional touched benchmark scripts with minimal options where practical.

Exit gates:

- Smoke commands exit successfully.
- `sineRuntimeHotPathBenchmark.ts` output still contains `ok`, `settings`, `results`, and `brainProfiles`.
- Timing bucket summaries still include calls/count/total/max fields.
- No production runtime behavior changes are introduced.

## Milestone 1 Exit Gates

- Node benchmark helper duplication is materially reduced.
- Browser benchmark code is either safely shared or intentionally left local.
- Benchmark smoke commands pass.
- `npm run check` passes.
- No simulation, persistence, UI, or server API contract changes are introduced.

## Milestone 2: Learning Hot-Path Cleanup

Goal: remove repeated per-learning active-connection `Map` construction while preserving learning formulas and exact deterministic parity.

Current target:

- `src/sine/spawner/learning.ts` rebuilds `new Map(activeConnections(spawner.genome).map(...))` inside `applyLearningSignal()`.

This milestone should reuse the existing compiled brain plan rather than introducing a new cache. The compiled plan is already the canonical topology cache with signature protection against in-place topology mutation.

### 1. Characterize Current Learning Lookup Semantics

Write or strengthen focused tests before changing lookup logic.

Required cases:

- public trace learning
- compact trace learning
- missing activation
- trace innovation id not present in the current genome
- disabled connection or disabled unit is ignored
- output-bias updates for long/short/strength
- gate-bias updates for hidden targets
- reproduction learning with `skipActionOutputBias`

Exit gates:

- Tests prove current learned-state deltas for the cases above.
- Tests cover both public and compact trace activation shapes.
- No production lookup code is changed before characterization is in place.
- `npm run test:sine` passes before the refactor.

### 2. Add Plan-Level Active Connection Access

Extend `CompiledBrainPlan` with a direct, deterministic active connection access path.

Preferred shape:

- `activeConnections: ConnectionGene[]`, aligned with `activeConnectionIds`
- helper such as `activeConnectionForInnovation(plan, innovationId)`

Do not add learned-state or effective-value caches.

Exit gates:

- `activeConnections` is built from the same `createGenomeIndex()` active connection list as existing compiled plan fields.
- `activeConnectionIds[index]` matches `activeConnections[index].innovationId`.
- `connectionIndexByInnovationId` still maps each active innovation id to its aligned index.
- Existing brain plan cache signature behavior is unchanged.
- Brain plan tests cover active connection alignment.

### 3. Route Learning Through Compiled Plan Lookup

Update `applyLearningSignal()` to resolve trace connection ids through `ensureCompiledBrainPlan(spawner.genome)` and the new plan helper.

Exit gates:

- `applyLearningSignal()` no longer builds `new Map(activeConnections(...))` per learning application.
- `rg "new Map\\(activeConnections" src/sine/spawner` returns no matches.
- Learning formulas are unchanged.
- Missing/stale/disabled trace connection behavior is unchanged.
- No duplicate learning loop is introduced.
- Public learned-state maps remain canonical.

### 4. Verify Learning Parity And Runtime Impact

Run contract checks and a hot-path benchmark focused on high-action/high-resolution workloads.

Required commands:

```bash
npm run check
npm run test:sine
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,high-action,high-reproduction \
  --brain-iterations 10
```

Exit gates:

- Strict digest parity passes for baseline, high-action, and high-reproduction.
- Brain outputs are unchanged.
- Learned-state updates are unchanged.
- Food/trade resolution and event order are unchanged.
- Benchmark reports whether the lookup cleanup improves total runtime, food resolution, or learning-adjacent phases.
- If benchmark timing is flat, the change is retained only if the code is simpler and no total-runtime regression appears.

## Milestone 2 Exit Gates

- Repeated per-learning active-connection `Map` construction is removed.
- Compiled brain plan remains the only topology cache used for this lookup.
- Learning formulas and learned-state updates are exactly unchanged.
- Strict digest parity passes.
- `npm run check` passes.
- `npm run test:sine` passes.
- Hot-path benchmark results are documented.

## Final Verification

After all accepted milestones:

- Run `npm run check`.
- Run `npm run test:sine`.
- Run `npm run build`.
- Run short smoke commands for refactored benchmark scripts.
- Run the Milestone 2 hot-path benchmark command.
- Confirm no browser/server/script import-boundary violations were introduced.
- Confirm no out-of-scope Lab/headless UI unification, DB cleanup, or naming rename work was introduced.
- For each milestone, classify the result as cleanup, simplification, speedup, narrowed, or rejected.

## Final Exit Gates

- Benchmark helper duplication is reduced without changing benchmark semantics.
- Learning connection lookup is simpler and avoids per-application map rebuilds.
- Functional parity is preserved across simulation, learning, persistence, and benchmark contracts.
- Any measured speedup or flat result is documented honestly.
