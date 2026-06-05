# Sine TODO

Concise roadmap for the Toy Market / Sine module only. Detailed implementation plans should live outside this file.

## Validation & Benchmarks

- Add random baseline agents that obey the same costs, horizons, cooldowns, and population rules as evolved spawners.
- Add heuristic baseline agents:
  - momentum
  - mean reversion
  - volatility-gated timing
  - random direction with timing awareness
- Add statistical comparison views:
  - evolved vs random payoff distribution
  - evolved vs heuristic performance
  - survival by architecture
  - payoff by market regime
  - trained-regime vs tested-regime generalization matrix
- Add explicit validation splits for headless runs:
  - early/mid/late performance
  - last-N-trade performance
  - performance decay or improvement over time
  - sample-size-adjusted confidence scores

## Seed Bank

- Build seed-bank selection around market conditions, not agent similarity alone.
- Segment headless runs into market windows.
- Compute market-only feature vectors per window:
  - volatility
  - trend
  - range
  - roughness / choppiness
  - autocorrelation
  - drawdown / run-up
  - transition score
  - normalized amplitude structure
- Cluster or embed market windows into regime regions.
- Map each trade to the market window available at trade entry to avoid lookahead bias.
- Build agent-by-regime performance metrics:
  - trades
  - hit rate
  - average payoff
  - cumulative payoff
  - payoff volatility
  - drawdown
  - horizon / strength mix
- Select seed-bank candidates by market coverage:
  - top specialists per regime cluster
  - robust generalists across multiple clusters
  - enough redundancy per cluster
  - caps or penalties for lineage concentration
- Cluster agent uniqueness vectors before using uniqueness for seed-bank diversity. Distance from the median alone is not enough when the population is multimodal or non-normal; preserve cluster membership, cluster density, nearest-neighbor structure, and outlier status separately.
- Store feature-vector and cluster-version metadata for auditability.

## Market Regime Analysis

- Add market-regime labels for post-run analysis.
- Keep market embeddings market-only; do not use agent payoff or behavior to define regimes.
- Support both:
  - descriptive regime labels for post-run research
  - causal regime labels for live reseeding, using only past/current market data
- Keep amplitude-invariance goals explicit when designing regime features.
- Add visual regime overlays to headless run analysis once regime windows exist.

## Agent Performance Analysis

- Add per-agent drawdown, losing streaks, and risk-adjusted payoff metrics.
- Add per-agent performance timelines beyond aggregate hit rate/payoff.
- Add regime-conditioned performance summaries in the selected-agent drawer.
- Add lineage concentration metrics to show when one family dominates a run.
- Add cluster or regime coverage summaries before any agent is saved to the seed bank.
- Replace median-distance-only uniqueness interpretation with cluster-aware diversity summaries, so an agent can be recognized as typical within a rare cluster, redundant within an overpopulated cluster, or a true structural outlier.

## Agent Mechanics Audits

- Decide whether evolved opportunity agents own the full trade pipeline or only spawn candidate opportunities for another agent layer to execute or reject.
- If opportunity agents are not full-pipeline traders, define their reward boundary: raw opportunity quality, downstream trader benefit, or a hybrid.
- Keep sizing and portfolio allocation conceptually separate unless deliberately folded into a later agent layer.
- Re-audit the agent input contract after the pipeline boundary is decided.
- Explore dynamic trade-management inputs and decisions:
  - after entering a trade with horizon `x`, allow re-evaluation at one or more fractions of `x`
  - let the responsible agent decide whether to exit early or continue holding
  - define what state is passed back in, such as unrealized payoff, elapsed-horizon ratio, remaining horizon, current signal move, and updated market context
  - decide whether this belongs to the opportunity agent, a separate execution agent, or a later risk/portfolio layer
- Consider additional market inputs:
  - volatility regime features
  - liquidity / spread proxies if available
- Continue auditing whether the new volume and RSI inputs add useful signal or mostly duplicate existing ROC-shape inputs.
- Re-audit the strength output and confirm incentives are aligned with payoff, cost, and survival.
- Re-audit health and energy semantics:
  - what each bar means
  - how each affects death and reproduction
  - whether both remain useful
- Re-audit learning equations and confirm payoff scaling, transaction cost, and reward feedback are conceptually aligned.
- Re-audit initial brain defaults:
  - hidden unit count
  - input connections per unit
  - output connections per output
  - new-unit initial wiring
- Consider a complexity penalty if larger brains dominate without producing better validated performance.

## Simulation & Runtime

- Keep headless mode and live UI mode using the same simulation engine and config contracts.
- Revisit Lab vs headless persistence after the DB/write-model benchmark:
  - The current benchmark shows headless slowness is dominated by simulation advance/core compute, not raw SQLite writes.
  - That means "avoid writing richer Lab data for speed" is not a strong enough reason by itself.
  - The stronger long-term goal is for saved Lab runs and headless runs to produce one analyzable dataset shape, so the same run-analysis UI can work across both.
  - Richer Lab capture still has costs beyond SQLite write time: worker-to-main packet size, structured clone / serialization, API payload size, browser memory pressure, UI responsiveness, DB growth, and later query cost.
  - Before restructuring DBs, prototype richer Lab persistence behind a measured path or feature flag.
  - The prototype should capture the same kinds of agent/trade/lifecycle records that headless runs save, then measure packet size, request time, SQLite write time, UI responsiveness, DB growth, and saved-run query cost.
  - Do not duplicate headless recorder logic in Lab. Generalize the recorder/sink model so both modes share capture definitions, with Lab allowed to use a lighter or throttled transport if needed.
  - Treat compute optimization as the main speed workstream; treat persistence unification as an analysis-quality and architecture-simplification workstream.
- Continue profiling runtime bottlenecks at realistic population sizes.
- Track recorder and DB write overhead separately from simulation-step overhead.
- After `docs/plans/sine-simplification-performance-plan.md` is implemented, re-profile the hot paths from scratch and decide whether any remaining numeric kernel is worth moving to WASM/Rust or a native addon. Treat this as a targeted kernel decision, not a full duplicate simulation engine.
- Watch for seed-bank analysis jobs that should run post-run rather than inside the simulation loop.

## UI & Inspection

- Keep the headless analysis UI focused on real, explainable metrics.
- Avoid placeholder “candidate” labels until the seed-bank selection algorithm exists.
- Add Agent Strategy Space visualization:
  - X: recent average horizon
  - Y: recent long/short directional bias
  - color: rolling average payoff
  - size: energy
  - opacity: resolved trade sample size
  - trail: recent movement
  - click agent: opens inspector
  - filters: lineage, alive/dead, min trades, selected run
- Add clear views for:
  - validation splits
  - regime-conditioned performance
  - lineage concentration
  - selected-agent architecture snapshots
  - selected-agent trade ledger

## Refactor

- Do not rewrite the whole Sine codebase from scratch. Preserve the existing deterministic tests, parity checks, and edge-case behavior around learning, food/trade resolution, historical inspection, headless writes, and market inputs.
- Rebuild the simulation core around a compact deterministic runtime model:
  - compact numeric runtime state
  - public inspection DTOs
  - persistence DTOs
  - genome/editor/inspection model
  - materialize rich objects only at UI, persistence, and analysis boundaries
- Make the runtime more numeric and batchable before revisiting WASM/native/GPU work. Sequence:
  - compact runtime data
  - reduce materialization
  - benchmark again
  - identify narrow kernels
  - then consider WASM/native
- Define one canonical run-history data model for Lab and headless runs:
  - core run facts
  - lifecycle facts
  - trade facts
  - reconstruction snapshots
  - optional rich analysis facts
  - derived metrics computed outside the DB unless expensive enough to cache
- Keep the run-history principle explicit: write facts, derive metrics. Avoid storing arbitrary derived stats that can drift from code definitions.
- Separate the agent brain from the trading strategy lifecycle:
  - neural/evolution engine
  - market signal engine
  - trade lifecycle engine
  - population/lifecycle engine
  - analysis/persistence engine
- Reduce the lingering spawner/food metaphor where it blocks future trading features, but avoid a premature rename that destabilizes working contracts.
- Move diagnostics into a reusable analysis domain:
  - server/query layer returns canonical raw analysis facts
  - shared pure analysis functions compute metrics
  - UI components render metric groups
  - chart geometry/rendering remains reusable
- Replace scattered compatibility accumulation with explicit versioned boundaries:
  - genome schema
  - persistence packet schema
  - run-history schema
  - worker packet schema
  - saved settings schema
- Keep compatibility code in migration/normalization modules. Runtime code should assume current-contract data.
- Highest-value long-term refactor: compact deterministic simulation core with explicit boundary DTOs for UI, persistence, and analysis.
- Second-highest long-term refactor: coherent facts-and-derived-metrics run-history/analysis architecture for Lab, Runs, diagnostics, seed-bank preparation, and validation.

## Future Architecture

- Decide the long-term agent ecology:
  - full-pipeline evolved trading agents
  - opportunity-spawning agents plus separate execution agents
  - opportunity-spawning agents, execution agents, and allocation/risk agents
- Add the second ecological layer: eating/trader agents that choose whether to consume spawner opportunities.
- Eventually make spawner reward depend on trader benefit, not only raw marker payoff.
- Let traders evolve trust/distrust toward spawner lineages.
- Add more realistic sizing and risk mechanics:
  - position sizing
  - exposure limits
  - stop-loss / take-profit equivalents
  - delayed execution
  - limited capital
  - drawdown penalties

## Superseded Or Partially Done

- Toy Market headless batch mode exists; continue improving analysis rather than treating batch mode as unstarted.
- Reproduction is now an agent output.
- Population scarcity reproduction pressure is implemented; continue verifying edge cases.
- Transaction cost exists; continue auditing whether fee/slippage semantics are correct.
- Mutable perception, payoff scale, and trading-policy traits exist.
- Volume and RSI perception traits exist; continue validating whether they improve generalization.
- Direct hidden generator truth was removed from agent inputs; keep this constraint for future inputs.
- New-unit initial wiring now has a minimum valid connection count; continue testing topology edge cases.
- ROC-to-price display/reward concerns are partly superseded by BTC candle support and signal-relative payoff logic.
