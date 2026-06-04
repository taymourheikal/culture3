# Mutable Perception And Evolvability Plan

This plan splits the Toy Market Simulator refactor into two milestones. Milestone 1 changes the simulation model. Milestone 2 makes the new model inspectable, persistent, and understandable. The guiding rule is to keep the implementation small, explicit, and domain-shaped: genomes own inherited traits, the world owns environment rules, and UI surfaces explain only what the simulator actually uses.

## Non-Goals

- Do not change reward, payoff, transaction cost, sizing, death, or reproduction eligibility rules.
- Do not add brain/computation energy costs in this refactor.
- Do not make energy ratio or health ratio scaling mutable.
- Do not use hidden transform genes such as logits or exponentiated stddev genes.
- Do not allow invalid simulation values: mutation rates remain probabilities, stddevs remain non-negative finite values, and lag/window values remain finite integers in `0-1000`.

## Simplicity And Architecture Gates

These gates apply across both milestones. They are part of the definition of done, not optional cleanup.

- Genome compatibility must be centralized in `normalizeSpawnerGenomeForCurrentContract()`. Fallbacks such as `genome.perception ?? ...` or `genome.mutationProfile ?? ...` should not appear throughout runtime, UI, uniqueness, mutation, or persistence code.
- Perception rules should live in one focused module, such as `src/sine/spawner/perception.ts`. It should own defaults, sanitization, founder randomization, mutation, input-window helpers, and compact summaries.
- Mutation-profile rules should live in one focused module, such as `src/sine/spawner/mutationProfile.ts`. It should own defaults, sanitization, continuous drift, founder initialization, and compact summaries.
- Environment config should define starting defaults, founder randomization breadth, safety limits, and world rules. Actual inherited perception and mutation traits should live in the genome.
- Runtime logic should consume normalized genomes. Hot paths such as market input construction and genome mutation should not contain old-genome compatibility branches.
- Sidebar controls should either remain flat `SpawnerConfig` fields or use a small reusable nested-control helper. Do not add one-off nested slider handling for each field.
- Roster packets should remain summaries. Full perception and mutation-profile details should stay in on-demand inspector payloads.
- New semantic contracts should be versioned explicitly where they affect interpretation, including the input contract and uniqueness vector.
- New logic should be exposed through small pure helpers that can be tested directly, not only through long simulation runs.
- Do not introduce a generic evolution framework abstraction. Keep modules named around Toy Market concepts: perception, mutation profile, market inputs, genome mutation, and genome normalization.

## Milestone 1: Core Evolution Model

Goal: agents functionally evolve what they perceive and how their descendants mutate, while the simulator remains stable.

### 1. Add Perception And Mutation-Profile Model Helpers

Create focused modules for perception and mutation-profile rules before wiring them into the genome.

Perception helpers should own defaults, sanitization, founder randomization, mutation, input-window helpers, and compact summaries. Mutation-profile helpers should own defaults, sanitization, continuous drift, founder initialization, and compact summaries.

Exit gates:
- Perception defaults, sanitization, founder randomization, mutation, and summaries are exposed through one focused module.
- Mutation-profile defaults, sanitization, drift, founder initialization, and summaries are exposed through one focused module.
- Pure-helper tests cover perception sanitization, founder randomization, perception mutation, mutation-profile sanitization, and mutation-profile drift.
- No hot runtime path depends on the new helpers yet.

### 2. Define The New Genome Shape

Add explicit genome sections for `perception` and `mutationProfile`.

Perception should include five delta lag pairs, rolling mean/volatility window, local scale/range window, trend window, cycle window, roughness sensitivity, and pending density scale. Mutation profile should include per-agent rates/stddevs for topology, weights, biases, perception, horizons, cooldowns, threshold bias, and mutation-profile drift.

Exit gates:
- New genomes contain `perception` and `mutationProfile`.
- Existing weight, unit, connection, bias, horizon, cooldown, and threshold genes remain intact.
- Old genomes can be normalized to the new shape without throwing.
- `normalizeSpawnerGenomeForCurrentContract()` returns a complete current genome shape, including perception, mutation profile, output bias count, and valid input-contract assumptions.
- Runtime code that mutates, forwards, inspects, or scores genomes does not scatter fallback checks for missing perception or mutation-profile fields.
- A search for compatibility fallbacks around `perception` and `mutationProfile` shows those fallbacks live only in normalization/default helpers.

### 3. Maintain Compatibility

Normalize old 15-input genomes and old genomes missing perception/mutation-profile fields. Do this in a single compatibility path rather than scattering fallback logic across the app.

Exit gates:
- Old saved spawners can still be inspected.
- Old genomes receive default perception and mutation-profile fields.
- No runtime code needs to special-case missing genome fields after normalization.
- Live inspection, historical inspection, uniqueness scoring, mutation, and forward-pass paths all receive normalized genomes through one compatibility path.

### 4. Move To A 16-Input Contract

Add the fifth relative ROC delta input. Keep input slot meanings fixed after this change.

New input shape:
1. Relative ROC
2. Relative ROC delta pair 1
3. Relative ROC delta pair 2
4. Relative ROC delta pair 3
5. Relative ROC delta pair 4
6. Relative ROC delta pair 5
7. Relative mean ROC
8. Relative rolling volatility
9. Position in local range
10. Relative trend slope
11. Relative residual volatility
12. Relative roughness
13. Relative cycle rate
14. Pending density
15. Energy ratio
16. Health ratio

Exit gates:
- `INPUT_COUNT` is `16`.
- Founder genomes and normalized historical genomes have compatible input wiring.
- Old 15-input genomes can forward-pass without any input-16 connections.
- New founder genomes can create legal connections from input 16.
- Tests cover the new label order and count.

### 5. Randomize Founder Perception

Founder agents should start near defaults but not identically. Add a user-facing founder perception randomization breadth setting.

Defaults should remain understandable, such as delta pairs around `0-3`, `3-7`, `7-13`, `13-27`, and `27-53`, with each endpoint allowed to vary independently.

Exit gates:
- Breadth `0` creates founder perception values at defaults.
- Higher breadth creates varied founder perception values.
- Lags and windows remain finite integers in `0-1000`.

### 6. Make Market Inputs Per-Agent

The market input builder should accept an agent's perception settings. Agents at the same market tick may receive different input values because their lag pairs and windows differ.

Exit gates:
- Two agents with different perception settings can receive different market-derived inputs on the same tick.
- The input builder still returns 14 non-energy/health inputs before agent state is appended.
- Expired-history lookups are avoided for valid perception settings.

### 7. Expand Mutation Behavior

During reproduction, mutate the child genome's perception traits and mutation-profile traits in addition to the existing RNN topology/weight/bias/horizon/cooldown/threshold traits.

Mutation rates remain direct expressed probabilities in `[0, 1]`. At most one mutation of each mutation type happens per birth. Evolvability traits drift every generation.

Exit gates:
- Children inherit parent perception and mutation profile before mutation.
- Perception parameters can change independently from parent to child.
- Mutation-profile values drift continuously each generation.
- Rates stay in `[0, 1]`; stddevs stay finite and non-negative.
- Lag/window values are repaired only to physically valid, computationally safe integers in `0-1000`.
- Direct expressed values are stored and displayed; no hidden logit/log/exp gene transforms are introduced.
- `genomeMutate.ts` delegates perception and mutation-profile rules to focused helpers instead of defining those rules inline.
- Mutation behavior reads per-agent mutation-profile traits wherever the trait is meant to be inherited; global config is used only for world safety/defaults.

### 8. Add Sidebar Controls For Defaults

Add UI controls for default founder perception values and founder perception randomization breadth. Add controls for default founder mutation-profile values where needed.

Keep controls grouped like the existing Toy Market sidebar patterns, with save buttons per group.

Exit gates:
- User can edit and save founder perception defaults.
- User can edit and save founder randomization breadth.
- Reset/start-new-world applies the saved defaults.
- The settings implementation is intentionally shaped: either nested defaults are supported cleanly, or new defaults are represented as flat config fields by deliberate design.
- Control metadata, bounds, storage sanitization, and help text stay in sync for every new setting.
- New controls use the existing group/save/sanitize pattern or a small reusable extension of it.

### 9. Validate Simulation Stability

Add focused tests for the new core behavior.

Exit gates:
- Tests prove the 16-input contract.
- Tests prove per-agent input differences.
- Tests prove founder randomization breadth.
- Tests prove perception mutation and mutation-profile drift.
- Long-run tests contain no `NaN`, `Infinity`, invalid lags, invalid rates, or invalid stddevs.
- A generated run with at least 250 spawners advances a fixed tick count without expired timeline sample lookups or invalid numeric state.
- Market input history access is bounded by the `1000`-tick perception maximum plus the timeline's retained sample policy.
- `npm run check`, `npm run test:sine`, and `npm run build` pass.
- Refactor review searches are clean for unintended duplication: `rg "perception \\?\\?|mutationProfile \\?\\?"`, `rg "INPUT_COUNT"`, `rg "buildMarketInputs"`, and `rg "addUnitRate|weightMutationRate|biasMutationRate"`.

## Milestone 2: Interpretability, History, And Analysis

Goal: users can understand, inspect, compare, and preserve the new evolutionary machinery.

Amendment note: Milestone 1 and its follow-up bug fixes already completed some Milestone 2 foundations. The 16-input labels are wired into the architecture graph, roster packets already include several mutation summaries, persistence round-trips `perception` and `mutationProfile` through genome JSON, and uniqueness scoring now uses `functional-genome-v5` with perception, mutation-profile, plasticity-profile, and effective learned weight/bias dimensions. Milestone 2 is therefore narrowed from "add the model everywhere" to "surface the model clearly, verify historical display, update docs, and avoid duplicating completed runtime work."

### 1. Upgrade The RNN Inspector

The inspector should show the selected agent's current perception settings and full mutation profile alongside the existing architecture view.

The architecture graph already shows the 16 fixed input labels and high-level mutation summaries. This step should add the missing expressed values: actual delta lag pairs, rolling/local-scale/trend/cycle windows, local-scale sample step, roughness sensitivity, pending density scale, and individual mutation rates/stddevs.

Exit gates:
- A selected live agent shows perception and mutation-profile details.
- A selected historical agent shows the same perception and mutation-profile details after load.
- The existing 16 input labels remain correct in architecture views.
- No raw/internal-only compatibility fields leak into the UI.
- `mutationStd` does not reappear as an active UI concept; it remains compatibility-only if still present in old genome structures.
- Inspector reads normalized genome data and does not duplicate perception/mutation-profile calculation logic.
- Inspector detail formatting uses shared helpers where useful, rather than recomputing compact summaries in component code.

### 2. Add Roster Summaries

Add the missing compact roster-level perception summaries so users can spot unusual sensory strategies without opening the full inspector. Mutation summaries already exist in the packet and partially in the selected-agent details, so this step should refine labels rather than introduce another mutation-summary path.

Examples: average delta lag, longest perception window, pending-density scale, or perception mutation rate.

Exit gates:
- Roster remains visually stable and uncluttered.
- Each summary maps to a real genome value.
- Cards do not overlap or jitter.
- Roster packets remain lean: they do not include full genomes, full perception profiles, or full mutation profiles.
- Detailed perception and mutation-profile values remain on-demand through inspection.
- Roster summaries use shared compact-summary helpers rather than recomputing perception/mutation-profile meaning in UI code.
- Existing mutation-summary fields are reused or relabeled; no duplicate mutation-summary calculations are added.

### 3. Update Help Page

Explain mutable perception and mutable evolvability in simple terms.

The Help page already describes the 16 inputs and mutable perception at a high level. This step should tighten the explanation of mutable evolvability: input slots stay fixed, but lag/window values inside those slots can mutate; each agent also carries mutation-profile values that influence how its children vary. It should also state that energy/health input scales, reward accounting, death rules, and brain costs are not part of this change.

Exit gates:
- Help page accurately describes the 16 inputs.
- Help page distinguishes world rules from inherited traits.
- Help page explains why bad perception settings are allowed to fail naturally.
- Help page explains mutable mutation profiles without implying backpropagation; lifetime learning is reward-modulated learned deltas, not a full training loop.
- Help page does not mention removed or compatibility-only concepts such as `pendingDensityDivisor` or active `mutationStd`.

### 4. Persist And Load New Genome Fields

Persistence tests already show that new runs preserve `perception` and `mutationProfile` in saved genome JSON, and legacy genome JSON normalizes to the current shape. This step should focus on historical UI display and keeping the persistence contract covered by tests.

Exit gates:
- Existing persistence tests continue to prove new runs save and load perception fields.
- Existing persistence tests continue to prove new runs save and load mutation-profile fields.
- Historical inspector displays those fields.
- Persistence tests cover round-trip reconstruction.
- No DB schema migration is required because current JSON round-trip tests preserve the fields; revisit only if a future query requirement needs indexed field-level access.
- Historical reconstruction normalizes old JSON payloads that lack perception or mutation-profile fields.
- Persistence code stores and retrieves genome JSON without duplicating field-level perception/mutation-profile mapping unless a schema migration is explicitly required.
- Historical inspection reports normalized current-contract genome data, not raw legacy payload shape.

### 5. Update Uniqueness Scoring

Uniqueness scoring already includes perception, mutation-profile, and plasticity-profile traits in `functional-genome-v5`. This step should verify and explain that behavior rather than add a second uniqueness path.

Use expressed values, not hidden or compatibility artifacts.

Exit gates:
- Uniqueness vector includes perception dimensions.
- Uniqueness vector includes mutation-profile dimensions.
- Feature explanations can identify perception or mutation-profile traits as similarity/difference drivers.
- `FUNCTIONAL_GENOME_VECTOR_VERSION` remains explicitly asserted as `functional-genome-v5` for this contract.
- Existing uniqueness tests pass with updated expected dimensions.
- Uniqueness uses expressed trait values and shared summary/helper functions where possible.
- Add or keep a focused test where altered perception and/or mutation-profile values can appear in the most similar/most different feature explanations.

### 6. Update Documentation

Update repo docs to describe the new model at a high level.

Exit gates:
- `EXPERIENCE.md` describes mutable perception and evolvability.
- `README.md` is updated if its Toy Market overview would otherwise be stale.
- Any relevant `src/sine/README.md` or subdirectory README reflects the new genome/input model.
- Documentation does not claim reward/risk/sizing normalization has been implemented.
- Documentation explains that Toy Market still uses tick-based time for horizons, cooldowns, history windows, and RNN perception.
- Documentation avoids describing completed Milestone 1 work as planned future work.

### 7. Validate UI And Historical Analysis

Add or extend tests and browser checks for the interpretability layer.

Exit gates:
- Live inspector works for current-generation and later-generation agents.
- Historical inspector works for newly saved runs.
- Roster summaries render cleanly.
- Roster packet size remains bounded and does not grow with full genome/perception detail.
- Roster packets continue to carry compact summaries only, while full genome/perception/mutation-profile data is requested through inspection.
- Browser/manual verification confirms the architecture modal, uniqueness modal, roster, and historical inspector still fit without overlap after the new displayed fields are added.
- `npm run check`, `npm run test:sine`, and `npm run build` pass.

## Final Acceptance Gate

The full assignment is complete only when:

- New simulations use 16 inputs.
- Agents inherit and mutate perception.
- Agents inherit and mutate mutation profiles.
- Founders can be randomized around defaults using a saved UI setting.
- The simulator remains numerically stable.
- Users can inspect live and historical perception/mutation-profile traits.
- Uniqueness accounts for perception and evolvability.
- Docs and Help explain the model accurately.
- Reward, payoff, sizing, death, reproduction eligibility, and brain-cost behavior remain outside this refactor.
- Compatibility, perception, mutation-profile, summary, and validation logic remain centralized rather than duplicated across UI, worker, persistence, and simulation modules.
