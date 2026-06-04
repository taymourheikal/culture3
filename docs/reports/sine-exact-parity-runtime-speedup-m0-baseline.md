# Sine Exact-Parity Runtime Speedup Milestone 0 Baseline

Milestone: `docs/plans/sine-exact-parity-runtime-speedup-plan.md` Milestone 0.

## Goal

Lock down current runtime behavior and speed before implementing exact-parity speed changes.

Milestone 0 does not change simulation behavior. It adds stricter parity coverage and records the pre-optimization hot-path baseline.

## Machine Context

- Platform: `darwin`
- Architecture: `arm64`
- Node: `v24.14.0`
- CPU model: `Apple M1 Pro`
- CPU count reported by Node: `10`
- Memory reported by Node: `17179869184`

## Benchmark Command

The baseline benchmark was run with the M2 hot-path shape:

```bash
npx tsx scripts/sineRuntimeHotPathBenchmark.ts \
  --ticks 200 \
  --populations 100,250,500 \
  --scenarios baseline,mostly-waiting,high-action,high-reproduction \
  --brain-iterations 10 \
  > /tmp/sine-exact-parity-m0-hotpath-baseline.json
```

The benchmark writes JSON to `/tmp` and does not touch production DBs.

## Baseline Results

| Scenario | Pop | Ticks/s | Avg tick ms | Top phases | Actions | Births | Avg pending | Avg retained | Avg due |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 100 | 102.497 | 9.756 | brainEvaluation 737.0; learnedStateDecay 455.5; spawnerContextInputConstruction 335.2 | 855 | 0 | 67.680 | 463.135 | 4.020 |
| baseline | 250 | 42.467 | 23.548 | brainEvaluation 1857.1; learnedStateDecay 1193.3; spawnerContextInputConstruction 653.6 | 1892 | 0 | 149.000 | 1055.725 | 8.930 |
| baseline | 500 | 20.554 | 48.652 | brainEvaluation 3798.7; learnedStateDecay 2517.3; planLookup 1334.9 | 3664 | 0 | 292.305 | 2042.800 | 17.285 |
| mostly-waiting | 100 | 211.787 | 4.722 | brainEvaluation 409.0; spawnerContextInputConstruction 258.7; marketInputResolve 252.1 | 0 | 0 | 0.000 | 0.000 | 0.000 |
| mostly-waiting | 250 | 81.206 | 12.314 | brainEvaluation 1106.9; spawnerContextInputConstruction 621.1; marketInputResolve 604.3 | 0 | 0 | 0.000 | 0.000 | 0.000 |
| mostly-waiting | 500 | 39.410 | 25.375 | brainEvaluation 2354.5; planLookup 1281.8; spawnerContextInputConstruction 1177.5 | 0 | 0 | 0.000 | 0.000 | 0.000 |
| high-action | 100 | 96.744 | 10.337 | foodResolution 437.5; brainEvaluation 436.4; decisionTraceCapture 374.6 | 10796 | 0 | 860.615 | 6542.665 | 52.145 |
| high-action | 250 | 37.462 | 26.694 | brainEvaluation 1165.7; foodResolution 1086.4; decisionTraceCapture 1000.5 | 25816 | 0 | 2061.900 | 15980.395 | 124.880 |
| high-action | 500 | 18.126 | 55.169 | brainEvaluation 2390.9; foodResolution 2279.9; decisionTraceCapture 2071.0 | 50428 | 0 | 4088.180 | 31366.325 | 243.460 |
| high-reproduction | 100 | 73.338 | 13.635 | brainEvaluation 1178.6; planLookup 484.7; learnedStateDecay 435.8 | 0 | 100 | 0.000 | 0.000 | 0.000 |
| high-reproduction | 250 | 27.731 | 36.061 | brainEvaluation 3115.6; planLookup 1262.4; spawnerContextInputConstruction 1169.1 | 0 | 250 | 0.000 | 0.000 | 0.000 |
| high-reproduction | 500 | 13.717 | 72.902 | brainEvaluation 6119.2; planLookup 2574.3; learnedStateDecay 2499.1 | 0 | 500 | 0.000 | 0.000 | 0.000 |

## Strict Parity Harness

Added strict runtime digest support:

- `src/sine/testing/strictWorldDigest.ts`

Added exact-parity tests:

- `scripts/sine-tests/exactParity.test.ts`

Registered the suite in:

- `scripts/testSine.ts`

The new coverage checks:

- strict digest detects hidden-state numeric drift
- strict digest detects learned-state missing/different values
- strict digest detects food order changes
- strict digest detects event order changes
- strict digest detects trace activation numeric drift
- normal worlds are deterministic under strict digest
- high-action worlds are deterministic under strict digest and include non-empty learned deltas
- headless chunk sizes `10`, `25`, `100`, and `1000` produce identical strict runtime digests
- same-tick food resolution order, event order, death/liveness effect, trace deletion, and learning deltas are characterized

## Milestone 0 Gate Audit

### Step 1: Capture Current Speed Baselines

- Benchmark command, seed, ticks, populations, scenarios, and machine context are recorded above.
- Results include ticks/sec, average tick ms, top phases, action counts, birth counts, pending food, retained food, due food, and trace-derived action counts.
- The pre-change table above can be used by later milestones.
- Benchmark output is written to `/tmp/sine-exact-parity-m0-hotpath-baseline.json`.
- The benchmark script is runtime-only and does not write to production DBs.

### Step 2: Add Strict Runtime Digest Coverage

- `strictWorldDigest()` records unrounded fields for learned state, hidden state, food/trade order and values, lineage counts, spawner stats, traces, and recent events.
- Exact-parity tests mutate digest copies to prove changed hidden state, learned state, food order, event order, and trace activation values fail equality.
- Existing rounded `worldDigest()` tests remain unchanged.
- Tests cover both normal and high-action worlds.
- High-action strict digest coverage includes non-empty learned deltas.

### Step 3: Add Cross-Chunk Parity Coverage

- Headless chunk sizes `10`, `25`, `100`, and `1000` are compared with strict digests.
- The chunk list covers API/interactivity-sized chunks and the pure headless default.
- Timing/progress fields are excluded because the digest compares final simulation world state only.
- Existing cancellation and progress tests remain in `scripts/sine-tests/headless.test.ts`.
- Existing headless recorder parity tests remain in place.

### Step 4: Add Same-Tick Food Resolution Characterization

- Same-tick food tests characterize current array-order resolution.
- The test covers a first same-tick food killing a creator before the later same-tick food can credit that creator.
- Living and dead creator policy is asserted through `resolvedCount`, `losses`, energy, and trace deletion/retention.
- Event order and `world.foods` order are asserted.
- Learning delta and recent learning signal are asserted exactly for the first same-tick resolved food.

## Verification

Commands run:

```bash
npm run check
npx tsx -e "import('./scripts/sine-tests/exactParity.test.ts').then(async ({tests}) => { for (const t of tests) { await t.run(); console.log('PASS', t.name); } })"
npm run test:sine
```

All passed.

`npm run build` was not run because Milestone 0 touched test/docs/runtime-testing support only; it did not touch UI/browser/server integration behavior.
