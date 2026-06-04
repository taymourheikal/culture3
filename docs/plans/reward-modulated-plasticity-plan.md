# Reward-Modulated Plasticity Plan

This plan adds lifetime learning to Toy Market food-spawner RNNs while preserving the evolutionary model. The target shape is an evolvable plastic brain: agents act with an effective brain made from inherited genome values plus learned lifetime deltas, then successful reproduction folds those learned deltas into the child genome before normal mutation.

Core inheritance model:

```text
effectiveParentGenome = baseGenome + learnedDeltas
childGenome = mutate(effectiveParentGenome, parentMutationProfile, parentPlasticityProfile)
childLearnedDeltas = 0
```

## Non-Goals

- Do not add full actor-critic reinforcement learning.
- Do not add backpropagation through time.
- Do not replace the existing evolutionary reproduction loop.
- Do not remove the real energy cost of reproduction or spawning.
- Do not make position sizing, stops, or active trade management realistic in this refactor.
- Do not add diversity-restocking, seed-bank, or Horned-Lizard Optimization behavior in this refactor.

## Architecture Gates

These gates apply to all milestones.

- Learned state must be separate from the inherited genome during an agent's lifetime. In the current codebase, learned deltas belong on `SpawnerAgent` runtime state, not inside `SpawnerGenome`.
- Heritable plasticity settings belong on `SpawnerGenome`, alongside perception and mutation profile traits, because children inherit and mutate them.
- Decision-making must consume effective values through a single helper path, not scattered `base + delta` math in UI, persistence, uniqueness, and runtime code.
- Plasticity settings must be agent traits, not global learning constants.
- Plasticity settings must be sanitized as expressed values: finite numbers, probabilities in `[0, 1]` where applicable, and no hidden logit/log/exp gene transforms.
- Safety clamps must prevent invalid numeric state without imposing narrow behavioral opinions.
- Reward, learning, reproduction, mutation, uniqueness, persistence, and inspection should each remain in focused modules. Do not create a generic learning framework abstraction.
- Tests should cover pure helpers directly before relying on long simulation runs.
- Trace state should stay runtime-only by default. Chart, roster, stats, persistence, and historical packets must not receive full trace payloads.
- `createEffectiveGenomeView` should remain the single effective-value path and should accept learned state explicitly, e.g. `createEffectiveGenomeView(genome, learnedState?)`.
- Learning-off or zero-learning mode is a validation harness, not the permanent product behavior. It exists to prove plasticity plumbing preserves baseline behavior before learning is enabled.
- Persistence should include indexed learned/plasticity summary columns now, plus JSON payloads for reconstruction. Do not defer DB queryability.
- Uniqueness should keep the existing cadence and population-limit protections after it begins using effective learned weights.

## Milestone 0: Plasticity Scaffold, Indexed Storage, And Parity Harness

Goal: add the data shapes, helper APIs, DB schema support, and safety tests needed for plasticity without changing live simulation behavior.

### 1. Add Pure Plasticity Data Models

Define focused model helpers for `SpawnerLearnedState`, `SpawnerDecisionTrace`, and `SpawnerPlasticityProfile`. Learned state is runtime state. Plasticity profile is heritable genome state. Helpers should cover creation, legacy normalization, cloning, sanitization, norm calculation, decay, and safety clamping.

Exit gates:
- Empty learned state, default plasticity profile, and empty trace stores can be created without a running world.
- Legacy agents/genomes normalize to zero learned state and default plasticity profile.
- Clone/sanitize/norm helpers are covered by focused tests.
- No world behavior changes while all learning values are zero.
- No UI/runtime module imports are introduced into pure model helpers.

### 2. Extend Effective Genome View As A No-Op

Update the effective-value seam to accept optional learned state while keeping base-only behavior unchanged when learned state is missing or zero.

Exit gates:
- `createEffectiveGenomeView(genome)` still returns base values.
- `createEffectiveGenomeView(genome, emptyLearnedState)` still returns base values.
- A targeted learned delta changes only the intended connection, output bias, or gate bias in pure tests.
- Brain, uniqueness, inspection, and historical code can share the same helper without duplicate `base + delta` math.

### 3. Add Learning-Off Parity Harness

Add a validation mode or deterministic fixture where all learning rates/reproduction learning/decay are zero. This is only a safety harness to prove the refactor does not change baseline behavior before learning is enabled.

Exit gates:
- Current deterministic digest still matches exactly with learning disabled: tick, population, births, deaths, spawned/resolved foods, wins/losses, cumulative payoff, and first/last event summaries.
- Packet fixture shapes remain bounded and structured-clone safe.
- Existing world, genome, uniqueness, persistence, worker protocol, and smoke tests still pass with zero learning.
- The docs and UI do not imply learning is permanently disabled.

### 4. Protect Snapshot And Packet Boundaries

Add snapshot builders or sanitizers so runtime trace stores are never copied into events, packets, persistence rows, or historical inspection payloads by accidental `structuredClone(spawner)`. Learned state may be copied only where explicitly intended.

Exit gates:
- Spawn, resolve, reproduction, and death event snapshots do not include trace stores.
- Chart, roster, stats, and uniqueness packets do not include full learned-delta maps or traces.
- State snapshots include learned runtime summaries/payloads only through explicit fields.
- Packet size tests cover a spawner with nonempty learned state and trace history.

### 5. Add Indexed Persistence Schema

Add a required DB migration for learned/plasticity analysis. Store compact indexed summaries for querying and JSON payloads for reconstruction.

Suggested indexed fields:
- learned delta norm
- recent learning signal
- learning update count
- reproduction learning count
- plasticity learning-rate summaries
- plasticity decay/max-delta summaries

Suggested JSON fields:
- learned state payload on state snapshots
- plasticity profile payload on genome/birth snapshots

Exit gates:
- Existing runs migrate without data loss.
- Legacy runs without learned columns load with zero/unavailable learned state.
- New runs save indexed learned/plasticity summaries and JSON reconstruction payloads.
- Historical inspection can reconstruct effective state from DB rows.
- DB writes remain bounded to existing snapshot/event cadence, not animation frames.

## Milestone 1: Lifetime Plasticity

Goal: a living spawner can learn during its own lifetime, and those learned deltas affect future decisions without yet being inherited by children.

### 1. Confirm Milestone 0 Scaffolding And Remove Duplicate Work

Milestone 0 already added `SpawnerLearnedState`, `SpawnerTraceStore`, `SpawnerPlasticityProfile`, default-off plasticity values, effective-value helpers, snapshot boundary protection, and indexed persistence columns. Milestone 1 should use those seams directly instead of redefining the model shapes or adding a second learning state.

Exit gates:
- No second learned-state, trace-store, or plasticity-profile type is introduced.
- Existing Milestone 0 tests for empty learned state, default plasticity, effective values, snapshot stripping, and persistence columns still pass.
- New Milestone 1 code imports the existing plasticity and effective-genome helpers rather than duplicating `base + delta` math.
- Zero-learning mode remains available as a validation harness, and docs do not imply it is the final behavior.

### 2. Add Founder Plasticity Defaults And Controls

Expose founder plasticity defaults through the same spawner config, saved-settings, sidebar, bounds, and help-tooltip pattern used by the rest of the Toy Market spawner controls. These controls set founder/default plasticity values; per-agent plasticity mutation remains Milestone 2.

Required controls:
- weight learning rate
- bias learning rate
- positive reward multiplier
- negative reward multiplier
- reproduction reward strength
- experience decay rate
- max learned delta
- eligibility trace strength

Exit gates:
- `SpawnerConfig`, `DEFAULT_SPAWNER_CONFIG`, config bounds, config sanitization, saved settings, sidebar controls, and tooltips all include the same plasticity keys.
- Founder genomes receive plasticity profiles from the sanitized spawner config, not only from hardcoded constants.
- Existing saved settings that lack these fields load with valid defaults.
- The right sidebar has a dedicated "Learning / Plasticity" group with Save behavior matching other groups.
- Help text explains these controls at a simple user level.
- `npm run check` and focused config/storage tests pass.

### 3. Tighten Effective Genome View For Active Learning

The forward pass already routes through `createEffectiveGenomeView(genome, learnedState?)`. Before learning becomes active, update that seam so learned state is sanitized once per view using the agent genome's `plasticityProfile.maxLearnedDelta`, then reused by every effective weight/bias lookup. This avoids repeated sanitization and ensures the active cap matches the agent's heritable plasticity profile.

Exit gates:
- `createEffectiveGenomeView(genome)` and `createEffectiveGenomeView(genome, emptyLearnedState)` still return base values.
- A nonzero connection, output-bias, or gate-bias delta changes only the intended effective value.
- Learned deltas are clamped by the genome's `plasticityProfile.maxLearnedDelta`, not by an unrelated default cap.
- Fixed forward-pass snapshot tests remain unchanged when learned deltas are zero.
- A targeted learned recurrent/internal delta changes the expected output in a deterministic unit test.
- Runtime code still uses `createEffectiveGenomeView` as the single effective-value path.

### 4. Add Focused Learning Helpers

Create a small learning module for reward-modulated plasticity. It should handle trace creation, payoff-to-learning-signal normalization/clipping, learned-delta updates, reproduction feedback, decay, clamp, and trace cleanup. Keep this domain logic out of rendering, persistence, and worker protocol code.

Exit gates:
- The learning module has pure tests for signal normalization, positive/negative reward direction, zero-rate no-op behavior, decay, clamp, and trace cleanup.
- The module updates connection deltas, output bias deltas, and gate bias deltas through the existing stable delta keys.
- Positive and negative reward multipliers affect the bounded learning signal deterministically.
- A zero learning-rate profile produces no learned-delta changes.
- No UI, worker, persistence, or React imports are introduced into the learning module.

### 5. Capture Minimal Decision Traces

At action time, capture only the data needed for later reward-modulated updates: effective input vector, previous/current hidden values, output activations, chosen action, strength, horizon, cooldown, reproduce output, active connection IDs, and source/target activation values for active connections. Store traces only in the runtime `SpawnerTraceStore`.

Food markers may carry a small `traceId`; they must not embed full traces. Reproduction feedback should use the reproduce-output trace from the same decision tick.

Exit gates:
- Every spawned food has a `traceId` that resolves to the exact decision trace that created it.
- Reproduction attempts can be linked to the current tick's reproduce-output trace without depending on food-resolution state.
- Trace storage is bounded by count and/or expiry, and resolved/expired traces are removed.
- Traces do not include future market values, full genomes, full spawner objects, chart history, or market history.
- Event snapshots, chart packets, roster packets, stats packets, persistence rows, and historical payloads do not include full trace stores.
- Tests prove trace IDs survive food creation and resolution while full traces stay runtime-only.

### 6. Apply Food-Resolution Learning

When food resolves, convert payoff into a bounded learning signal and apply it to the saved trace. Positive payoff should reinforce contributing pathways; negative payoff should weaken or redirect them. Food payoff, energy, health, win/loss counts, and rolling loss should keep their current meanings; only future decisions should change because the learned overlay has changed.

Exit gates:
- Positive payoff produces deterministic learned-delta changes in the expected direction.
- Negative payoff produces deterministic learned-delta changes in the opposite direction.
- Small, large, positive, negative, and zero payoff normalization/clipping cases are covered.
- Updates apply to all intended weight classes: input-to-hidden, recurrent, hidden-to-hidden, hidden-to-output, input-to-output, output biases, and hidden gate biases.
- Learned delta norms remain within the configured max learned-delta cap after the update.
- Food payoff, energy, health, win/loss counts, rolling loss, and event row semantics are unchanged except for later actions affected by learned deltas.

### 7. Apply Reproduction Learning Feedback

Successful birth should produce a bounded positive learning event against the reproduce-output trace from that decision tick. The world still charges reproduction cost and still applies the existing population, energy, and probability eligibility rules.

Exit gates:
- A successful reproduction event increments `reproductionLearningCount` and applies a bounded positive learning signal when reproduction reward strength is nonzero.
- Reproduction cost still subtracts energy exactly as before.
- Tests cover reproduction learning enabled and disabled through plasticity settings.
- Failed population, energy, or probability checks do not apply reproduction reward.
- The reproduction event snapshot still strips full trace stores.
- Children still start with empty learned deltas in Milestone 1.

### 8. Define Tick Order For Learning, Decay, And Decisions

Make the simulation order explicit so learning is deterministic. The intended order is: resolve pending food and apply food-resolution learning, prune dead agents, apply per-tick decay/clamp to living agents, build inputs, evaluate brains, capture traces, spawn food, attempt reproduction and reproduction learning, append newborns, prune again, then record telemetry.

Exit gates:
- World-step code follows the documented order.
- Decay rate `0` preserves learned deltas.
- Positive decay reduces learned-delta magnitude before the next decision.
- Learned deltas never exceed the max learned-delta safety cap after reward updates, reproduction feedback, or decay.
- Extreme plasticity settings do not create `NaN`, `Infinity`, or invalid hidden states in a long generated run.
- A zero-learning deterministic digest still matches the baseline validation fixture.

### 9. Move Live Uniqueness To Effective Values

Once lifetime learning affects decisions, live uniqueness should compare the brain the agent is actually using. Update live uniqueness vector construction to pass each spawner's learned state into `createEffectiveGenomeView`. Full historical effective-brain uniqueness and detailed inspector upgrades remain Milestone 2.

Exit gates:
- Two agents with identical base genomes but different learned deltas can receive different live raw uniqueness distances.
- Weight-derived and bias-derived live uniqueness features use effective values.
- Zero learned deltas produce the same uniqueness vectors as base-only mode.
- Existing uniqueness cadence, on-demand detail behavior, and population-limit skipping remain unchanged.
- The vector version is bumped or documented if feature semantics change.
- Tests cover zero-delta parity and nonzero-delta uniqueness differences.

### 10. Add Minimal Telemetry, UI Indicators, And Help Text

Expose enough information to confirm that learning is happening without turning the roster into a full inspector. Suggested summary values are learned delta norm, recent learning signal, learning update count, reproduction learning count, plasticity learning-rate mean, decay rate, and max learned delta.

Exit gates:
- Selected-spawner details show learned delta norm, recent learning signal, update counts, and key plasticity values.
- RNN inspection can show a learned-state summary without rendering all individual deltas yet.
- Roster packets remain lean and do not include full learned-delta maps.
- UI labels clearly distinguish inherited genome, learned experience, and effective brain.
- Help text states that agents now learn during life through reward-modulated updates, reproduction feedback, and decay.
- The architecture modal remains summary-only for learned state until Milestone 2.

### 11. Validate Persistence Round Trip With Nonzero Learned State

The required DB migration and indexed learned/plasticity columns were added in Milestone 0. Milestone 1 should validate that nonzero learned runtime state flows through the existing state snapshot cadence and can be reconstructed later. Do not add another migration unless implementation reveals a missing field.

Exit gates:
- Persistence packets include nonzero learned-state payloads and learned/plasticity summary fields at the existing state snapshot cadence.
- DB rows populate indexed learned/plasticity summary columns for learning-enabled runs.
- Saved runs can load or inspect a spawner with nonzero learned deltas.
- Historical inspection can report learned delta norm and plasticity profile.
- Legacy saved runs without learned state still load with zero deltas and default plasticity.
- Persistence tests cover nonzero learned-state round trip, legacy normalization, and bounded write cadence.
- DB writes remain bounded to state snapshots and event snapshots, not animation frames.

### Milestone 1 Exit Gates

- A controlled test proves one agent's decision output changes after a resolved reward because of learned deltas.
- A zero-learning parity test proves baseline behavior remains unchanged when all learning values are disabled; this is a validation test, not the intended final behavior.
- Food-resolution learning, reproduction learning, decay, and safety clamps are each covered by focused tests.
- A long generated run with learning enabled completes without invalid numbers, trace leaks, or unbounded learned state.
- Live uniqueness uses effective values for learned agents while preserving zero-delta parity and the existing uniqueness cadence.
- Nonzero learned state persists and reconstructs through the existing state snapshot cadence.
- `npm run check`, `npm run test:sine`, and `npm run build` pass.
- UI smoke test confirms selected-spawner learning summaries render without console errors.
- Children may have plasticity profiles, but learned deltas are not yet folded into child genomes in this milestone.

## Milestone 2: Evolutionary Integration And Analysis

Goal: learned experience becomes part of inheritance, plasticity itself evolves, and uniqueness/inspection/history reflect the effective brain.

### 1. Add Effective Genome Materialization For Inheritance

Create a focused helper that builds a temporary inherited seed genome from a parent genome plus the parent's learned state. This helper should materialize the effective values into a cloned genome without mutating the parent. It should fold in only neural learned deltas: connection weights, output biases, and hidden gate biases. Perception, horizon/cooldown genes, threshold bias, mutation profile, and plasticity profile remain inherited base genes and are mutated by the existing reproduction path.

Suggested helper:

```text
materializeEffectiveGenomeForInheritance(parent.genome, parent.learnedState)
```

Exit gates:
- Parent genome is never mutated by materialization.
- Materialized connection weights equal parent base weights plus learned connection deltas.
- Materialized output biases equal parent base output biases plus learned output-bias deltas.
- Materialized hidden gate biases equal parent base gate biases plus learned gate-bias deltas.
- Learned deltas do not alter perception, horizon/cooldown genes, threshold bias, mutation profile, or plasticity profile.
- Empty learned state produces a materialized genome deep-equal to a sanitized clone of the parent genome.
- Materialization uses `createEffectiveGenomeView` or the same stable effective-value helpers, not duplicate `base + delta` math.

### 2. Implement Model A Reproduction

At reproduction, build the materialized effective parent genome, then run the existing `mutateGenome` process on that materialized genome. The child starts with zero learned deltas and an empty trace store. The parent keeps its base genome and learned state unchanged except for the existing reproduction cost and reproduction-learning update.

Exit gates:
- Child base genome reflects parent effective neural values before ordinary mutation is applied.
- Child learned-delta state starts at zero and does not copy parent learned deltas.
- Existing topology, perception, horizon, cooldown, threshold, mutation-profile, and plasticity-profile mutations still run after effective-genome materialization.
- Tests prove inherited learned deltas affect child base connection weights, output biases, and gate biases.
- Tests prove learned deltas are not double-counted across parent and child.
- Zero learned deltas preserve current reproduction behavior except for the added materialization seam.
- Reproduction event snapshots still strip full trace stores.

### 3. Make Plasticity Fully Mutable

Plasticity profile values should drift and mutate per agent during reproduction, using the same philosophy as mutable perception and mutation profile: direct expressed values, independent mutation, broad but computationally safe bounds. Add an explicit plasticity-drift mechanism rather than hiding plasticity mutation inside unrelated mutation-profile fields. If a single drift stddev is used, name it clearly as plasticity drift; if per-trait drift values are used, keep them on the plasticity side of the model.

Plasticity traits to support:
- weight learning rate
- bias learning rate
- positive reward multiplier
- negative reward multiplier
- reproduction reward strength
- experience decay rate
- max learned delta
- eligibility trace strength

Exit gates:
- Children inherit parent plasticity profile before plasticity mutation.
- Each plasticity trait can mutate independently, with tests that isolate at least one trait at a time.
- Plasticity values stay finite and within computational safety bounds.
- Probability-like values remain in `[0, 1]`; non-negative values remain non-negative; max learned delta remains positive.
- Plasticity mutation uses direct expressed values, not logit/log/exp transforms.
- Mutation-profile and plasticity-profile responsibilities are clearly separated by type names, helper names, and tests.
- Tests prove plasticity traits drift over generations when plasticity drift is enabled and remain unchanged when drift is disabled.

### 4. Extend Uniqueness For Inheritance And Historical Analysis

Milestone 1 already moved live uniqueness to effective learned values. Milestone 2 should finish the analysis layer: confirm uniqueness semantics after Model A inheritance, add behaviorally meaningful plasticity-profile dimensions, and make saved/historical uniqueness explanations clear. Architecture, perception, mutation-profile, and plasticity-profile features should remain explicit vector dimensions where they affect behavior, learning, or future evolvability.

Exit gates:
- Model A inherited values are reflected in child base-genome uniqueness after reproduction.
- Live uniqueness continues to use effective values and remains unchanged from Milestone 1 except where Model A inheritance changes the underlying genome.
- Saved/historical uniqueness snapshots can be interpreted as effective-brain snapshots at their comparison tick.
- Plasticity-profile dimensions are included for traits that affect lifetime learning or inherited future learning.
- The uniqueness vector version is bumped if plasticity dimensions are added or semantics change.
- Modal/help/docs explain whether a displayed uniqueness score is live effective-brain uniqueness or saved historical uniqueness.
- Existing uniqueness cadence, on-demand behavior, and population-limit skipping remain intact.
- Tests prove zero learned deltas preserve the existing uniqueness vector except for the intentional vector-version/dimension change.

### 5. Upgrade RNN Inspector For Base / Learned / Effective Values

Inspection should make learned experience visible at the connection and unit level. For a selected connection or bias, show base value, learned delta, and effective value. The architecture graph should keep using the existing graph model, with learned/effective values added to detail panels rather than duplicating graph layout logic. Use a small detail helper that returns `{ base, learnedDelta, effective }` for connection weights, output biases, and gate biases using the same effective-value path as the forward pass.

Exit gates:
- Live RNN inspector shows base, learned, and effective values for selected connections.
- Output-bias detail shows base, learned, and effective values where output biases are displayed.
- Unit gate view shows base, learned, and effective gate bias values where applicable.
- Historical inspector can show the same fields for saved learned states.
- Values shown in inspector match the effective values used by the forward pass.
- UI remains readable at desktop and mobile widths.
- Connections with no learned delta display `0` learned delta and an effective value equal to base.
- Inspector helpers do not mutate spawner, genome, or learned-state objects.

### 6. Update Persistence And Historical Queries For Effective Brain Analysis

Milestone 0 and Milestone 1 already store learned state, indexed learned/plasticity summaries, and plasticity profile payloads. Milestone 2 should use those existing saved fields to support effective-brain analysis. Do not add a new migration unless a concrete missing field is discovered.

Exit gates:
- Historical RNN inspection reconstructs effective brain values from saved base genome and learned state.
- Uniqueness snapshots are based on effective values at the saved comparison tick.
- Saved-run analysis can report learned delta norm over time or at final tick.
- Legacy runs remain readable and clearly show zero/unavailable learned state.
- DB writes remain bounded and do not store full learned state every frame.
- Historical queries preserve saved-run compatibility by treating missing learned state as an empty learned overlay.
- Saved-run analysis can query indexed learned/plasticity summaries without parsing all snapshot JSON.
- If no schema change is needed, tests explicitly prove the existing schema supports the Milestone 2 inspection and summary queries.

### 7. Update Documentation And Help

Explain the new model in user-facing language and contributor-facing language.

Exit gates:
- Help page explains inherited genome, learned experience, effective brain, reward-modulated learning, reproduction learning, decay, and Model A inheritance.
- README or EXPERIENCE explains that children inherit the parent's effective learned brain through mutation and start with no learned overlay.
- Relevant directory READMEs document where plasticity, learned deltas, traces, and effective-value helpers live.
- Docs do not imply full RL, backpropagation, or active trade management.
- Docs explicitly say only neural learned deltas fold into children; perception and other control genes remain ordinary inherited/mutated genes.

### 8. Add Comparative Validation Scenarios

Add tests or scripts that let us compare learning settings without relying on anecdotes.

Suggested scenarios:
- learning off vs learning on
- reproduction learning off vs on
- no decay vs moderate decay
- low vs high learning rate
- inheritance off vs Model A inheritance
- plasticity drift off vs on

Exit gates:
- At least one deterministic test or script can run paired settings from the same seed.
- Output includes survival ticks, final population, wins/losses, reproduction count, learned delta norm, and uniqueness raw-distance summary.
- The comparison tooling does not change live simulator behavior.
- Results are labeled clearly enough to avoid claiming statistical significance from a single seed.
- The Model A on/off comparison isolates inheritance behavior without also changing lifetime learning rates.

### Milestone 2 Exit Gates

- Effective genome materialization is implemented without mutating parent genomes.
- Model A inheritance is active and covered by tests.
- Plasticity traits mutate per agent and are visible in inspection.
- Uniqueness continues using effective weights and has a bumped vector version if plasticity dimensions or semantics change.
- Live and historical RNN inspection show base, learned delta, and effective values.
- Saved runs round-trip learned state and effective-brain inspection.
- Indexed DB summaries for learned/plasticity state are populated and queryable for new runs.
- Comparative validation can run learning on/off and inheritance on/off scenarios.
- `npm run check`, `npm run test:sine`, `npm run build`, and `git diff --check` pass.
- Playwright smoke checks cover live selection, RNN inspection, uniqueness modal, and historical inspection without console errors.
