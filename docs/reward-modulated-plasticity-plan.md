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

These gates apply to both milestones.

- Learned state must be separate from the inherited genome during an agent's lifetime.
- Decision-making must consume effective values through a single helper path, not scattered `base + delta` math in UI, persistence, uniqueness, and runtime code.
- Plasticity settings must be agent traits, not global learning constants.
- Plasticity settings must be sanitized as expressed values: finite numbers, probabilities in `[0, 1]` where applicable, and no hidden logit/log/exp gene transforms.
- Safety clamps must prevent invalid numeric state without imposing narrow behavioral opinions.
- Reward, learning, reproduction, mutation, uniqueness, persistence, and inspection should each remain in focused modules. Do not create a generic learning framework abstraction.
- Tests should cover pure helpers directly before relying on long simulation runs.

## Milestone 1: Lifetime Plasticity

Goal: a living spawner can learn during its own lifetime, and those learned deltas affect future decisions without yet being inherited by children.

### 1. Define Learned Experience State

Add a learned overlay for connection weights and neural biases. The overlay should support all active neural value types that can affect behavior, including input-to-hidden, recurrent, hidden-to-hidden, hidden-to-output, input-to-output, output biases, and hidden gate biases.

Exit gates:
- Every connection and learnable bias has a stable key that can map to a learned delta.
- New agents start with empty or zero learned deltas.
- Learned deltas can be cloned, sanitized, decayed, clamped, and measured without touching rendering or persistence code.
- Pure tests prove empty deltas leave effective values equal to base genome values.
- Pure tests prove nonzero deltas change effective values and remain finite after sanitization.

### 2. Add Plasticity Profile Traits

Add per-agent plasticity settings that control learning behavior. At minimum, include weight learning rate, bias learning rate, positive reward multiplier, negative reward multiplier, reproduction reward strength, experience decay rate, max learned delta, and eligibility decay or trace strength if traces need persistence.

Exit gates:
- Founder agents receive a valid plasticity profile.
- Plasticity profile values are stored on the agent or genome model in a place that reproduction can inherit and mutate later.
- Sanitization keeps probabilities in `[0, 1]`, rates non-negative, caps positive, and all values finite.
- Existing saved genomes normalize to a valid default plasticity profile.
- Tests cover default profile creation, legacy normalization, and invalid value repair.

### 3. Route Forward Pass Through Effective Values

Update RNN evaluation so decisions use inherited base values plus learned deltas. This must apply to all learnable weights and biases, including recurrent/internal paths.

Exit gates:
- With zero deltas, fixed forward-pass snapshots remain unchanged.
- With a targeted learned delta, the expected output changes in a deterministic unit test.
- Hidden-state alignment still works with effective recurrent values.
- Runtime code uses a shared effective-genome/effective-value helper rather than duplicating delta math.
- Long-run tests show no `NaN`, `Infinity`, or invalid hidden state values.

### 4. Capture Decision Traces

At action time, capture enough information to apply reward-modulated updates later. Traces should include the effective input vector, hidden activations, previous hidden state where needed for recurrent links, output activations, chosen direction, strength, horizon, cooldown, reproduce output, and the food/reproduction event that will receive feedback.

Exit gates:
- Every spawned food can be linked back to the decision trace that created it.
- Trace storage is bounded and old traces are removed after resolution or expiry.
- Traces do not include future market values.
- Tests prove a food marker resolves to the same trace that spawned it.
- Packet sizes and roster summaries do not include full traces.

### 5. Apply Reward-Modulated Learning From Food Resolution

When food resolves, convert payoff into a bounded learning signal and update learned deltas using the saved trace. Positive payoff should reinforce contributing pathways; negative payoff should weaken or redirect them. The teaching signal should be normalized or clipped so one lucky or unlucky event cannot numerically dominate the brain.

Exit gates:
- Positive payoff produces a deterministic learned-delta change in the expected direction.
- Negative payoff produces a deterministic learned-delta change in the opposite direction.
- Payoff normalization/clipping is tested for small, large, positive, negative, and zero payoff.
- Updates apply to all intended weight classes, including recurrent and hidden/internal connections.
- Learned delta norms remain below the configured safety cap.
- Food payoff, energy, health, win/loss counts, and rolling loss behavior remain semantically unchanged except for later decisions being affected by learning.

### 6. Apply Reproduction Learning Feedback

Successful birth should produce a positive learning event. The world should still charge reproduction cost, but the learning system should treat successful reproduction as a biologically valuable outcome.

Exit gates:
- A successful reproduction event applies a bounded positive learning signal.
- Reproduction cost still subtracts energy exactly as before.
- Reproduction feedback is connected to the relevant reproduce-output trace or recent decision state.
- Tests cover reproduction learning enabled and disabled through plasticity settings.
- Agents cannot create children when existing population, energy, or probability rules fail.

### 7. Apply Experience Decay And Safety Clamps

Each tick, learned deltas should decay according to the agent's plasticity profile and then be clamped to computationally safe bounds.

Exit gates:
- Decay rate `0` preserves learned deltas.
- Positive decay reduces learned-delta magnitude over time.
- Learned deltas never exceed the max learned-delta safety cap after updates or decay.
- Extreme plasticity settings do not create invalid numbers in long-run tests.
- A long generated run with learning enabled advances a fixed tick count without runtime errors.

### 8. Add Minimal Telemetry And UI Indicators

Expose enough information to confirm that learning is happening without turning the roster into a full inspector. Suggested summary values: learned delta norm, recent learning signal, plasticity learning rates, decay rate, and reproduction learning count.

Exit gates:
- Selected-spawner details show learned delta norm and key plasticity values.
- RNN inspection can show learned state summary without rendering all deltas yet.
- Roster packets remain lean and do not include full learned-delta maps.
- UI labels clearly distinguish inherited genome, learned experience, and effective brain.
- Help text states that agents now learn during life through reward-modulated updates.

### 9. Persist Learned Runtime State

Persist learned deltas and plasticity profiles in state/genome snapshots so historical inspection can reconstruct the active brain used during a run.

Exit gates:
- Persistence packets include learned deltas or a versioned learned-state payload.
- Saved runs can load a spawner with nonzero learned deltas.
- Historical inspection can report learned delta norm and plasticity profile.
- Legacy saved runs without learned state still load with zero deltas and default plasticity.
- Persistence tests cover new-run round trip and legacy normalization.

### Milestone 1 Exit Gates

- A controlled test proves one agent's decision output changes after a resolved reward because of learned deltas.
- Food-resolution learning, reproduction learning, decay, and safety clamps are each covered by focused tests.
- A long generated run with learning enabled completes without invalid numbers, trace leaks, or unbounded learned state.
- `npm run check`, `npm run test:sine`, and `npm run build` pass.
- UI smoke test confirms selected-spawner learning summaries render without console errors.
- Children may have plasticity profiles, but learned deltas are not yet folded into child genomes in this milestone.

## Milestone 2: Evolutionary Integration And Analysis

Goal: learned experience becomes part of inheritance, plasticity itself evolves, and uniqueness/inspection/history reflect the effective brain.

### 1. Implement Model A Inheritance

At reproduction, fold the parent's learned deltas into the parent genome values first, then run the existing mutation process on that effective genome. The child starts with zero learned deltas.

Exit gates:
- Child base genome reflects parent base values plus inherited learned deltas before mutation.
- Child learned-delta state starts at zero.
- Existing topology, perception, horizon, cooldown, threshold, and mutation-profile mutations still run after fold-in.
- Tests prove inherited learned deltas affect child base weights.
- Tests prove learned deltas are not double-counted across parent and child.

### 2. Make Plasticity Fully Mutable

Plasticity profile values should drift and mutate per agent during reproduction, using the same philosophy as mutable perception and mutation profile: direct expressed values, independent mutation, broad but safe bounds.

Exit gates:
- Children inherit parent plasticity profile before mutation.
- Each plasticity trait can mutate independently.
- Plasticity values stay finite and within computational safety bounds.
- Mutation-profile and plasticity-profile responsibilities are clearly separated or deliberately grouped with documented naming.
- Tests prove plasticity traits drift over generations.

### 3. Update Uniqueness To Use Effective Weights

Uniqueness should compare the brain the agent is actually using. Weight and bias features must use base plus learned deltas. Architecture, perception, mutation-profile, and plasticity-profile features should remain explicit vector dimensions where behaviorally meaningful.

Exit gates:
- Two agents with identical base genomes but different learned deltas can receive different raw uniqueness distances.
- Weight-derived uniqueness features use effective values.
- The uniqueness vector version is bumped.
- Modal/help/docs explain that uniqueness uses the effective brain.
- Tests cover effective-weight uniqueness and vector-version change.

### 4. Upgrade RNN Inspector For Base / Learned / Effective Values

Inspection should make learned experience visible at the connection and unit level. For a selected connection or bias, show base value, learned delta, and effective value.

Exit gates:
- Live RNN inspector shows base, learned, and effective values for selected connections.
- Unit gate view shows base, learned, and effective gate bias values where applicable.
- Historical inspector can show the same fields for saved learned states.
- Values shown in inspector match the effective values used by the forward pass.
- UI remains readable at desktop and mobile widths.

### 5. Update Persistence And Historical Queries For Effective Brain Analysis

Saved analysis should support questions about learning, not just base genomes. Store or reconstruct effective values for inspection, uniqueness snapshots, and high-value summaries.

Exit gates:
- Historical RNN inspection reconstructs effective brain values from saved base genome and learned state.
- Uniqueness snapshots are based on effective values at the saved comparison tick.
- Saved-run analysis can report learned delta norm over time or at final tick.
- Legacy runs remain readable and clearly show zero/unavailable learned state.
- DB writes remain bounded and do not store full learned state every frame.

### 6. Update Documentation And Help

Explain the new model in user-facing language and contributor-facing language.

Exit gates:
- Help page explains inherited genome, learned experience, effective brain, reward-modulated learning, reproduction learning, decay, and Model A inheritance.
- README or EXPERIENCE explains that children inherit the parent's effective learned brain through mutation and start with no learned overlay.
- Relevant directory READMEs document where plasticity, learned deltas, traces, and effective-value helpers live.
- Docs do not imply full RL, backpropagation, or active trade management.

### 7. Add Comparative Validation Scenarios

Add tests or scripts that let us compare learning settings without relying on anecdotes.

Suggested scenarios:
- learning off vs learning on
- reproduction learning off vs on
- no decay vs moderate decay
- low vs high learning rate
- inheritance off vs Model A inheritance

Exit gates:
- At least one deterministic test or script can run paired settings from the same seed.
- Output includes survival ticks, final population, wins/losses, reproduction count, learned delta norm, and uniqueness raw-distance summary.
- The comparison tooling does not change live simulator behavior.
- Results are labeled clearly enough to avoid claiming statistical significance from a single seed.

### Milestone 2 Exit Gates

- Model A inheritance is active and covered by tests.
- Plasticity traits mutate per agent and are visible in inspection.
- Uniqueness uses effective weights and has a bumped vector version.
- Live and historical RNN inspection show base, learned delta, and effective values.
- Saved runs round-trip learned state and effective-brain inspection.
- Comparative validation can run learning on/off and inheritance on/off scenarios.
- `npm run check`, `npm run test:sine`, `npm run build`, and `git diff --check` pass.
- Playwright smoke checks cover live selection, RNN inspection, uniqueness modal, and historical inspection without console errors.
